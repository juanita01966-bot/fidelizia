import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyRateLimit } from '@/lib/api/rate-limit';
import { parseJsonBody } from '@/lib/api/validation';
import { requireAuth } from '@/lib/auth/session';
import {
  customerRepo,
  feedbackRepo,
  merchantRepo,
  transactionRepo,
} from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { ReviewFeedbackSchema } from '@/types/domain';

export const runtime = 'nodejs';

const FeedbackPatchSchema = z.object({
  feedbackId: z.string().uuid('ID de reseña inválido'),
});

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildGooglePlaceReviewUrl(googlePlaceId: string | null | undefined): string {
  const cleanId = googlePlaceId?.trim();
  if (cleanId) {
    return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(cleanId)}`;
  }
  return 'https://www.google.com/maps';
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const txId = url.searchParams.get('txId')?.trim();
  const slug = (url.searchParams.get('slug') || 'cafe-canelo').trim().toLowerCase();

  // Public context lookup for /feedback/[txId] page (exposes zero PII)
  if (txId || url.searchParams.get('context') === '1') {
    const rateLimit = applyRateLimit(req, 'feedback:context', { limit: 60, windowMs: 60_000 });
    if (!rateLimit.allowed) return rateLimit.response;

    try {
      const supabase = getSupabaseAdmin();
      const merchant = await merchantRepo.getBySlug(supabase, slug);
      if (!merchant) {
        return NextResponse.json(
          { error: 'MERCHANT_NOT_FOUND', message: 'Comercio no encontrado' },
          { status: 404 }
        );
      }

      let validTransaction = false;
      if (txId && UUID_REGEX.test(txId)) {
        const tx = await transactionRepo.getById(supabase, merchant.id, txId);
        validTransaction = Boolean(tx);
      }

      return NextResponse.json(
        {
          success: true,
          merchantId: merchant.id,
          merchantName: merchant.name,
          merchantSlug: merchant.slug,
          validTransaction,
        },
        { status: 200, headers: rateLimit.headers }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error consultando contexto de reseña';
      return NextResponse.json({ error: 'FEEDBACK_CONTEXT_ERROR', message }, { status: 500 });
    }
  }

  const auth = await requireAuth(req, ['admin', 'manager']);
  if (auth.response) {
    return auth.response;
  }

  try {
    const supabase = getSupabaseAdmin();
    const feedback = await feedbackRepo.listByMerchant(supabase, auth.session.merchantId);
    return NextResponse.json({ success: true, feedback });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al listar reseñas';
    return NextResponse.json({ error: 'FEEDBACK_LIST_FAILED', message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rateLimit = applyRateLimit(req, 'feedback:submit', {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  const parsed = await parseJsonBody(req, ReviewFeedbackSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const { transactionId, merchantId, customerPhone, rating, comments } = parsed.data;

  try {
    const supabase = getSupabaseAdmin();
    const merchant = await merchantRepo.getById(supabase, merchantId);
    if (!merchant) {
      return NextResponse.json(
        { error: 'MERCHANT_NOT_FOUND', message: 'Comercio no encontrado o inactivo' },
        { status: 404, headers: rateLimit.headers }
      );
    }

    let resolvedCustomerId: string | null = null;
    let resolvedTxId: string | null = null;

    if (transactionId) {
      const tx = await transactionRepo.getById(supabase, merchant.id, transactionId);
      if (tx) {
        resolvedCustomerId = tx.customer_id;
        resolvedTxId = tx.id;
      }
    }

    if (!resolvedCustomerId && customerPhone) {
      let customer = await customerRepo.findByPhone(supabase, merchant.id, customerPhone);
      if (!customer) {
        customer = await customerRepo.create(supabase, merchant.id, {
          fullName: 'Cliente Verificado',
          phone: customerPhone,
          termsAcceptedAt: new Date().toISOString(),
        });
      }
      resolvedCustomerId = customer.id;
    }

    if (!resolvedCustomerId) {
      return NextResponse.json(
        {
          error: 'CUSTOMER_REQUIRED',
          message: 'Proporciona un teléfono válido o accede desde el enlace de tu visita para enviar la valoración.',
        },
        { status: 400, headers: rateLimit.headers }
      );
    }

    const isPublicRedirect = rating >= 4;
    const saved = await feedbackRepo.create(supabase, {
      merchantId: merchant.id,
      customerId: resolvedCustomerId,
      transactionId: resolvedTxId,
      rating,
      comments: comments?.trim() || null,
      isPublicRedirect,
    });

    const redirectUrl = isPublicRedirect
      ? buildGooglePlaceReviewUrl(merchant.google_place_id)
      : null;

    return NextResponse.json(
      {
        success: true,
        feedback: saved,
        isPublicRedirect,
        redirectUrl,
      },
      { status: 201, headers: rateLimit.headers }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al procesar reseña';
    return NextResponse.json({ error: 'FEEDBACK_CREATE_FAILED', message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req, ['admin', 'manager']);
  if (auth.response) {
    return auth.response;
  }

  const parsed = await parseJsonBody(req, FeedbackPatchSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const supabase = getSupabaseAdmin();
    const updated = await feedbackRepo.markManagerContacted(
      supabase,
      auth.session.merchantId,
      parsed.data.feedbackId
    );
    return NextResponse.json({ success: true, feedback: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al actualizar reseña';
    return NextResponse.json({ error: 'FEEDBACK_UPDATE_FAILED', message }, { status: 500 });
  }
}
