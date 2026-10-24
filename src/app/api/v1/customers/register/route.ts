// src/app/api/v1/customers/register/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fideliziaStore } from '@/lib/store/fidelizia-store';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fullName, phone, birthdate, passType = 'google' } = body;

    if (!fullName || fullName.trim().length < 3) {
      return NextResponse.json(
        { error: 'El nombre completo es requerido' },
        { status: 400 }
      );
    }

    if (!phone || phone.trim().length < 7) {
      return NextResponse.json(
        { error: 'Un número de teléfono válido es requerido' },
        { status: 400 }
      );
    }

    const cleanPhone = phone.trim();
    const cleanName = fullName.trim();
    const selectedPassType = passType === 'apple' ? 'apple' : 'google';

    // 1. Registrar en el store central en memoria del servidor
    const localResult = fideliziaStore.registerCustomer({
      fullName: cleanName,
      phone: cleanPhone,
      birthdate: birthdate || null,
      passType: selectedPassType,
    });

    // 2. Persistir en Supabase de forma resiliente
    let customerRecord = localResult.customer;
    let passRecord = localResult.pass;

    try {
      // Obtener o usar el ID del comercio (Café Canelo)
      const { data: merchantData } = (await supabaseAdmin
        .from('merchants')
        .select('id')
        .eq('slug', 'cafe-canelo')
        .maybeSingle()) as { data: any };

      const merchantId = (merchantData?.id as string) || '00000000-0000-0000-0000-000000000001';

      // Verificar si el cliente ya existe por teléfono
      const { data: existingCustomer } = (await supabaseAdmin
        .from('customers')
        .select('*')
        .eq('merchant_id', merchantId)
        .eq('phone', cleanPhone)
        .maybeSingle()) as { data: any };

      let dbCustomerId: string;

      if (existingCustomer) {
        dbCustomerId = existingCustomer.id;
        customerRecord = {
          ...customerRecord,
          id: existingCustomer.id,
          full_name: existingCustomer.full_name,
          phone: existingCustomer.phone,
          rfm_segment: existingCustomer.rfm_segment as any,
          created_at: existingCustomer.created_at,
        };
      } else {
        const { data: newCustomer, error: insertCustErr } = await supabaseAdmin
          .from('customers')
          .insert({
            merchant_id: merchantId,
            phone: cleanPhone,
            full_name: cleanName,
            birthdate: birthdate || null,
            rfm_segment: 'new',
            terms_accepted_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (insertCustErr) {
          console.warn('[Supabase Register Customer Error]:', insertCustErr);
          dbCustomerId = localResult.customer.id;
        } else if (newCustomer) {
          const cust = newCustomer as any;
          dbCustomerId = cust.id;
          customerRecord = {
            ...customerRecord,
            id: cust.id,
            full_name: cust.full_name,
            phone: cust.phone,
            rfm_segment: cust.rfm_segment as any,
            created_at: cust.created_at,
          };
        } else {
          dbCustomerId = localResult.customer.id;
        }
      }

      // Verificar o crear el pase de lealtad en Supabase
      const { data: existingPassData } = await supabaseAdmin
        .from('wallet_passes')
        .select('*')
        .eq('customer_id', dbCustomerId)
        .eq('pass_type', selectedPassType)
        .maybeSingle();

      const existingPass = existingPassData as any;

      if (existingPass) {
        passRecord = {
          ...passRecord,
          id: existingPass.id,
          customer_id: existingPass.customer_id,
          pass_serial_number: existingPass.pass_serial_number,
          current_stamps: existingPass.current_stamps,
          status: existingPass.status as any,
        };
      } else {
        const serialToUse = localResult.pass.pass_serial_number;
        const { data: newPassData, error: insertPassErr } = await supabaseAdmin
          .from('wallet_passes')
          .insert({
            customer_id: dbCustomerId,
            merchant_id: merchantId,
            pass_type: selectedPassType,
            pass_serial_number: serialToUse,
            authentication_token: `auth-${serialToUse}`,
            current_stamps: 1, // Sello de bienvenida
            total_visits: 1,
            total_rewards_redeemed: 0,
            status: 'active',
          })
          .select()
          .single();

        const newPass = newPassData as any;
        if (insertPassErr) {
          console.warn('[Supabase Register Pass Error]:', insertPassErr);
        } else if (newPass) {
          passRecord = {
            ...passRecord,
            id: newPass.id,
            customer_id: newPass.customer_id,
            pass_serial_number: newPass.pass_serial_number,
            current_stamps: newPass.current_stamps,
            status: newPass.status as any,
          };
        }
      }

      console.log(`[Customer Registered in Supabase & Central]: ${customerRecord.full_name} · Serial: ${passRecord.pass_serial_number}`);
    } catch (dbErr) {
      console.warn('[Customer Register DB Exception]:', dbErr);
    }

    return NextResponse.json(
      {
        success: true,
        customer: customerRecord,
        pass: passRecord,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al registrar cliente';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
