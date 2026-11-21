import { NextRequest, NextResponse } from 'next/server';
import { passRepo } from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  generateApplePassBuffer,
  getApplePassTypeId,
  isAppleWalletConfigured,
  verifyAppleAuthHeader,
} from '@/lib/wallet/apple-wallet-service';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ passTypeId: string; serial: string }> }
) {
  const { passTypeId, serial } = await params;

  if (passTypeId !== getApplePassTypeId()) {
    return new NextResponse(null, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const bundle = await passRepo.getWithCustomerAndMerchantBySerial(supabase, serial);
    if (!bundle) {
      return new NextResponse(null, { status: 404 });
    }

    if (
      !verifyAppleAuthHeader(
        req.headers.get('authorization'),
        bundle.pass.authentication_token
      )
    ) {
      return new NextResponse(null, { status: 401 });
    }

    const updatedAtMs = new Date(bundle.pass.updated_at).getTime();
    const imsHeader = req.headers.get('if-modified-since');
    if (imsHeader) {
      const imsMs = Date.parse(imsHeader);
      if (
        !Number.isNaN(imsMs) &&
        !Number.isNaN(updatedAtMs) &&
        Math.floor(updatedAtMs / 1000) <= Math.floor(imsMs / 1000)
      ) {
        return new NextResponse(null, { status: 304 });
      }
    }

    if (!isAppleWalletConfigured()) {
      return new NextResponse(null, { status: 503 });
    }

    const buffer = await generateApplePassBuffer(
      bundle.customer,
      bundle.pass,
      bundle.merchant,
      bundle.locations
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Last-Modified': new Date(
          Number.isNaN(updatedAtMs) ? Date.now() : updatedAtMs
        ).toUTCString(),
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err) {
    console.error('[Apple PassKit Get Pass Error]:', err);
    return new NextResponse(null, { status: 500 });
  }
}
