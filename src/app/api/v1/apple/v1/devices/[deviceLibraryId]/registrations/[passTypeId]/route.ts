// src/app/api/v1/apple/v1/devices/[deviceLibraryId]/registrations/[passTypeId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fideliziaStore } from '@/lib/store/fidelizia-store';

// GET: Apple consulta qué seriales han cambiado tras recibir el push APNs
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ deviceLibraryId: string; passTypeId: string }> }
) {
  const { deviceLibraryId } = await params;
  const serialNumbers = await fideliziaStore.getSerialsByDevice(deviceLibraryId);

  if (!serialNumbers || serialNumbers.length === 0) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json({
    lastUpdated: new Date().toISOString(),
    serialNumbers,
  });
}
