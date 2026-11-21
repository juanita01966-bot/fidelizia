import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/session';

export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  const headers = {
    'Cache-Control': 'no-store, max-age=0',
  };

  if (!session) {
    return NextResponse.json({ authenticated: false, session: null }, { status: 200, headers });
  }

  return NextResponse.json({ authenticated: true, session }, { status: 200, headers });
}
