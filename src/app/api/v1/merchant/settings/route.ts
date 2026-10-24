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
        merchantData = {
          ...merchantData,
          name: data.name || merchantData.name,
          brand_color: data.brand_color || merchantData.brand_color,
          stamps_needed: data.stamps_needed || merchantData.stamps_needed,
          reward_description: data.reward_description || merchantData.reward_description,
          cooldown_hours: data.cooldown_hours || merchantData.cooldown_hours,
          scanner_geofence_meters: data.scanner_geofence_meters || merchantData.scanner_geofence_meters,
        };
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

    // 2. Persistir en Supabase
    let dbUpdated = false;
    try {
      const { error: sbError } = await supabaseAdmin
        .from('merchants')
        .update({
          brand_color: body.brand_color || updatedMerchant.brand_color,
          stamps_needed: Number(body.stamps_needed) || updatedMerchant.stamps_needed,
          reward_description: body.reward_description || updatedMerchant.reward_description,
          cooldown_hours: Number(body.cooldown_hours) || updatedMerchant.cooldown_hours,
          scanner_geofence_meters: Number(body.scanner_geofence_meters) || updatedMerchant.scanner_geofence_meters,
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
