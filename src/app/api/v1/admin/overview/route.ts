import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import {
  customerRepo,
  employeeRepo,
  feedbackRepo,
  fraudAlertRepo,
  merchantRepo,
  redemptionRepo,
  reservationRepo,
  transactionRepo,
} from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, ['admin', 'manager']);
  if (auth.response) {
    return auth.response;
  }

  try {
    const supabase = getSupabaseAdmin();
    const merchantId = auth.session.merchantId;

    const [
      merchant,
      locations,
      custData,
      transactions,
      redemptions,
      reservations,
      feedback,
      fraudAlerts,
      employees,
    ] = await Promise.all([
      merchantRepo.getById(supabase, merchantId),
      merchantRepo.listLocations(supabase, merchantId, false),
      customerRepo.listWithPassesByMerchant(supabase, merchantId),
      transactionRepo.listByMerchant(supabase, merchantId, 200),
      redemptionRepo.listByMerchant(supabase, merchantId, 100),
      reservationRepo.listByMerchant(supabase, merchantId),
      feedbackRepo.listByMerchant(supabase, merchantId, 100),
      fraudAlertRepo.listByMerchant(supabase, merchantId, false),
      employeeRepo.listByMerchant(supabase, merchantId, false),
    ]);

    if (!merchant) {
      return NextResponse.json(
        { error: 'MERCHANT_NOT_FOUND', message: 'Comercio no encontrado' },
        { status: 404 }
      );
    }

    const sanitizedPasses = custData.passes.map(
      ({ authentication_token: _auth, push_token: pushToken, ...rest }) => ({
        ...rest,
        has_push_token: Boolean(pushToken),
        push_token: pushToken ? 'registered' : null,
      })
    );

    return NextResponse.json({
      success: true,
      merchant,
      locations,
      customers: custData.customers,
      passes: sanitizedPasses,
      transactions,
      redemptions,
      reservations,
      feedback,
      fraudAlerts,
      employees,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al cargar resumen administrativo';
    return NextResponse.json({ error: 'OVERVIEW_FETCH_FAILED', message }, { status: 500 });
  }
}
