import { NextRequest, NextResponse } from 'next/server';
import { appleDeviceRepo } from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { getApplePassTypeId } from '@/lib/wallet/apple-wallet-service';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ deviceLibraryId: string; passTypeId: string }> }
) {
  const { deviceLibraryId, passTypeId } = await params;

  if (passTypeId !== getApplePassTypeId()) {
    return new NextResponse(null, { status: 204 });
  }

  const { searchParams } = new URL(req.url);
  const rawSince = searchParams.get('passesUpdatedSince')?.trim() || null;

  let normalizedSince: string | null = null;
  if (rawSince) {
    const parsedMs = Date.parse(rawSince);
    if (!Number.isNaN(parsedMs)) {
      normalizedSince = new Date(parsedMs).toISOString();
    }
  }

  try {
    const supabase = getSupabaseAdmin();
    const { serialNumbers, lastUpdated } = await appleDeviceRepo.getSerialsForDevice(supabase, {
      deviceLibraryIdentifier: deviceLibraryId,
      passTypeIdentifier: passTypeId,
      passesUpdatedSince: normalizedSince,
    });

    if (serialNumbers.length === 0) {
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json(
      {
        lastUpdated,
        serialNumbers,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('[Apple PassKit List Serials Error]:', err);
    return new NextResponse(null, { status: 500 });
  }
}
