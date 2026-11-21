import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit } from '@/lib/api/rate-limit';
import { parseJsonBody } from '@/lib/api/validation';
import { verifyPassword, verifyPin } from '@/lib/auth/password';
import { setSessionCookie } from '@/lib/auth/session';
import { signSessionToken, type ServerRole, type ServerSession } from '@/lib/auth/token';
import { employeeRepo, merchantRepo } from '@/lib/repositories';
import { createSupabaseAdminClient, getSupabaseAdmin } from '@/lib/supabase/server';
import { LoginSchema } from '@/types/domain';

export async function POST(req: NextRequest) {
  const rateLimit = applyRateLimit(req, 'auth:login', {
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  const parsed = await parseJsonBody(req, LoginSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const { merchantSlug, identifier, secret } = parsed.data;

  const accountRateLimit = applyRateLimit(req, 'auth:login:account', {
    limit: 10,
    windowMs: 60_000,
    keySuffix: `${merchantSlug.toLowerCase()}:${identifier.trim().toLowerCase()}`,
    includeIp: false,
  });
  if (!accountRateLimit.allowed) {
    return accountRateLimit.response;
  }

  try {
    const supabase = getSupabaseAdmin();
    const merchant = await merchantRepo.getBySlug(supabase, merchantSlug);
    if (!merchant) {
      return NextResponse.json(
        { error: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' },
        { status: 401, headers: rateLimit.headers }
      );
    }

    let authenticatedSession: ServerSession | null = null;

    const employee = await employeeRepo.findByNameOrIdForAuth(supabase, merchant.id, identifier);
    if (employee) {
      let valid = false;
      if (employee.password_hash && (await verifyPassword(secret, employee.password_hash))) {
        valid = true;
      } else if (
        employee.dsb_password_hash &&
        (await verifyPassword(secret, employee.dsb_password_hash))
      ) {
        valid = true;
      } else if (/^\d{4}$/.test(secret) && (await verifyPin(secret, employee.pin_hash))) {
        valid = true;
      }

      if (valid) {
        authenticatedSession = {
          userId: employee.id,
          merchantId: merchant.id,
          merchantSlug: merchant.slug,
          role: employee.role as ServerRole,
          name: employee.name,
        };
      }
    }

    if (!authenticatedSession && identifier.includes('@') && merchant.user_id) {
      try {
        // Use a fresh ephemeral client so signInWithPassword never mutates the shared getSupabaseAdmin() singleton session
        const ephemeralAuthClient = createSupabaseAdminClient();
        const { data: authData, error: authErr } = await ephemeralAuthClient.auth.signInWithPassword({
          email: identifier.trim(),
          password: secret,
        });
        if (!authErr && authData?.user && authData.user.id === merchant.user_id) {
          authenticatedSession = {
            userId: authData.user.id,
            merchantId: merchant.id,
            merchantSlug: merchant.slug,
            role: 'admin',
            name: merchant.name,
          };
        }
      } catch {
        // Ignore auth lookup failure and return uniform 401 below
      }
    }

    if (!authenticatedSession) {
      return NextResponse.json(
        { error: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' },
        { status: 401, headers: rateLimit.headers }
      );
    }

    const token = await signSessionToken(authenticatedSession);
    const res = NextResponse.json(
      { success: true, session: authenticatedSession },
      { status: 200, headers: rateLimit.headers }
    );
    setSessionCookie(res, token, req);
    return res;
  } catch (err) {
    console.error('[Auth Login Error]:', err);
    return NextResponse.json(
      { error: 'AUTH_SERVICE_ERROR', message: 'No fue posible iniciar sesión en este momento' },
      { status: 500 }
    );
  }
}
