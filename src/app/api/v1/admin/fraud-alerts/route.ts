import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/validation';
import { requireAuth } from '@/lib/auth/session';
import { fraudAlertRepo } from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const ResolveAlertSchema = z.object({
  alertId: z.string().uuid('ID de alerta inválido'),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, ['admin', 'manager']);
  if (auth.response) {
    return auth.response;
  }

  const unresolvedOnly = new URL(req.url).searchParams.get('unresolved') === 'true';

  try {
    const supabase = getSupabaseAdmin();
    const alerts = await fraudAlertRepo.listByMerchant(
      supabase,
      auth.session.merchantId,
      unresolvedOnly
    );
    return NextResponse.json({ success: true, alerts });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al listar alertas de fraude';
    return NextResponse.json({ error: 'FRAUD_ALERTS_FETCH_FAILED', message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req, ['admin', 'manager']);
  if (auth.response) {
    return auth.response;
  }

  const parsed = await parseJsonBody(req, ResolveAlertSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const supabase = getSupabaseAdmin();
    const alert = await fraudAlertRepo.resolve(
      supabase,
      auth.session.merchantId,
      parsed.data.alertId
    );
    return NextResponse.json({ success: true, alert });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al resolver alerta';
    return NextResponse.json({ error: 'FRAUD_ALERT_RESOLVE_FAILED', message }, { status: 500 });
  }
}
