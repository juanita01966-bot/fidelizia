import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyRateLimit } from '@/lib/api/rate-limit';
import { parseSearchParams } from '@/lib/api/validation';
import { customerRepo, merchantRepo, passRepo } from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const PassStatusQuerySchema = z
  .object({
    serial: z.string().trim().min(3).max(100).optional(),
    phone: z.string().trim().min(7).max(25).optional(),
    merchantSlug: z.string().trim().min(2).max(80).optional(),
  })
  .refine((v) => Boolean(v.serial || v.phone), {
    message: 'Debes proporcionar un serial o un teléfono',
  });

export async function GET(req: NextRequest) {
  const rateLimit = applyRateLimit(req, 'passes:status', {
    limit: 90,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  const parsed = parseSearchParams(req.url, PassStatusQuerySchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const { serial, phone, merchantSlug } = parsed.data;

  try {
    const supabase = getSupabaseAdmin();
    let bundle = serial
      ? await passRepo.getWithCustomerAndMerchantBySerial(supabase, serial)
      : null;

    if (!bundle && phone) {
      const slug = (merchantSlug || 'cafe-canelo').trim().toLowerCase();
      const merchant = await merchantRepo.getBySlug(supabase, slug);
      if (merchant) {
        const customer = await customerRepo.findByPhone(supabase, merchant.id, phone);
        if (customer) {
          const { passes } = await customerRepo.listWithPassesByMerchant(supabase, merchant.id);
          const customerPass =
            passes.find((p) => p.customer_id === customer.id && p.status === 'active') ||
            passes.find((p) => p.customer_id === customer.id);
          if (customerPass) {
            bundle = await passRepo.getWithCustomerAndMerchantBySerial(
              supabase,
              customerPass.pass_serial_number,
              merchant.id
            );
          }
        }
      }
    }

    if (!bundle) {
      return NextResponse.json(
        { error: 'PASS_NOT_FOUND', message: 'Pase no encontrado' },
        { status: 404, headers: rateLimit.headers }
      );
    }

    const { pass, customer, merchant } = bundle;
    const stampsNeeded = Math.max(1, merchant.stamps_needed || 10);
    const currentStamps = pass.current_stamps || 0;
    const rewardUnlocked = currentStamps >= stampsNeeded;
    const rewardDescription =
      customer.custom_reward || merchant.reward_description || 'Premio de Autor';

    return NextResponse.json(
      {
        serial: pass.pass_serial_number,
        passType: pass.pass_type,
        currentStamps,
        stampsNeeded,
        rewardUnlocked,
        rewardDescription,
        customerName: customer.full_name,
        loyaltyTier: customer.loyalty_tier || 'bronze',
        totalVisits: pass.total_visits || 0,
        totalRewardsRedeemed: customer.total_rewards_redeemed ?? pass.total_rewards_redeemed ?? 0,
        customReward: customer.custom_reward ?? null,
        discountPercentage: customer.discount_percentage ?? null,
        lastVisitAt: pass.last_visit_at,
        merchantId: merchant.id,
        merchantName: merchant.name,
        merchantSlug: merchant.slug,
        status: pass.status,
      },
      {
        status: 200,
        headers: {
          ...rateLimit.headers,
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al consultar estado de pase';
    return NextResponse.json({ error: 'PASS_STATUS_ERROR', message }, { status: 500 });
  }
}
