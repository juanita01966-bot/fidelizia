import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyRateLimit } from '@/lib/api/rate-limit';
import { parseJsonBody, parseSearchParams } from '@/lib/api/validation';
import { requireAuth } from '@/lib/auth/session';
import { customerRepo } from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const CustomersQuerySchema = z.object({
  segment: z.string().trim().max(40).optional(),
  tier: z.enum(['bronze', 'silver', 'gold', 'champion']).optional(),
  search: z.string().trim().max(100).optional(),
});

const CustomerPatchSchema = z.object({
  customerId: z.string().uuid('ID de cliente inválido'),
  customReward: z.string().trim().max(250).nullable().optional(),
  discountPercentage: z.number().min(0).max(100).nullable().optional(),
  loyaltyTier: z.enum(['bronze', 'silver', 'gold', 'champion']).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, ['admin', 'manager']);
  if (auth.response) {
    return auth.response;
  }

  const parsedQuery = parseSearchParams(req.url, CustomersQuerySchema);
  if (!parsedQuery.success) {
    return parsedQuery.response;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { customers, passes } = await customerRepo.listWithPassesByMerchant(
      supabase,
      auth.session.merchantId,
      parsedQuery.data
    );

    const sanitizedPasses = passes.map(({ authentication_token: _auth, push_token: pushToken, ...rest }) => ({
      ...rest,
      has_push_token: Boolean(pushToken),
      push_token: pushToken ? 'registered' : null,
    }));

    return NextResponse.json({
      success: true,
      count: customers.length,
      customers,
      passes: sanitizedPasses,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al listar clientes';
    return NextResponse.json({ error: 'CUSTOMERS_FETCH_FAILED', message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req, ['admin', 'manager']);
  if (auth.response) {
    return auth.response;
  }

  const rateLimit = applyRateLimit(req, 'customers:patch', {
    limit: 60,
    windowMs: 60_000,
    keySuffix: auth.session.userId,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  const parsed = await parseJsonBody(req, CustomerPatchSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const { customerId, customReward, discountPercentage, loyaltyTier } = parsed.data;

  try {
    const supabase = getSupabaseAdmin();
    let customer = await customerRepo.findById(supabase, auth.session.merchantId, customerId);
    if (!customer) {
      return NextResponse.json(
        { error: 'CUSTOMER_NOT_FOUND', message: 'Cliente no encontrado en este comercio' },
        { status: 404 }
      );
    }

    if (customReward !== undefined || discountPercentage !== undefined) {
      customer = await customerRepo.updateBenefits(
        supabase,
        auth.session.merchantId,
        customerId,
        customReward !== undefined ? customReward : customer.custom_reward ?? null,
        discountPercentage !== undefined ? discountPercentage : customer.discount_percentage ?? null
      );
    }

    if (loyaltyTier !== undefined) {
      customer = await customerRepo.updateLoyaltyTier(
        supabase,
        auth.session.merchantId,
        customerId,
        loyaltyTier
      );
    }

    return NextResponse.json(
      { success: true, customer },
      { status: 200, headers: rateLimit.headers }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al actualizar cliente';
    return NextResponse.json({ error: 'CUSTOMER_UPDATE_FAILED', message }, { status: 500 });
  }
}
