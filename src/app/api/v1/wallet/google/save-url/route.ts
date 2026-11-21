import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyRateLimit } from '@/lib/api/rate-limit';
import { parseJsonBody, parseSearchParams } from '@/lib/api/validation';
import { passRepo } from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  generateGoogleWalletSaveUrl,
  isGoogleWalletConfigured,
} from '@/lib/wallet/google-wallet-service';

export const runtime = 'nodejs';

const SaveUrlPostSchema = z
  .object({
    serialNumber: z.string().trim().min(3).max(100).optional(),
    serial: z.string().trim().min(3).max(100).optional(),
  })
  .refine((v) => Boolean(v.serialNumber || v.serial), {
    message: 'Número de serial requerido',
  });

const SaveUrlQuerySchema = z.object({
  serial: z.string().trim().min(3).max(100),
});

export async function POST(req: NextRequest) {
  const rateLimit = applyRateLimit(req, 'wallet:google:save-url', {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  const parsed = await parseJsonBody(req, SaveUrlPostSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const serial = (parsed.data.serialNumber || parsed.data.serial || '').trim();

  if (!isGoogleWalletConfigured()) {
    return NextResponse.json(
      {
        error: 'WALLET_NOT_CONFIGURED',
        message: 'Google Wallet no está configurado en las variables de entorno del servidor.',
      },
      { status: 503, headers: rateLimit.headers }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const bundle = await passRepo.getWithCustomerAndMerchantBySerial(supabase, serial);
    if (!bundle) {
      return NextResponse.json(
        { error: 'PASS_NOT_FOUND', message: 'Pase no encontrado' },
        { status: 404, headers: rateLimit.headers }
      );
    }

    const saveUrl = await generateGoogleWalletSaveUrl(
      bundle.customer,
      bundle.pass,
      bundle.merchant,
      bundle.locations,
      req.nextUrl.origin
    );

    return NextResponse.json(
      {
        success: true,
        serialNumber: bundle.pass.pass_serial_number,
        saveUrl,
      },
      { status: 200, headers: rateLimit.headers }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Error al generar enlace de Google Wallet';
    return NextResponse.json({ error: 'GOOGLE_SAVE_URL_FAILED', message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const rateLimit = applyRateLimit(req, 'wallet:google:save-url', {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  const parsed = parseSearchParams(req.url, SaveUrlQuerySchema);
  if (!parsed.success) {
    return parsed.response;
  }

  if (!isGoogleWalletConfigured()) {
    return NextResponse.json(
      {
        error: 'WALLET_NOT_CONFIGURED',
        message: 'Google Wallet no está configurado en el servidor.',
      },
      { status: 503, headers: rateLimit.headers }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const bundle = await passRepo.getWithCustomerAndMerchantBySerial(supabase, parsed.data.serial);
    if (!bundle) {
      return NextResponse.json(
        { error: 'PASS_NOT_FOUND', message: 'Pase no encontrado' },
        { status: 404, headers: rateLimit.headers }
      );
    }

    const saveUrl = await generateGoogleWalletSaveUrl(
      bundle.customer,
      bundle.pass,
      bundle.merchant,
      bundle.locations,
      req.nextUrl.origin
    );
    return NextResponse.redirect(saveUrl);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al redirigir a Google Wallet';
    return NextResponse.json({ error: 'GOOGLE_SAVE_URL_FAILED', message }, { status: 500 });
  }
}
