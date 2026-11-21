import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/api/rate-limit';
import { employeeRepo, merchantRepo } from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const rateLimit = applyRateLimit(req, 'pos:context', {
    limit: 120,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  try {
    const slug = (new URL(req.url).searchParams.get('merchantSlug') || 'cafe-canelo')
      .trim()
      .toLowerCase();

    const supabase = getSupabaseAdmin();
    const merchant = await merchantRepo.getBySlug(supabase, slug);
    if (!merchant) {
      return NextResponse.json(
        { error: 'MERCHANT_NOT_FOUND', message: 'Comercio no encontrado o inactivo' },
        { status: 404, headers: rateLimit.headers }
      );
    }

    const [locations, employees] = await Promise.all([
      merchantRepo.listLocations(supabase, merchant.id, true),
      employeeRepo.listByMerchant(supabase, merchant.id, true),
    ]);

    return NextResponse.json(
      {
        success: true,
        merchant: {
          id: merchant.id,
          name: merchant.name,
          slug: merchant.slug,
          brand_color: merchant.brand_color,
          secondary_color: merchant.secondary_color,
          stamps_needed: merchant.stamps_needed,
          reward_description: merchant.reward_description,
          cooldown_hours: merchant.cooldown_hours,
          scanner_geofence_meters: merchant.scanner_geofence_meters,
          loyalty_program_mode: merchant.loyalty_program_mode,
          reward_milestones: merchant.reward_milestones ?? [],
        },
        locations,
        employees,
      },
      { status: 200, headers: rateLimit.headers }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error cargando contexto de POS';
    return NextResponse.json({ error: 'POS_CONTEXT_FAILED', message }, { status: 500 });
  }
}
