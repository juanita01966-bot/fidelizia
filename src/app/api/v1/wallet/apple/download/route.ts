import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/api/rate-limit';
import { passRepo } from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  generateApplePassBuffer,
  isAppleWalletConfigured,
} from '@/lib/wallet/apple-wallet-service';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const rateLimit = applyRateLimit(req, 'wallet:apple:download', {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  const { searchParams } = new URL(req.url);
  const serial = searchParams.get('serial')?.trim();
  if (!serial) {
    return NextResponse.json(
      { error: 'MISSING_SERIAL', message: 'El parámetro serial es obligatorio' },
      { status: 400, headers: rateLimit.headers }
    );
  }

  if (!isAppleWalletConfigured()) {
    return NextResponse.json(
      {
        error: 'APPLE_WALLET_NOT_CONFIGURED',
        message:
          'Los certificados de Apple Wallet (Pass Type ID, WWDR, Signer Cert/Key) aún no están configurados en el servidor.',
      },
      { status: 503, headers: rateLimit.headers }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const bundle = await passRepo.getWithCustomerAndMerchantBySerial(supabase, serial);
    if (!bundle) {
      return NextResponse.json(
        { error: 'PASS_NOT_FOUND', message: 'Tarjeta no encontrada' },
        { status: 404, headers: rateLimit.headers }
      );
    }

    const buffer = await generateApplePassBuffer(
      bundle.customer,
      bundle.pass,
      bundle.merchant,
      bundle.locations
    );
    const safeFileSerial = bundle.pass.pass_serial_number.replace(/[^a-zA-Z0-9_-]/g, '');

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...rateLimit.headers,
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="${safeFileSerial || 'fidelizia'}.pkpass"`,
        'Last-Modified': new Date(bundle.pass.updated_at).toUTCString(),
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: unknown) {
    console.error('[Apple Download Error]:', err);
    return NextResponse.json(
      { error: 'APPLE_PASS_BUILD_FAILED', message: 'Error al compilar el pase de Apple Wallet' },
      { status: 500 }
    );
  }
}
