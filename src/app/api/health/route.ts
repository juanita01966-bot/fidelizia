import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

const HEALTH_TIMEOUT_MS = 3000;

export async function GET() {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
  const authConfigured = Boolean(
    process.env.AUTH_SESSION_SECRET && process.env.AUTH_SESSION_SECRET.trim().length >= 32
  );
  const googleWalletConfigured = Boolean(
    process.env.GOOGLE_ISSUER_ID?.trim() &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
      process.env.GOOGLE_PRIVATE_KEY?.trim()
  );
  const appleWalletConfigured = Boolean(
    process.env.APPLE_PASS_TYPE_ID?.trim() && process.env.APPLE_TEAM_ID?.trim()
  );

  let database: 'connected' | 'unreachable' | 'not_configured' = 'not_configured';

  if (supabaseConfigured) {
    try {
      const supabase = getSupabaseAdmin();
      const queryPromise = supabase
        .from('merchants')
        .select('id', { count: 'exact', head: true })
        .limit(1);

      const timeoutPromise = new Promise<{ error: Error }>((resolve) => {
        setTimeout(() => resolve({ error: new Error('Database health check timeout') }), HEALTH_TIMEOUT_MS);
      });

      const result = await Promise.race([queryPromise, timeoutPromise]);
      database = result.error ? 'unreachable' : 'connected';
    } catch {
      database = 'unreachable';
    }
  }

  const healthy = !supabaseConfigured || database === 'connected';

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      checks: {
        database,
        supabaseConfigured,
        authConfigured,
        googleWalletConfigured,
        appleWalletConfigured,
      },
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
