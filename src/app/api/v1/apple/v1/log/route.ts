import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyRateLimit } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';

const AppleLogBodySchema = z.object({
  logs: z.array(z.string()).max(100),
});

export async function POST(req: NextRequest) {
  const rateLimit = applyRateLimit(req, 'apple:passkit:log', {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = AppleLogBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_LOGS_PAYLOAD' }, { status: 400 });
  }

  const sanitized = parsed.data.logs
    .slice(0, 20)
    .map((entry) => entry.replace(/[\r\n\t\x00-\x1f\x7f]/g, ' ').slice(0, 500));

  if (sanitized.length > 0) {
    console.warn('[Apple Wallet Device Log]', sanitized);
  }

  return NextResponse.json({ status: 'ok', received: sanitized.length }, { status: 200 });
}
