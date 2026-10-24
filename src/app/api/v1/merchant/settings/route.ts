// src/app/api/v1/merchant/settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fideliziaStore } from '@/lib/store/fidelizia-store';
import { supabaseAdmin } from '@/lib/supabase/server';
import { updateGoogleLoyaltyClassDesign } from '@/lib/wallet/google-wallet-service';

export async function GET() {
  try {
    let merchantData = fideliziaStore.merchant;

    // Intentar leer de Supabase
    try {
      const { data, error } = await supabaseAdmin
        .from('merchants')
        .select('*')
        .eq('slug', 'cafe-canelo')
        .maybeSingle();

      if (data && !error) {
        const storedDesign = (data.opening_hours as any)?.card_design || {};
        merchantData = {
          ...merchantData,
          name: data.name || merchantData.name,
          brand_color: storedDesign.brand_color || data.brand_color || merchantData.brand_color,
          stamps_needed: storedDesign.stamps_needed || data.stamps_needed || merchantData.stamps_needed,
          reward_description: storedDesign.reward_description || data.reward_description || merchantData.reward_description,
          cooldown_hours: data.cooldown_hours || merchantData.cooldown_hours,
          scanner_geofence_meters: data.scanner_geofence_meters || merchantData.scanner_geofence_meters,
          card_pattern: storedDesign.card_pattern || merchantData.card_pattern,
          show_emv_chip: typeof storedDesign.show_emv_chip === 'boolean' ? storedDesign.show_emv_chip : merchantData.show_emv_chip,
          show_hologram: typeof storedDesign.show_hologram === 'boolean' ? storedDesign.show_hologram : merchantData.show_hologram,
          loyalty_program_mode: storedDesign.loyalty_program_mode || merchantData.loyalty_program_mode,
          card_morphology: storedDesign.card_morphology || merchantData.card_morphology,
          card_gradient: storedDesign.card_gradient || merchantData.card_gradient,
          reward_milestones: storedDesign.reward_milestones || merchantData.reward_milestones,
          preconfigured_rewards: storedDesign.preconfigured_rewards || merchantData.preconfigured_rewards,
        };

        // Mantener memoria local del servidor actualizada
        fideliziaStore.merchant = merchantData;
      }
    } catch (dbErr) {
      console.warn('[Merchant Settings GET] Supabase fallback to local store:', dbErr);
    }

    return NextResponse.json({
      success: true,
      merchant: merchantData,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al obtener configuraciones';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. Actualizar en el store central en memoria del servidor
    fideliziaStore.updateMerchantSettings(body);
    const updatedMerchant = fideliziaStore.merchant;

    // 2. Persistir en Supabase (campos nativos + diseño completo en opening_hours.card_design)
    let dbUpdated = false;
    try {
      const { data: currentMerch } = await supabaseAdmin
        .from('merchants')
        .select('opening_hours')
        .eq('slug', 'cafe-canelo')
        .maybeSingle();

      const existingOpening = (currentMerch?.opening_hours as any) || {};
      const newOpeningHours = {
        ...existingOpening,
        card_design: {
          brand_color: body.brand_color || updatedMerchant.brand_color,
          stamps_needed: Number(body.stamps_needed) || updatedMerchant.stamps_needed,
          reward_description: body.reward_description || updatedMerchant.reward_description,
          card_pattern: body.card_pattern || updatedMerchant.card_pattern,
          show_emv_chip: typeof body.show_emv_chip === 'boolean' ? body.show_emv_chip : updatedMerchant.show_emv_chip,
          show_hologram: typeof body.show_hologram === 'boolean' ? body.show_hologram : updatedMerchant.show_hologram,
          loyalty_program_mode: body.loyalty_program_mode || updatedMerchant.loyalty_program_mode,
          card_morphology: body.card_morphology || updatedMerchant.card_morphology,
          card_gradient: body.card_gradient || updatedMerchant.card_gradient,
          reward_milestones: body.reward_milestones || updatedMerchant.reward_milestones,
          preconfigured_rewards: body.preconfigured_rewards || updatedMerchant.preconfigured_rewards,
        },
      };

      const { error: sbError } = await supabaseAdmin
        .from('merchants')
        .update({
          brand_color: body.brand_color || updatedMerchant.brand_color,
          stamps_needed: Number(body.stamps_needed) || updatedMerchant.stamps_needed,
          reward_description: body.reward_description || updatedMerchant.reward_description,
          cooldown_hours: Number(body.cooldown_hours) || updatedMerchant.cooldown_hours,
          scanner_geofence_meters: Number(body.scanner_geofence_meters) || updatedMerchant.scanner_geofence_meters,
          opening_hours: newOpeningHours,
          updated_at: new Date().toISOString(),
        })
        .eq('slug', 'cafe-canelo');

      if (!sbError) {
        dbUpdated = true;
      } else {
        console.warn('[Merchant Settings POST] Error actualizando en Supabase:', sbError);
      }
    } catch (dbErr) {
      console.warn('[Merchant Settings POST] Error de conexión con Supabase:', dbErr);
    }

    // 3. Sincronizar y propagar el nuevo diseño visual en Google Wallet API en vivo
    const hexBg = body.card_gradient?.from || body.brand_color || updatedMerchant.brand_color || '#8b5cf6';
    const googleResult = await updateGoogleLoyaltyClassDesign({
      hexBackgroundColor: hexBg,
      issuerName: updatedMerchant.name,
      programName: 'Club Canelo - Fidelidad',
    });

    console.log(`[Merchant Settings] Diseño actualizado. Supabase: ${dbUpdated} · Google Wallet: ${googleResult.success} · Hex: ${hexBg}`);

    return NextResponse.json({
      success: true,
      merchant: updatedMerchant,
      supabaseSync: dbUpdated,
      googleWalletSync: googleResult.success,
      hexBackgroundColor: googleResult.hexBackgroundColor,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al guardar configuraciones de tarjeta';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
