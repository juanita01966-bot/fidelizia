import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { appleDeviceRepo, passRepo } from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  getApplePassTypeId,
  verifyAppleAuthHeader,
} from '@/lib/wallet/apple-wallet-service';

export const runtime = 'nodejs';

const RegisterBodySchema = z.object({
  pushToken: z.string().trim().min(10, 'pushToken inválido').max(512),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ deviceLibraryId: string; passTypeId: string; serial: string }> }
) {
  const { deviceLibraryId, passTypeId, serial } = await params;

  if (passTypeId !== getApplePassTypeId()) {
    return new NextResponse(null, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const parsed = RegisterBodySchema.safeParse(body);
  if (!parsed.success) {
    return new NextResponse(null, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const pass = await passRepo.getBySerial(supabase, serial);
    if (!pass) {
      return new NextResponse(null, { status: 404 });
    }

    if (!verifyAppleAuthHeader(req.headers.get('authorization'), pass.authentication_token)) {
      return new NextResponse(null, { status: 401 });
    }

    const outcome = await appleDeviceRepo.registerDevice(supabase, {
      deviceLibraryIdentifier: deviceLibraryId,
      pushToken: parsed.data.pushToken,
      passTypeIdentifier: passTypeId,
      serialNumber: pass.pass_serial_number,
    });

    return new NextResponse(null, { status: outcome === 'created' ? 201 : 200 });
  } catch (err) {
    console.error('[Apple PassKit Register Error]:', err);
    return new NextResponse(null, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ deviceLibraryId: string; passTypeId: string; serial: string }> }
) {
  const { deviceLibraryId, passTypeId, serial } = await params;

  if (passTypeId !== getApplePassTypeId()) {
    return new NextResponse(null, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const pass = await passRepo.getBySerial(supabase, serial);
    if (!pass) {
      return new NextResponse(null, { status: 404 });
    }

    if (!verifyAppleAuthHeader(req.headers.get('authorization'), pass.authentication_token)) {
      return new NextResponse(null, { status: 401 });
    }

    await appleDeviceRepo.unregisterDevice(supabase, {
      deviceLibraryIdentifier: deviceLibraryId,
      passTypeIdentifier: passTypeId,
      serialNumber: pass.pass_serial_number,
    });

    return new NextResponse(null, { status: 200 });
  } catch (err) {
    console.error('[Apple PassKit Unregister Error]:', err);
    return new NextResponse(null, { status: 500 });
  }
}
