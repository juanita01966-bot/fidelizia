import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/api/rate-limit';
import { parseJsonBody } from '@/lib/api/validation';
import { requireAuth } from '@/lib/auth/session';
import { customerRepo, merchantRepo, passRepo } from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { triggerApplePassUpdate } from '@/lib/wallet/apple-wallet-service';
import { updateGoogleLoyaltyClassDesign } from '@/lib/wallet/google-wallet-service';
import { MerchantSettingsSchema } from '@/types/domain';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const rateLimit = applyRateLimit(req, 'merchant:settings:get', {
    limit: 120,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get('slug') || 'cafe-canelo').trim().toLowerCase();
    const supabase = getSupabaseAdmin();
    const merchant = await merchantRepo.getBySlug(supabase, slug);

    if (!merchant) {
      return NextResponse.json(
        { error: 'MERCHANT_NOT_FOUND', message: 'Comercio no encontrado o inactivo' },
        { status: 404, headers: rateLimit.headers }
      );
    }

    const locations = await merchantRepo.listLocations(supabase, merchant.id, true);

    return NextResponse.json(
      {
        success: true,
        merchant,
        locations,
      },
      { status: 200, headers: rateLimit.headers }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al obtener configuraciones';
    return NextResponse.json({ error: 'SETTINGS_FETCH_FAILED', message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, ['admin', 'manager']);
  if (auth.response) {
    return auth.response;
  }

  const rateLimit = applyRateLimit(req, 'merchant:settings:post', {
    limit: 30,
    windowMs: 60_000,
    keySuffix: auth.session.userId,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  const parsed = await parseJsonBody(req, MerchantSettingsSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const supabase = getSupabaseAdmin();
    const updatedMerchant = await merchantRepo.updateSettings(
      supabase,
      auth.session.merchantId,
      parsed.data
    );

    if (parsed.data.tier_config) {
      await customerRepo.recalculateAllTiers(supabase, auth.session.merchantId, parsed.data.tier_config);
    }

    const locations = await merchantRepo.listLocations(supabase, auth.session.merchantId, true);
    const hexBg =
      updatedMerchant.card_gradient?.from || updatedMerchant.brand_color || '#8b5cf6';

    const googleResult = await updateGoogleLoyaltyClassDesign(updatedMerchant, locations, {
      hexBackgroundColor: hexBg,
      issuerName: updatedMerchant.name,
      programName: `${updatedMerchant.name} · Club VIP`,
    });

    const activePasses = await passRepo.listActiveByMerchant(supabase, auth.session.merchantId);
    const applePasses = activePasses.filter((p) => p.pass_type === 'apple');
    let appleUpdatedCount = 0;

    if (applePasses.length > 0) {
      const appleResults = await Promise.allSettled(
        applePasses.map((ap) =>
          triggerApplePassUpdate(supabase, auth.session.merchantId, ap, {
            title: updatedMerchant.name,
            message: 'Diseño y beneficios de tu tarjeta actualizados',
            incrementQuota: false,
          })
        )
      );
      appleUpdatedCount = appleResults.filter(
        (r) => r.status === 'fulfilled' && r.value.success
      ).length;
    }

    return NextResponse.json(
      {
        success: true,
        merchant: updatedMerchant,
        locations,
        supabaseSync: true,
        googleWalletSync: googleResult.success,
        appleWalletUpdated: appleUpdatedCount,
        hexBackgroundColor: googleResult.hexBackgroundColor,
      },
      { status: 200, headers: rateLimit.headers }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Error al guardar configuraciones de tarjeta';
    return NextResponse.json({ error: 'SETTINGS_SAVE_FAILED', message }, { status: 500 });
  }
}
