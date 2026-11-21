import { NextRequest, NextResponse } from 'next/server';
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
  BatchCreatePromotersSchema,
  CreatePromoterSchema,
  REFERRAL_MIGRATION_FILE,
  REFERRAL_MIGRATION_REQUIRED_CODE,
  REFERRAL_MIGRATION_REQUIRED_HINT,
  UpdateCampaignSchema,
} from '@/types/referrals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function handleReferralApiError(
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

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, ['admin', 'manager']);
  if (auth.response) {
    return auth.response;
  }

  try {
    const supabase = getSupabaseAdmin();
    const overview = await referralRepo.getCampaignOverview(
      supabase,
      auth.session.merchantId
    );

    return NextResponse.json({
      success: true,
      ...overview,
    });
  } catch (err: unknown) {
    return handleReferralApiError(
      err,
      'REFERRALS_OVERVIEW_FAILED',
      'Error al cargar métricas de embajadores QR'
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, ['admin', 'manager']);
  if (auth.response) {
    return auth.response;
  }

  const rateLimit = applyRateLimit(req, 'admin:referrals:create', {
    limit: 30,
    windowMs: 60_000,
    keySuffix: auth.session.userId,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'INVALID_JSON',
        message: 'El cuerpo de la solicitud no es un JSON válido',
      },
      { status: 400, headers: rateLimit.headers }
    );
  }

  const isBatchRequest =
    rawBody !== null &&
    typeof rawBody === 'object' &&
    'promoters' in rawBody;

  const supabase = getSupabaseAdmin();

  if (isBatchRequest) {
    const parsedBatch = BatchCreatePromotersSchema.safeParse(rawBody);
    if (!parsedBatch.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Error de validación en el lote de embajadores',
          details: parsedBatch.error.flatten().fieldErrors,
        },
        { status: 400, headers: rateLimit.headers }
      );
    }

    try {
      const result = await referralRepo.batchCreatePromoters(
        supabase,
        auth.session.merchantId,
        parsedBatch.data.promoters
      );

      return NextResponse.json(
        {
          success: true,
          mode: 'batch',
          created: result.created,
          skipped: result.skipped,
          createdCount: result.created.length,
          skippedCount: result.skipped.length,
        },
        { status: 201, headers: rateLimit.headers }
      );
    } catch (err: unknown) {
      return handleReferralApiError(
        err,
        'PROMOTERS_BATCH_CREATE_FAILED',
        'Error al crear lote de embajadores'
      );
    }
  }

  const parsedSingle = CreatePromoterSchema.safeParse(rawBody);
  if (!parsedSingle.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Error de validación en los datos del embajador',
        details: parsedSingle.error.flatten().fieldErrors,
      },
      { status: 400, headers: rateLimit.headers }
    );
  }

  try {
    const promoter = await referralRepo.createPromoter(
      supabase,
      auth.session.merchantId,
      parsedSingle.data
    );

    return NextResponse.json(
      {
        success: true,
        mode: 'single',
        promoter,
      },
      { status: 201, headers: rateLimit.headers }
    );
  } catch (err: unknown) {
    return handleReferralApiError(
      err,
      'PROMOTER_CREATE_FAILED',
      'Error al crear embajador'
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req, ['admin', 'manager']);
  if (auth.response) {
    return auth.response;
  }

  const rateLimit = applyRateLimit(req, 'admin:referrals:campaign:update', {
    limit: 30,
    windowMs: 60_000,
    keySuffix: auth.session.userId,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  const parsed = await parseJsonBody(req, UpdateCampaignSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const supabase = getSupabaseAdmin();
    const targetCampaignId =
      parsed.data.campaignId ??
      (await referralRepo.getOrCreateActiveCampaign(supabase, auth.session.merchantId)).id;

    const campaign = await referralRepo.updateCampaign(
      supabase,
      auth.session.merchantId,
      targetCampaignId,
      parsed.data
    );

    return NextResponse.json(
      {
        success: true,
        campaign,
      },
      { headers: rateLimit.headers }
    );
  } catch (err: unknown) {
    return handleReferralApiError(
      err,
      'CAMPAIGN_UPDATE_FAILED',
      'Error al actualizar configuración de la campaña'
    );
  }
}
