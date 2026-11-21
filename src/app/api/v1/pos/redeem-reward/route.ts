import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/api/rate-limit';
import { parseJsonBody } from '@/lib/api/validation';
import { verifyPin } from '@/lib/auth/password';
import {
  employeeRepo,
  merchantRepo,
  passRepo,
  PosRpcError,
  redemptionRepo,
} from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { triggerApplePassUpdate } from '@/lib/wallet/apple-wallet-service';
import { syncGooglePassStamps } from '@/lib/wallet/google-wallet-service';
import { createRedeemRewardSchema, RedeemRewardSchema } from '@/types/domain';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const rateLimit = applyRateLimit(req, 'pos:redeem-reward', {
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  const parsed = await parseJsonBody(req, RedeemRewardSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const { merchantId, passSerialNumber, managerPin, stampsToDeduct, rewardName } = parsed.data;

  try {
    const supabase = getSupabaseAdmin();
    const merchant = await merchantRepo.getById(supabase, merchantId);
    if (!merchant) {
      return NextResponse.json(
        { error: 'MERCHANT_NOT_FOUND', message: 'Comercio no encontrado o inactivo' },
        { status: 404, headers: rateLimit.headers }
      );
    }

    const strictSchema = createRedeemRewardSchema(Math.max(1, merchant.stamps_needed || 10));
    const validatedWithMerchant = strictSchema.safeParse(parsed.data);
    if (!validatedWithMerchant.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Error de validación en los sellos a descontar',
          details: validatedWithMerchant.error.flatten().fieldErrors,
        },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const candidates = await employeeRepo.listActiveAuthCandidates(supabase, merchantId);
    let authorizedManager = null;
    for (const emp of candidates) {
      if ((emp.role === 'manager' || emp.role === 'admin') && (await verifyPin(managerPin, emp.pin_hash))) {
        authorizedManager = emp;
        break;
      }
    }

    if (!authorizedManager) {
      const pinRateLimit = applyRateLimit(req, 'pos:redeem-reward:bad-pin', {
        limit: 8,
        windowMs: 60_000,
        keySuffix: merchantId,
      });
      if (!pinRateLimit.allowed) {
        return pinRateLimit.response;
      }
      return NextResponse.json(
        { error: 'MANAGER_UNAUTHORIZED', message: 'PIN de gerente o administrador inválido' },
        { status: 403, headers: rateLimit.headers }
      );
    }

    let redemptionResult;
    try {
      redemptionResult = await redemptionRepo.redeemReward(supabase, {
        merchantId,
        passSerialNumber,
        managerId: authorizedManager.id,
        stampsToDeduct: stampsToDeduct ?? validatedWithMerchant.data.stampsToDeduct,
        rewardName: rewardName ?? null,
      });
    } catch (rpcErr: unknown) {
      if (rpcErr instanceof PosRpcError) {
        return NextResponse.json(
          { error: rpcErr.code, message: rpcErr.message },
          { status: rpcErr.statusCode, headers: rateLimit.headers }
        );
      }
      throw rpcErr;
    }

    const bundle = await passRepo.getWithCustomerAndMerchantBySerial(
      supabase,
      redemptionResult.pass_serial_number,
      merchantId
    );

    const walletSync: {
      google?: { attempted: boolean; success: boolean; error?: string };
      apple?: { attempted: boolean; success: boolean; sentCount: number; errors?: string[] };
    } = {};

    const syncTasks: Promise<void>[] = [];
    if (bundle) {
      if (bundle.pass.pass_type === 'google') {
        syncTasks.push(
          syncGooglePassStamps(bundle.pass, bundle.merchant, {
            customer: bundle.customer,
            notify: true,
          }).then((res) => {
            walletSync.google = {
              attempted: true,
              success: res.success,
              error: res.error,
            };
          })
        );
      } else if (bundle.pass.pass_type === 'apple') {
        syncTasks.push(
          triggerApplePassUpdate(supabase, merchantId, bundle.pass, {
            title: bundle.merchant.name,
            message: `¡Canjeaste "${redemptionResult.reward_name}"! Te quedan ${redemptionResult.stamps_remaining} sellos.`,
            incrementQuota: false,
          }).then((res) => {
            walletSync.apple = {
              attempted: true,
              success: res.success,
              sentCount: res.sentCount,
              errors: res.errors.length > 0 ? res.errors : undefined,
            };
          })
        );
      }
    }

    if (syncTasks.length > 0) {
      await Promise.allSettled(syncTasks);
    }

    return NextResponse.json(
      {
        success: true,
        redemption: redemptionResult,
        walletSync,
      },
      { status: 200, headers: rateLimit.headers }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno al autorizar canje';
    return NextResponse.json({ error: 'REDEEM_ERROR', message }, { status: 500 });
  }
}
