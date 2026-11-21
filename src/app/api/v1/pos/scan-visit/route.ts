import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/api/rate-limit';
import { parseJsonBody } from '@/lib/api/validation';
import { verifyPin } from '@/lib/auth/password';
import {
  employeeRepo,
  fraudAlertRepo,
  passRepo,
  PosRpcError,
  transactionRepo,
} from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { triggerApplePassUpdate } from '@/lib/wallet/apple-wallet-service';
import { syncGooglePassStamps } from '@/lib/wallet/google-wallet-service';
import { ScanVisitSchema } from '@/types/domain';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const rateLimit = applyRateLimit(req, 'pos:scan-visit', {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  const parsed = await parseJsonBody(req, ScanVisitSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const {
    merchantId,
    employeePin,
    passSerialNumber,
    ticketNumber,
    amount,
    locationId,
    stampsToAward,
    scannerCoordinates,
  } = parsed.data;

  try {
    const supabase = getSupabaseAdmin();
    const candidates = await employeeRepo.listActiveAuthCandidates(supabase, merchantId);

    let matchedEmployee = null;
    for (const emp of candidates) {
      if (await verifyPin(employeePin, emp.pin_hash)) {
        matchedEmployee = emp;
        break;
      }
    }

    if (!matchedEmployee) {
      const pinRateLimit = applyRateLimit(req, 'pos:scan-visit:bad-pin', {
        limit: 10,
        windowMs: 60_000,
        keySuffix: merchantId,
      });
      if (!pinRateLimit.allowed) {
        return pinRateLimit.response;
      }
      return NextResponse.json(
        { error: 'INVALID_EMPLOYEE_PIN', message: 'PIN de operador inválido o inactivo' },
        { status: 401, headers: rateLimit.headers }
      );
    }

    let scanResult;
    try {
      scanResult = await transactionRepo.processPosScan(supabase, {
        merchantId,
        employeeId: matchedEmployee.id,
        passSerialNumber,
        ticketNumber,
        amount,
        scannerLat: scannerCoordinates?.latitude ?? null,
        scannerLng: scannerCoordinates?.longitude ?? null,
        locationId: locationId ?? null,
        stampsToAdd: stampsToAward,
      });
    } catch (rpcErr: unknown) {
      if (rpcErr instanceof PosRpcError) {
        if (rpcErr.fraudAlertType) {
          try {
            const targetPass = await passRepo.getBySerial(supabase, passSerialNumber, merchantId);
            await fraudAlertRepo.create(supabase, {
              merchantId,
              employeeId: matchedEmployee.id,
              customerId: targetPass?.customer_id ?? null,
              alertType: rpcErr.fraudAlertType,
              severity: rpcErr.fraudAlertType === 'geofence_breach' ? 'high' : 'medium',
              details: {
                passSerialNumber,
                ticketNumber,
                amount,
                message: rpcErr.message,
              },
            });
          } catch (alertErr) {
            console.error('[POS Scan FraudAlert Insert Error]:', alertErr);
          }
        }

        return NextResponse.json(
          { error: rpcErr.code, message: rpcErr.message },
          { status: rpcErr.statusCode, headers: rateLimit.headers }
        );
      }
      throw rpcErr;
    }

    const bundle = await passRepo.getWithCustomerAndMerchantBySerial(
      supabase,
      scanResult.pass_serial_number,
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
          triggerApplePassUpdate(supabase, merchantId, bundle.pass).then((res) => {
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
        transaction: scanResult,
        pass: bundle
          ? {
              id: bundle.pass.id,
              pass_serial_number: bundle.pass.pass_serial_number,
              pass_type: bundle.pass.pass_type,
              current_stamps: bundle.pass.current_stamps,
              total_visits: bundle.pass.total_visits,
              status: bundle.pass.status,
            }
          : {
              id: scanResult.pass_id,
              pass_serial_number: scanResult.pass_serial_number,
              pass_type: scanResult.pass_type,
              current_stamps: scanResult.stamps_current,
            },
        customer: {
          id: scanResult.customer_id,
          full_name: scanResult.customer_name,
          loyalty_tier: scanResult.loyalty_tier,
          custom_reward: scanResult.custom_reward,
        },
        rewardUnlocked: scanResult.reward_ready,
        walletSync,
      },
      { status: 200, headers: rateLimit.headers }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno al procesar escaneo';
    return NextResponse.json({ error: 'POS_SCAN_ERROR', message }, { status: 500 });
  }
}
