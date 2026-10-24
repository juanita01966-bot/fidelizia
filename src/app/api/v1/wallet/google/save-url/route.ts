// src/app/api/v1/wallet/google/save-url/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fideliziaStore } from '@/lib/store/fidelizia-store';
import { supabaseAdmin } from '@/lib/supabase/server';
import { generateGoogleWalletSaveUrl } from '@/lib/wallet/google-wallet-service';
import { Customer, WalletPass } from '@/types/domain';

async function resolveRecord(serial: string, customerName: string, phone: string, stamps: number): Promise<{ customer: Customer; pass: WalletPass }> {
  // 1. Buscar en store en memoria
  let record = await fideliziaStore.getPassWithCustomerBySerial(serial);
  if (record) return record;

  // 2. Buscar en Supabase
  try {
    const { data: dbPass } = await supabaseAdmin
      .from('wallet_passes')
      .select('*, customers(*)')
      .eq('pass_serial_number', serial)
      .maybeSingle();

    if (dbPass && dbPass.customers) {
      const cust = dbPass.customers as any;
      const mappedRecord = {
        customer: {
          id: cust.id,
          merchant_id: cust.merchant_id,
          phone: cust.phone,
          full_name: cust.full_name,
          birthdate: cust.birthdate || null,
          terms_accepted_at: cust.terms_accepted_at,
          rfm_segment: cust.rfm_segment || 'new',
          created_at: cust.created_at,
          updated_at: cust.updated_at,
        },
        pass: {
          id: dbPass.id,
          customer_id: dbPass.customer_id,
          merchant_id: dbPass.merchant_id,
          pass_type: dbPass.pass_type as any,
          pass_serial_number: dbPass.pass_serial_number,
          push_token: dbPass.push_token || null,
          authentication_token: dbPass.authentication_token || `auth-${dbPass.pass_serial_number}`,
          current_stamps: dbPass.current_stamps,
          total_visits: dbPass.total_visits,
          total_rewards_redeemed: dbPass.total_rewards_redeemed,
          last_visit_at: dbPass.last_visit_at || null,
          status: dbPass.status as any,
          created_at: dbPass.created_at,
          updated_at: dbPass.updated_at,
        },
      };

      // Registrar también en memoria
      fideliziaStore.syncFromRemote({
        customers: [mappedRecord.customer],
        passes: [mappedRecord.pass],
      });

      return mappedRecord;
    }
  } catch (e) {
    console.warn('[SaveUrl] Supabase resolve pass error:', e);
  }

  // 3. Registrar al vuelo si no existe
  const created = fideliziaStore.registerCustomer({
    fullName: customerName,
    phone: phone || '+573000000000',
    passType: 'google',
  });
  created.pass.pass_serial_number = serial;
  created.pass.current_stamps = stamps;
  return { customer: created.customer, pass: created.pass };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const serial = body.serialNumber || body.serial;
    const customerName = body.customerName || body.name || 'Cliente VIP Canelo';
    const currentStamps = typeof body.currentStamps === 'number' ? body.currentStamps : 1;
    const phone = body.phone || '+573000000000';

    if (!serial) {
      return NextResponse.json({ error: 'Número de serial requerido' }, { status: 400 });
    }

    const record = await resolveRecord(serial, customerName, phone, currentStamps);
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
  const phone = searchParams.get('phone') || '+573000000000';

  if (!serial) {
    return NextResponse.json({ error: 'Número de serial requerido' }, { status: 400 });
  }

  try {
    const record = await resolveRecord(serial, customerName, phone, currentStamps);
    const saveUrl = await generateGoogleWalletSaveUrl(record.customer, record.pass);
    return NextResponse.redirect(saveUrl);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al redirigir a Google Wallet';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
