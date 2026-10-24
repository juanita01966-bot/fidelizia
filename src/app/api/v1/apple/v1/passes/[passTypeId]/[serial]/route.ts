// src/app/api/v1/apple/v1/passes/[passTypeId]/[serial]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fideliziaStore } from '@/lib/store/fidelizia-store';
import { generateApplePassBuffer } from '@/lib/wallet/apple-wallet-service';

// GET: El iPhone descarga el nuevo archivo binario .pkpass con los sellos actualizados
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ passTypeId: string; serial: string }> }
) {
  const { serial } = await params;
  const authHeader = req.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('ApplePass ')) {
    return new NextResponse(null, { status: 401 });
  }

  const record = await fideliziaStore.getPassWithCustomerBySerial(serial);
  if (!record) {
    return new NextResponse(null, { status: 404 });
  }

  const { customer, pass } = record;
  const alertMessage =
    pass.current_stamps >= 10
      ? '🎉 ¡Completaste 10 sellos (%@)! Reclama tu café de especialidad gratis en Café Canelo.'
      : '☕ ¡Sumaste un sello en Café Canelo! Ahora tienes %@.';

  const buffer = await generateApplePassBuffer(customer, pass, alertMessage);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Last-Modified': new Date().toUTCString(),
    },
  });
}
