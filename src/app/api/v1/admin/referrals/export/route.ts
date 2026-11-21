import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/api/rate-limit';
import { requireAuth } from '@/lib/auth/session';
import {
  ReferralMigrationRequiredError,
  isMigrationMissingError,
  referralRepo,
} from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  REFERRAL_MIGRATION_FILE,
  REFERRAL_MIGRATION_REQUIRED_CODE,
  REFERRAL_MIGRATION_REQUIRED_HINT,
  type PromoterComputedStatus,
  type PromoterPrizeStatus,
} from '@/types/referrals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COMPUTED_STATUS_LABELS: Record<PromoterComputedStatus, string> = {
  awarded: 'Premio entregado',
  disqualified: 'Descalificado',
  flagged: 'En revisión (sospechoso)',
  qualified: 'Calificado al premio',
  almost: 'Cerca de la meta',
  in_progress: 'En progreso',
};

const PRIZE_STATUS_LABELS: Record<PromoterPrizeStatus, string> = {
  pending: 'Pendiente',
  qualified: 'Calificado',
  awarded: 'Entregado',
  disqualified: 'Descalificado',
};

/**
 * Neutralizes CSV/Excel formula injection (=, +, -, @, leading tab/CR)
 * and properly quotes RFC 4180 CSV cells.
 */
function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const raw = String(value);
  const trimmedStart = raw.replace(/^\s+/, '');
  const needsFormulaGuard =
    /^[=+\-@\t\r]/.test(raw) || /^[=+\-@]/.test(trimmedStart);
  const neutralized = needsFormulaGuard ? `'${raw}` : raw;
  const escaped = neutralized.replace(/"/g, '""');
  return `"${escaped}"`;
}

function sanitizeFilenameSlug(slug: string | undefined): string {
  const cleaned = (slug || 'campana')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return cleaned || 'campana';
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, ['admin', 'manager']);
  if (auth.response) {
    return auth.response;
  }

  const rateLimit = applyRateLimit(req, 'admin:referrals:export', {
    limit: 20,
    windowMs: 60_000,
    keySuffix: auth.session.userId,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  try {
    const supabase = getSupabaseAdmin();
    const overview = await referralRepo.getCampaignOverview(
      supabase,
      auth.session.merchantId
    );

    const headers = [
      'Posición',
      'Nombre',
      'Alias',
      'Teléfono',
      'Código QR',
      'Activo',
      'Escaneos Totales',
      'Visitas Únicas',
      'Registros Nuevos',
      'Visitas en Tienda (POS)',
      'Conversión (%)',
      'Puntaje Métrica',
      'Meta',
      'Progreso (%)',
      'Estado Calculado',
      'Estado Premio',
      'Fecha Premio Entregado',
      'Alerta Sospechosa',
      'Motivos Alerta',
      'Notas',
    ];

    const lines: string[] = [headers.map(escapeCsvCell).join(',')];

    for (const row of overview.promoters) {
      const cells = [
        row.rank,
        row.promoter.name,
        row.promoter.alias ?? '',
        row.promoter.phone ?? '',
        row.promoter.code,
        row.promoter.is_active ? 'Sí' : 'No',
        row.totalScans,
        row.uniqueVisits,
        row.newCustomers,
        row.posVerifiedVisits,
        row.conversionRate,
        row.score,
        row.target,
        row.progressPct,
        COMPUTED_STATUS_LABELS[row.computedStatus] ?? row.computedStatus,
        PRIZE_STATUS_LABELS[row.promoter.prize_status] ?? row.promoter.prize_status,
        row.promoter.prize_awarded_at ?? '',
        row.isSuspicious ? 'Sí' : 'No',
        row.suspiciousReasons.join(' | '),
        row.promoter.notes ?? '',
      ];
      lines.push(cells.map(escapeCsvCell).join(','));
    }

    // Prepend UTF-8 BOM so Microsoft Excel renders Spanish accents cleanly
    const csvContent = `\uFEFF${lines.join('\r\n')}\r\n`;
    const dateStamp = new Date().toISOString().slice(0, 10);
    const slugPart = sanitizeFilenameSlug(overview.merchant?.slug);
    const filename = `embajadores-qr-${slugPart}-${dateStamp}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        ...rateLimit.headers,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
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

    const message =
      err instanceof Error ? err.message : 'Error al exportar reporte CSV';
    return NextResponse.json(
      {
        success: false,
        error: 'REFERRALS_EXPORT_FAILED',
        message,
      },
      { status: 500 }
    );
  }
}
