// src/app/api/v1/passes/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fideliziaStore } from '@/lib/store/fidelizia-store';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const serial = searchParams.get('serial');
    const phone = searchParams.get('phone');

    if (!serial && !phone) {
      return NextResponse.json(
        { error: 'Debes proporcionar un serial o un teléfono' },
        { status: 400 }
      );
    }

    let record = null;

    if (serial) {
      record = await fideliziaStore.getPassWithCustomerBySerial(serial);
    } else if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      const customer = fideliziaStore.customers.find((c) => {
        const cPhone = c.phone.replace(/\D/g, '');
        return cPhone.includes(cleanPhone) || cleanPhone.includes(cPhone);
      });
      if (customer) {
        const pass = fideliziaStore.passes.find((p) => p.customer_id === customer.id);
        if (pass) {
          record = { pass, customer };
        }
      }
    }

    if (!record) {
      return NextResponse.json(
        { error: 'Pase no encontrado' },
        { status: 404 }
      );
    }

    const merchant = fideliziaStore.merchant;
    const stampsNeeded = merchant.stamps_needed || 8;
    const currentStamps = record.pass.current_stamps || 0;
    const rewardUnlocked = currentStamps >= stampsNeeded;
    const rewardDescription = record.customer.custom_reward || merchant.reward_description || 'Premio de Autor';

    return NextResponse.json(
      {
        serial: record.pass.pass_serial_number,
        currentStamps,
        stampsNeeded,
        rewardUnlocked,
        rewardDescription,
        customerName: record.customer.full_name,
        loyaltyTier: record.customer.loyalty_tier || 'bronze',
        totalVisits: record.pass.total_visits || 0,
        lastVisitAt: record.pass.last_visit_at,
        merchantName: merchant.name,
        status: record.pass.status,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al consultar estado de pase';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
