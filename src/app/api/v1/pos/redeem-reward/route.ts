import { NextRequest, NextResponse } from 'next/server';
import { RedeemRewardSchema } from '@/types/domain';
import { getStore } from '@/lib/store/fidelizia-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = RedeemRewardSchema.safeParse(body);

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
    const result = store.redeemReward({
      merchantId: validated.data.merchantId,
      passSerialNumber: validated.data.passSerialNumber,
      managerPin: validated.data.managerPin,
      stampsToDeduct: validated.data.stampsToDeduct,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno al autorizar canje';
    return NextResponse.json(
      {
        error: 'AUTHORIZATION_FAILED',
        message,
      },
      { status: 403 }
    );
  }
}
