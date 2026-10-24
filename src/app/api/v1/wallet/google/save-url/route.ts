// src/app/api/v1/wallet/google/save-url/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fideliziaStore } from '@/lib/store/fidelizia-store';
import { generateGoogleWalletSaveUrl } from '@/lib/wallet/google-wallet-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const serial = body.serialNumber || body.serial;
    const customerName = body.customerName || body.name || 'Cliente VIP Canelo';
    const currentStamps = typeof body.currentStamps === 'number' ? body.currentStamps : 1;

    if (!serial) {
      return NextResponse.json({ error: 'Número de serial requerido' }, { status: 400 });
    }

    let record = await fideliziaStore.getPassWithCustomerBySerial(serial);
    if (!record) {
      // Registrar cliente y pase en el store del servidor automáticamente
      const created = fideliziaStore.registerCustomer({
        fullName: customerName,
        phone: body.phone || '+573000000000',
        passType: 'google',
      });
      created.pass.pass_serial_number = serial;
      created.pass.current_stamps = currentStamps;
      record = { customer: created.customer, pass: created.pass };
    }

    const saveUrl = await generateGoogleWalletSaveUrl(record.customer, record.pass);

    return NextResponse.json({
      success: true,
      serialNumber: serial,
      saveUrl,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al generar enlace de Google Wallet';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const serial = searchParams.get('serial');
  const customerName = searchParams.get('name') || 'Cliente VIP Canelo';
  const stampsParam = searchParams.get('stamps');
  const currentStamps = stampsParam ? parseInt(stampsParam, 10) : 1;

  if (!serial) {
    return NextResponse.json({ error: 'Número de serial requerido' }, { status: 400 });
  }

  let record = await fideliziaStore.getPassWithCustomerBySerial(serial);
  if (!record) {
    // Si no existe en la memoria del servidor, registrarlo al vuelo
    const created = fideliziaStore.registerCustomer({
      fullName: customerName,
      phone: '+573000000000',
      passType: 'google',
    });
    created.pass.pass_serial_number = serial;
    created.pass.current_stamps = currentStamps;
    record = { customer: created.customer, pass: created.pass };
  }

  try {
    const saveUrl = await generateGoogleWalletSaveUrl(record.customer, record.pass);
    return NextResponse.redirect(saveUrl);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al redirigir a Google Wallet';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
