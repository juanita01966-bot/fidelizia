import { NextRequest, NextResponse } from 'next/server';
import { ReviewFeedbackSchema } from '@/types/domain';
import { getStore } from '@/lib/store/fidelizia-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = ReviewFeedbackSchema.safeParse(body);

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
    const result = store.submitFeedback({
      transactionId: validated.data.transactionId,
      merchantId: validated.data.merchantId,
      rating: validated.data.rating,
      comments: validated.data.comments,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al procesar reseña';
    return NextResponse.json({ error: 'SERVER_ERROR', message }, { status: 500 });
  }
}
