// src/app/api/v1/apple/v1/devices/[deviceLibraryId]/registrations/[passTypeId]/[serial]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fideliziaStore } from '@/lib/store/fidelizia-store';

// POST: El iPhone registra su pushToken cuando el cliente agrega el pase a Apple Wallet
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ deviceLibraryId: string; passTypeId: string; serial: string }> }
) {
  const { deviceLibraryId, serial } = await params;
  const authHeader = req.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('ApplePass ')) {
    return new NextResponse(null, { status: 401 });
  }

  const body = await req.json();
  const pushToken = body.pushToken;

  if (!pushToken) {
    return new NextResponse(null, { status: 400 });
  }

  // Guarda el pushToken asociado al serial y deviceLibraryId en el store
  await fideliziaStore.registerAppleDevice(serial, deviceLibraryId, pushToken);

  return new NextResponse(null, { status: 201 });
}

// DELETE: El usuario eliminó la tarjeta de su Apple Wallet
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ deviceLibraryId: string; passTypeId: string; serial: string }> }
) {
  const { deviceLibraryId, serial } = await params;
  await fideliziaStore.unregisterAppleDevice(serial, deviceLibraryId);
  return new NextResponse(null, { status: 200 });
}
