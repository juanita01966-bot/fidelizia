// src/app/api/v1/customers/route.ts
import { NextResponse } from 'next/server';
import { fideliziaStore } from '@/lib/store/fidelizia-store';
import { supabaseAdmin } from '@/lib/supabase/server';
import { Customer, WalletPass } from '@/types/domain';

export async function GET() {
  try {
    let customersList: Customer[] = fideliziaStore.customers;
    let passesList: WalletPass[] = fideliziaStore.passes;

    try {
      // 1. Obtener los clientes de Supabase con sus pases
      const { data: dbCustomers, error: custErr } = await supabaseAdmin
        .from('customers')
        .select(`
          id,
          merchant_id,
          phone,
          full_name,
          birthdate,
          terms_accepted_at,
          rfm_segment,
          created_at,
          updated_at,
          wallet_passes (
            id,
            customer_id,
            merchant_id,
            pass_type,
            pass_serial_number,
            push_token,
            authentication_token,
            current_stamps,
            total_visits,
            total_rewards_redeemed,
            last_visit_at,
            status,
            created_at,
            updated_at
          )
        `)
        .order('created_at', { ascending: false });

      if (!custErr && dbCustomers && dbCustomers.length > 0) {
        const mappedCustomers: Customer[] = [];
        const mappedPasses: WalletPass[] = [];

        for (const dc of dbCustomers) {
          mappedCustomers.push({
            id: dc.id,
            merchant_id: dc.merchant_id,
            phone: dc.phone,
            full_name: dc.full_name,
            birthdate: dc.birthdate || null,
            terms_accepted_at: dc.terms_accepted_at,
            rfm_segment: (dc.rfm_segment as any) || 'new',
            created_at: dc.created_at,
            updated_at: dc.updated_at,
          });

          if (Array.isArray(dc.wallet_passes)) {
            for (const dp of dc.wallet_passes) {
              mappedPasses.push({
                id: dp.id,
                customer_id: dp.customer_id,
                merchant_id: dp.merchant_id,
                pass_type: dp.pass_type as any,
                pass_serial_number: dp.pass_serial_number,
                push_token: dp.push_token || null,
                authentication_token: dp.authentication_token || `auth-${dp.pass_serial_number}`,
                current_stamps: dp.current_stamps,
                total_visits: dp.total_visits,
                total_rewards_redeemed: dp.total_rewards_redeemed,
                last_visit_at: dp.last_visit_at || null,
                status: dp.status as any,
                created_at: dp.created_at,
                updated_at: dp.updated_at,
              });
            }
          }
        }

        // Combinar con los clientes locales que puedan no estar en Supabase para no perder nada
        const seenIds = new Set(mappedCustomers.map((c) => c.id));
        const seenPhones = new Set(mappedCustomers.map((c) => c.phone));

        for (const localCust of fideliziaStore.customers) {
          if (!seenIds.has(localCust.id) && !seenPhones.has(localCust.phone)) {
            mappedCustomers.push(localCust);
          }
        }

        const seenSerials = new Set(mappedPasses.map((p) => p.pass_serial_number));
        for (const localPass of fideliziaStore.passes) {
          if (!seenSerials.has(localPass.pass_serial_number)) {
            mappedPasses.push(localPass);
          }
        }

        customersList = mappedCustomers;
        passesList = mappedPasses;
      }
    } catch (dbErr) {
      console.warn('[Customers GET API] Supabase query error, fallback to memory:', dbErr);
    }

    return NextResponse.json({
      success: true,
      count: customersList.length,
      customers: customersList,
      passes: passesList,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al listar clientes';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
