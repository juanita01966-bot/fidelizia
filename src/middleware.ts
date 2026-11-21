import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken, type ServerSession } from '@/lib/auth/token';

function isManagerOrAdmin(role: ServerSession['role']): boolean {
  return role === 'admin' || role === 'manager';
}

function forwardWithIdentityHeaders(req: NextRequest, session: ServerSession): NextResponse {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-fidelizia-user-id', session.userId);
  requestHeaders.set('x-fidelizia-merchant-id', session.merchantId);
  requestHeaders.set('x-fidelizia-merchant-slug', session.merchantSlug);
  requestHeaders.set('x-fidelizia-role', session.role);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const normalizedPathname = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  // Public read exception: join/[merchantSlug] loads public branding config
  if (normalizedPathname === '/api/v1/merchant/settings' && req.method === 'GET') {
    return NextResponse.next();
  }

  const rawToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(rawToken);

  if (pathname.startsWith('/admin')) {
    if (!session) {
      const loginUrl = new URL('/dsb', req.url);
      loginUrl.searchParams.set('next', `${pathname}${search}`);
      return NextResponse.redirect(loginUrl);
    }

    if (
      session.role === 'cashier' &&
      (pathname.startsWith('/admin/settings') || pathname.startsWith('/admin/fraud-audit'))
    ) {
      const fallbackUrl = new URL('/admin/dashboard', req.url);
      fallbackUrl.searchParams.set('error', 'forbidden');
      return NextResponse.redirect(fallbackUrl);
    }

    return forwardWithIdentityHeaders(req, session);
  }

  // Protected API routes: /api/v1/admin/*, /api/v1/customers, /api/v1/notifications/*, mutating /api/v1/merchant/settings
  if (!session) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Autenticación requerida' },
      { status: 401 }
    );
  }

  if (!isManagerOrAdmin(session.role)) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: 'Se requiere rol de administrador o gerente' },
      { status: 403 }
    );
  }

  return forwardWithIdentityHeaders(req, session);
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/v1/admin/:path*',
    '/api/v1/customers',
    '/api/v1/notifications/:path*',
    '/api/v1/merchant/settings',
  ],
};
