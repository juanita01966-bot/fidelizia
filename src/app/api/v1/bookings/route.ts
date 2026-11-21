import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyRateLimit } from '@/lib/api/rate-limit';
import { parseJsonBody, parseSearchParams } from '@/lib/api/validation';
import { requireAuth } from '@/lib/auth/session';
import { customerRepo, merchantRepo, reservationRepo } from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { CreateReservationSchema } from '@/types/domain';

export const runtime = 'nodejs';

const BookingQuerySchema = z.object({
  fromIso: z.string().optional(),
  toIso: z.string().optional(),
  status: z.enum(['confirmed', 'cancelled', 'completed', 'no_show']).optional(),
});

const BookingPatchSchema = z.object({
  reservationId: z.string().uuid('ID de reserva inválido'),
  status: z.enum(['confirmed', 'cancelled', 'completed', 'no_show']),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, ['admin', 'manager', 'cashier']);
  if (auth.response) {
    return auth.response;
  }

  const parsed = parseSearchParams(req.url, BookingQuerySchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const supabase = getSupabaseAdmin();
    const reservations = await reservationRepo.listByMerchant(
      supabase,
      auth.session.merchantId,
      parsed.data
    );
    return NextResponse.json({ success: true, reservations });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al consultar reservas';
    return NextResponse.json({ error: 'BOOKINGS_FETCH_FAILED', message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rateLimit = applyRateLimit(req, 'bookings:create', {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  const parsed = await parseJsonBody(req, CreateReservationSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const { merchantSlug, customerPhone, customerName, dateTime, guestsCount, notes, locationId } =
    parsed.data;

  try {
    const supabase = getSupabaseAdmin();
    const merchant = await merchantRepo.getBySlug(supabase, merchantSlug);
    if (!merchant) {
      return NextResponse.json(
        { error: 'MERCHANT_NOT_FOUND', message: 'Comercio no encontrado o inactivo' },
        { status: 404, headers: rateLimit.headers }
      );
    }

    let customer = await customerRepo.findByPhone(supabase, merchant.id, customerPhone);
    if (!customer) {
      customer = await customerRepo.create(supabase, merchant.id, {
        fullName: customerName,
        phone: customerPhone,
        termsAcceptedAt: new Date().toISOString(),
      });
    }

    const reservation = await reservationRepo.create(supabase, {
      merchantId: merchant.id,
      customerId: customer.id,
      locationId: locationId ?? null,
      dateTime,
      guestsCount,
      notes: notes ?? null,
    });

    return NextResponse.json(
      {
        success: true,
        reservation,
        customer: {
          id: customer.id,
          full_name: customer.full_name,
          phone: customer.phone,
        },
        merchant: {
          id: merchant.id,
          name: merchant.name,
          slug: merchant.slug,
        },
      },
      { status: 201, headers: rateLimit.headers }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al registrar reserva';
    return NextResponse.json({ error: 'BOOKING_CREATE_FAILED', message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req, ['admin', 'manager', 'cashier']);
  if (auth.response) {
    return auth.response;
  }

  const rateLimit = applyRateLimit(req, 'bookings:patch', {
    limit: 60,
    windowMs: 60_000,
    keySuffix: auth.session.userId,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  const parsed = await parseJsonBody(req, BookingPatchSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const supabase = getSupabaseAdmin();
    const existing = await reservationRepo.getById(
      supabase,
      auth.session.merchantId,
      parsed.data.reservationId
    );
    if (!existing) {
      return NextResponse.json(
        { error: 'RESERVATION_NOT_FOUND', message: 'Reserva no encontrada' },
        { status: 404, headers: rateLimit.headers }
      );
    }

    const reservation = await reservationRepo.updateStatus(
      supabase,
      auth.session.merchantId,
      parsed.data.reservationId,
      parsed.data.status
    );

    return NextResponse.json(
      { success: true, reservation },
      { status: 200, headers: rateLimit.headers }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al actualizar reserva';
    return NextResponse.json({ error: 'BOOKING_UPDATE_FAILED', message }, { status: 500 });
  }
}
