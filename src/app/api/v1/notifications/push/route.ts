import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/api/rate-limit';
import { parseJsonBody } from '@/lib/api/validation';
import { requireAuth } from '@/lib/auth/session';
import { merchantRepo, passRepo } from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  getAppleWalletDiagnostics,
  triggerApplePassUpdate,
} from '@/lib/wallet/apple-wallet-service';
import {
  getGoogleWalletDiagnostics,
  sendGoogleWalletNotification,
} from '@/lib/wallet/google-wallet-service';
import { PushNotificationSchema, type Customer, type WalletPass } from '@/types/domain';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, ['admin', 'manager']);
  if (auth.response) {
    return auth.response;
  }

  return NextResponse.json({
    status: 'ok',
    googleWallet: getGoogleWalletDiagnostics(),
    appleWallet: getAppleWalletDiagnostics(),
    serverTime: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, ['admin', 'manager']);
  if (auth.response) {
    return auth.response;
  }

  const rateLimit = applyRateLimit(req, 'notifications:push', {
    limit: 30,
    windowMs: 60_000,
    keySuffix: auth.session.merchantId,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  const parsed = await parseJsonBody(req, PushNotificationSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const {
    merchantId: bodyMerchantId,
    segment,
    title,
    body: messageBody,
    customerId,
    serialNumber,
    displayDurationHours,
  } = parsed.data;

  if (bodyMerchantId && bodyMerchantId !== auth.session.merchantId) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: 'No puedes emitir notificaciones para otro comercio' },
      { status: 403, headers: rateLimit.headers }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const merchant = await merchantRepo.getById(supabase, auth.session.merchantId);
    if (!merchant) {
      return NextResponse.json(
        { error: 'MERCHANT_NOT_FOUND', message: 'Comercio no encontrado' },
        { status: 404, headers: rateLimit.headers }
      );
    }

    const cleanTitle = title.trim();
    const cleanMessage = messageBody.trim();

    let targetPasses: Array<WalletPass & { customer: Customer }> = [];

    if (serialNumber) {
      const bundle = await passRepo.getWithCustomerAndMerchantBySerial(
        supabase,
        serialNumber,
        merchant.id
      );
      if (bundle && bundle.pass.status === 'active') {
        targetPasses.push({ ...bundle.pass, customer: bundle.customer });
      }
    } else if (customerId) {
      targetPasses = await passRepo.listActiveByMerchant(supabase, merchant.id, { customerId });
    } else {
      targetPasses = await passRepo.listActiveByMerchant(supabase, merchant.id, { segment });
    }

    if (targetPasses.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'NO_ACTIVE_PASSES',
          message: 'No se encontraron pases activos para el destinatario o segmento seleccionado',
          recipientsCount: 0,
        },
        { status: 404, headers: rateLimit.headers }
      );
    }

    const googlePasses = targetPasses.filter((p) => p.pass_type === 'google');
    const applePasses = targetPasses.filter((p) => p.pass_type === 'apple');

    let googleDelivered = 0;
    let googleQuotaFallbacks = 0;
    let appleDelivered = 0;
    const googleErrors: string[] = [];
    const appleErrors: string[] = [];

    await Promise.allSettled([
      ...googlePasses.map(async (gp) => {
        const res = await sendGoogleWalletNotification(gp, merchant, cleanTitle, cleanMessage, {
          displayDurationHours,
        });
        if (res.success) {
          googleDelivered += 1;
          if (res.quotaFallback) {
            googleQuotaFallbacks += 1;
          }
          await passRepo.recordPushNotification(
            supabase,
            merchant.id,
            [gp.id],
            cleanTitle,
            cleanMessage,
            Boolean(res.incrementedQuota)
          );
        } else if (res.error) {
          googleErrors.push(res.error);
        }
      }),
      ...applePasses.map(async (ap) => {
        const res = await triggerApplePassUpdate(supabase, merchant.id, ap, {
          title: cleanTitle,
          message: cleanMessage,
          incrementQuota: false,
        });
        if (res.success) {
          appleDelivered += 1;
        }
        if (res.errors.length > 0) {
          appleErrors.push(...res.errors);
        }
      }),
    ]);

    const totalDelivered = googleDelivered + appleDelivered;
    const allErrors = [...googleErrors, ...appleErrors];
    const recipientNames = [...new Set(targetPasses.map((p) => p.customer.full_name))].slice(0, 5);

    if (totalDelivered === 0 && allErrors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: allErrors[0],
          recipientsCount: targetPasses.length,
          googleWalletDelivered: googleDelivered,
          appleWalletDelivered: appleDelivered,
          googleQuotaFallbacks,
          details: allErrors,
        },
        { status: 422, headers: rateLimit.headers }
      );
    }

    return NextResponse.json(
      {
        success: true,
        recipientsCount: targetPasses.length,
        googleWalletDelivered: googleDelivered,
        appleWalletDelivered: appleDelivered,
        googleQuotaFallbacks,
        recipientNames,
        warnings: allErrors.length > 0 ? allErrors : undefined,
        message:
          customerId || serialNumber
            ? `Notificación "${cleanTitle}" enviada a ${recipientNames[0] || 'Cliente'}.`
            : `Campaña emitida a ${totalDelivered}/${targetPasses.length} pases digitales.`,
      },
      { status: 200, headers: rateLimit.headers }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al procesar notificación push';
    return NextResponse.json({ error: 'PUSH_ERROR', message }, { status: 500 });
  }
}
