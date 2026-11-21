import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  verifySessionToken,
  type ServerRole,
  type ServerSession,
} from './token';

function parseCookieHeader(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    if (key === name) {
      const rawValue = pair.slice(idx + 1).trim();
      try {
        return decodeURIComponent(rawValue);
      } catch {
        return rawValue;
      }
    }
  }
  return undefined;
}

export async function getServerSession(
  req?: NextRequest | Request,
  options?: { secret?: string }
): Promise<ServerSession | null> {
  let rawToken: string | undefined;

  if (req) {
    const maybeNextReq = req as NextRequest;
    if (maybeNextReq.cookies && typeof maybeNextReq.cookies.get === 'function') {
      rawToken = maybeNextReq.cookies.get(SESSION_COOKIE_NAME)?.value;
    } else {
      rawToken = parseCookieHeader(req.headers.get('cookie'), SESSION_COOKIE_NAME);
    }
  } else {
    try {
      const cookieStore = await cookies();
      rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    } catch {
      return null;
    }
  }

  return verifySessionToken(rawToken, options);
}

export async function requireAuth(
  req: NextRequest | Request,
  allowedRoles?: ServerRole[]
): Promise<
  | { session: ServerSession; response: null }
  | { session: null; response: NextResponse }
> {
  const session = await getServerSession(req);
  if (!session) {
    return {
      session: null,
      response: NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Autenticación requerida' },
        { status: 401 }
      ),
    };
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(session.role)) {
    return {
      session: null,
      response: NextResponse.json(
        { error: 'FORBIDDEN', message: 'No tienes permisos para realizar esta acción' },
        { status: 403 }
      ),
    };
  }

  return { session, response: null };
}

function resolveCookieSecure(req?: NextRequest | Request): boolean {
  if (req) {
    const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
    if (forwardedProto === 'https') return true;
    if (forwardedProto === 'http') return false;
    return req.url.toLowerCase().startsWith('https://');
  }
  return process.env.NODE_ENV === 'production';
}

export function setSessionCookie(
  res: NextResponse,
  token: string,
  req?: NextRequest | Request
): void {
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: resolveCookieSecure(req),
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(res: NextResponse, req?: NextRequest | Request): void {
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: resolveCookieSecure(req),
    path: '/',
    maxAge: 0,
  });
}
