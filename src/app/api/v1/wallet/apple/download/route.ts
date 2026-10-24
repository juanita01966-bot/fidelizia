// src/app/api/v1/wallet/apple/download/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fideliziaStore } from '@/lib/store/fidelizia-store';
import { generateApplePassBuffer } from '@/lib/wallet/apple-wallet-service';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const serial = searchParams.get('serial') || 'PASS-CANELO-001';

  const record = await fideliziaStore.getPassWithCustomerBySerial(serial);
  if (!record) {
    return new NextResponse('Tarjeta no encontrada', { status: 404 });
  }

  try {
    const buffer = await generateApplePassBuffer(record.customer, record.pass);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="${serial}.pkpass"`,
        'Last-Modified': new Date().toUTCString(),
      },
    });
  } catch (err: unknown) {
    console.error('Error al generar .pkpass:', err);
    return new NextResponse('Error al compilar el pase de Apple Wallet', { status: 500 });
  }
}
