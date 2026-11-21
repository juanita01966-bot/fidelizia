import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyRateLimit } from '@/lib/api/rate-limit';
import { parseJsonBody } from '@/lib/api/validation';
import { requireAuth } from '@/lib/auth/session';
import {
  ReferralConflictError,
  ReferralMigrationRequiredError,
  ReferralNotFoundError,
  isMigrationMissingError,
  referralRepo,
} from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  REFERRAL_MIGRATION_FILE,
  REFERRAL_MIGRATION_REQUIRED_CODE,
  REFERRAL_MIGRATION_REQUIRED_HINT,
  UpdatePromoterSchema,
} from '@/types/referrals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PromoterIdSchema = z.string().uuid('ID de embajador inválido');

function handlePromoterError(
  err: unknown,
  fallbackCode: string,
  fallbackMessage: string
): NextResponse {
  if (err instanceof ReferralMigrationRequiredError || isMigrationMissingError(err)) {
    return NextResponse.json(
      {
        success: false,
        error: REFERRAL_MIGRATION_REQUIRED_CODE,
        message:
          err instanceof ReferralMigrationRequiredError
            ? err.message
            : REFERRAL_MIGRATION_REQUIRED_HINT,
        migrationFile: REFERRAL_MIGRATION_FILE,
      },
      { status: 503 }
    );
  }

  if (err instanceof ReferralNotFoundError) {
    return NextResponse.json(
      {
        success: false,
        error: err.code,
        message: err.message,
      },
      { status: 404 }
    );
  }

  if (err instanceof ReferralConflictError) {
    return NextResponse.json(
      {
        success: false,
        error: err.code,
        message: err.message,
      },
      { status: 409 }
    );
  }

  const message = err instanceof Error ? err.message : fallbackMessage;
  return NextResponse.json(
    {
      success: false,
      error: fallbackCode,
      message,
    },
    { status: 500 }
  );
}

function validatePromoterId(rawId: string): { id: string; errorResponse: null } | { id: null; errorResponse: NextResponse } {
  const parsed = PromoterIdSchema.safeParse(rawId);
  if (!parsed.success) {
    return {
      id: null,
      errorResponse: NextResponse.json(
        {
          success: false,
          error: 'INVALID_PROMOTER_ID',
          message: 'ID de embajador inválido',
        },
        { status: 400 }
      ),
    };
  }
  return { id: parsed.data, errorResponse: null };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ promoterId: string }> }
) {
  const auth = await requireAuth(req, ['admin', 'manager']);
  if (auth.response) {
    return auth.response;
  }

  const { promoterId: rawId } = await params;
  const validated = validatePromoterId(rawId);
  if (validated.errorResponse) {
    return validated.errorResponse;
  }

  try {
    const supabase = getSupabaseAdmin();
    const detail = await referralRepo.getPromoterDetail(
      supabase,
      auth.session.merchantId,
      validated.id
    );

    return NextResponse.json({
      success: true,
      ...detail,
    });
  } catch (err: unknown) {
    return handlePromoterError(
      err,
      'PROMOTER_DETAIL_FAILED',
      'Error al obtener detalle del embajador'
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ promoterId: string }> }
) {
  const auth = await requireAuth(req, ['admin', 'manager']);
  if (auth.response) {
    return auth.response;
  }

  const rateLimit = applyRateLimit(req, 'admin:referrals:promoter:update', {
    limit: 60,
    windowMs: 60_000,
    keySuffix: auth.session.userId,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  const { promoterId: rawId } = await params;
  const validated = validatePromoterId(rawId);
  if (validated.errorResponse) {
    return validated.errorResponse;
  }

  const parsed = await parseJsonBody(req, UpdatePromoterSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const supabase = getSupabaseAdmin();
    const promoter = await referralRepo.updatePromoter(
      supabase,
      auth.session.merchantId,
      validated.id,
      parsed.data
    );

    return NextResponse.json(
      {
        success: true,
        promoter,
      },
      { headers: rateLimit.headers }
    );
  } catch (err: unknown) {
    return handlePromoterError(
      err,
      'PROMOTER_UPDATE_FAILED',
      'Error al actualizar embajador'
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ promoterId: string }> }
) {
  const auth = await requireAuth(req, ['admin', 'manager']);
  if (auth.response) {
    return auth.response;
  }

  const rateLimit = applyRateLimit(req, 'admin:referrals:promoter:delete', {
    limit: 30,
    windowMs: 60_000,
    keySuffix: auth.session.userId,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  const { promoterId: rawId } = await params;
  const validated = validatePromoterId(rawId);
  if (validated.errorResponse) {
    return validated.errorResponse;
  }

  try {
    const supabase = getSupabaseAdmin();
    await referralRepo.deletePromoter(
      supabase,
      auth.session.merchantId,
      validated.id
    );

    return NextResponse.json(
      {
        success: true,
        deleted: true,
        promoterId: validated.id,
      },
      { headers: rateLimit.headers }
    );
  } catch (err: unknown) {
    return handlePromoterError(
      err,
      'PROMOTER_DELETE_FAILED',
      'Error al eliminar embajador'
    );
  }
}
