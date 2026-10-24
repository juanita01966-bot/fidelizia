import { NextRequest, NextResponse } from 'next/server';
import { CreateReservationSchema } from '@/types/domain';
import { getStore } from '@/lib/store/fidelizia-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = CreateReservationSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          error: 'BAD_REQUEST',
          details: validated.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const store = getStore();
    const result = store.createReservation({
      merchantSlug: validated.data.merchantSlug,
      customerName: validated.data.customerName,
      customerPhone: validated.data.customerPhone,
      dateTime: validated.data.dateTime,
      guestsCount: validated.data.guestsCount,
      notes: validated.data.notes,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al registrar reserva';
    return NextResponse.json({ error: 'SERVER_ERROR', message }, { status: 500 });
  }
}
