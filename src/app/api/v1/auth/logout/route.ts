import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ success: true }, { status: 200 });
  clearSessionCookie(res, req);
  return res;
}
