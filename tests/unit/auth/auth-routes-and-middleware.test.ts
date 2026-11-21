import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as loginPost } from '@/app/api/v1/auth/login/route';
import { POST as logoutPost } from '@/app/api/v1/auth/logout/route';
import { GET as sessionGet } from '@/app/api/v1/auth/session/route';
import { GET as healthGet } from '@/app/api/health/route';
import { middleware } from '@/middleware';
import { hashSecret } from '@/lib/auth/password';
import { SESSION_COOKIE_NAME, signSessionToken } from '@/lib/auth/token';
import { resetRateLimiterForTests } from '@/lib/api/rate-limit';
import {
  getSupabaseAdmin,
  resetSupabaseAdmin,
  setSupabaseAdminForTests,
  type SupabaseAdminClient,
} from '@/lib/supabase/server';

const TEST_SECRET = 'test-secret-fidelizia-32-chars-minimum-key!!';

function createAuthSupabaseMock(opts: {
  merchant?: Record<string, unknown> | null;
  employees?: Array<Record<string, unknown>>;
  healthError?: Error | null;
}): SupabaseAdminClient {
  const client = {
    from: (table: string) => {
      if (table === 'merchants') {
        return {
          select: (_cols?: string, selectOpts?: { head?: boolean }) => {
            if (selectOpts?.head) {
              return {
                limit: async () => ({ error: opts.healthError ?? null }),
              };
            }
            const chain = {
              eq: () => chain,
              maybeSingle: async () => ({ data: opts.merchant ?? null, error: null }),
            };
            return chain;
          },
        };
      }
      if (table === 'employees') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: async () => ({ data: opts.employees ?? [], error: null }),
        };
        return chain;
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
  return client as unknown as SupabaseAdminClient;
}

describe('Auth routes, /api/health, and Edge middleware', () => {
  const originalSecret = process.env.AUTH_SESSION_SECRET;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = TEST_SECRET;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
    resetRateLimiterForTests();
    resetSupabaseAdmin();
  });

  afterEach(() => {
    resetSupabaseAdmin();
    resetRateLimiterForTests();
    if (originalSecret === undefined) delete process.env.AUTH_SESSION_SECRET;
    else process.env.AUTH_SESSION_SECRET = originalSecret;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it('POST /api/v1/auth/login sets HttpOnly cookie on valid bcrypt credentials and rejects invalid ones', async () => {
    const pinHash = await hashSecret('9999', 4);
    const mockClient = createAuthSupabaseMock({
      merchant: {
        id: '00000000-0000-0000-0000-000000000001',
        slug: 'cafe-canelo',
        name: 'Café Canelo',
        is_active: true,
        user_id: null,
      },
      employees: [
        {
          id: '00000000-0000-0000-0000-000000000004',
          merchant_id: '00000000-0000-0000-0000-000000000001',
          name: 'Laura Gerente (Canjes)',
          username: 'laura',
          email: null,
          pin_hash: pinHash,
          password_hash: null,
          dsb_password_hash: null,
          role: 'manager',
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ],
    });
    setSupabaseAdminForTests(mockClient);

    const validReq = new NextRequest('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.1' },
      body: JSON.stringify({ merchantSlug: 'cafe-canelo', identifier: 'laura', secret: '9999' }),
    });
    const validRes = await loginPost(validReq);
    expect(validRes.status).toBe(200);
    const setCookieHeader = validRes.headers.get('set-cookie') ?? '';
    expect(setCookieHeader).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookieHeader.toLowerCase()).toContain('httponly');

    const invalidReq = new NextRequest('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.2' },
      body: JSON.stringify({ merchantSlug: 'cafe-canelo', identifier: 'laura', secret: '0000' }),
    });
    const invalidRes = await loginPost(invalidReq);
    expect(invalidRes.status).toBe(401);

    const emptySecretReq = new NextRequest('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.3' },
      body: JSON.stringify({ merchantSlug: 'cafe-canelo', identifier: 'laura', secret: '' }),
    });
    const emptyRes = await loginPost(emptySecretReq);
    expect(emptyRes.status).toBe(400);
  });

  it('GET /api/v1/auth/session and POST /api/v1/auth/logout manage session state cleanly', async () => {
    const anonReq = new NextRequest('http://localhost/api/v1/auth/session');
    const anonRes = await sessionGet(anonReq);
    expect(anonRes.status).toBe(200);
    expect(await anonRes.json()).toEqual({ authenticated: false, session: null });

    const token = await signSessionToken({
      userId: 'emp-4',
      merchantId: 'merch-1',
      merchantSlug: 'cafe-canelo',
      role: 'admin',
      name: 'Admin Canelo',
    });

    const authedReq = new NextRequest('http://localhost/api/v1/auth/session', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    const authedRes = await sessionGet(authedReq);
    const authedBody = await authedRes.json();
    expect(authedBody.authenticated).toBe(true);
    expect(authedBody.session.role).toBe('admin');

    const logoutRes = await logoutPost(
      new NextRequest('http://localhost/api/v1/auth/logout', { method: 'POST' })
    );
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('GET /api/health returns 200 without leaking secrets and 503 when DB is unreachable', async () => {
    setSupabaseAdminForTests(createAuthSupabaseMock({ healthError: null }));
    const okRes = await healthGet();
    expect(okRes.status).toBe(200);
    const okJson = await okRes.json();
    expect(okJson.status).toBe('ok');
    expect(okJson.checks.database).toBe('connected');
    expect(JSON.stringify(okJson)).not.toContain('service-role-test-key');
    expect(JSON.stringify(okJson)).not.toContain(TEST_SECRET);

    setSupabaseAdminForTests(createAuthSupabaseMock({ healthError: new Error('timeout') }));
    const badRes = await healthGet();
    expect(badRes.status).toBe(503);
    const badJson = await badRes.json();
    expect(badJson.status).toBe('degraded');
    expect(badJson.checks.database).toBe('unreachable');
  });

  it('middleware protects /admin/* and private APIs while allowing GET /api/v1/merchant/settings', async () => {
    // 1. Unauthenticated /admin/dashboard -> redirect to /dsb?next=...
    const unauthAdminReq = new NextRequest('http://localhost/admin/dashboard');
    const unauthAdminRes = await middleware(unauthAdminReq);
    expect(unauthAdminRes.status).toBe(307);
    expect(unauthAdminRes.headers.get('location')).toContain('/dsb?next=%2Fadmin%2Fdashboard');

    // 2. Unauthenticated private APIs -> 401
    for (const url of [
      'http://localhost/api/v1/customers',
      'http://localhost/api/v1/notifications/push',
    ]) {
      const res = await middleware(new NextRequest(url));
      expect(res.status).toBe(401);
    }

    const postSettingsRes = await middleware(
      new NextRequest('http://localhost/api/v1/merchant/settings', { method: 'POST' })
    );
    expect(postSettingsRes.status).toBe(401);

    // 3. Public exception: GET /api/v1/merchant/settings (and trailing slash) passes through
    const getSettingsRes = await middleware(
      new NextRequest('http://localhost/api/v1/merchant/settings', { method: 'GET' })
    );
    expect(getSettingsRes.status).toBe(200);

    const getSettingsSlashRes = await middleware(
      new NextRequest('http://localhost/api/v1/merchant/settings/', { method: 'GET' })
    );
    expect(getSettingsSlashRes.status).toBe(200);

    const postSettingsSlashRes = await middleware(
      new NextRequest('http://localhost/api/v1/merchant/settings/', { method: 'POST' })
    );
    expect(postSettingsSlashRes.status).toBe(401);

    const headSettingsRes = await middleware(
      new NextRequest('http://localhost/api/v1/merchant/settings', { method: 'HEAD' })
    );
    expect(headSettingsRes.status).toBe(401);

    // 4. Cashier role blocked from /api/v1/customers (403) and /admin/settings (redirect)
    const cashierToken = await signSessionToken({
      userId: 'emp-3',
      merchantId: 'merch-1',
      merchantSlug: 'cafe-canelo',
      role: 'cashier',
      name: 'Santiago',
    });
    const cashierApiRes = await middleware(
      new NextRequest('http://localhost/api/v1/customers', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${cashierToken}` },
      })
    );
    expect(cashierApiRes.status).toBe(403);

    const cashierSettingsRes = await middleware(
      new NextRequest('http://localhost/admin/settings', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${cashierToken}` },
      })
    );
    expect(cashierSettingsRes.status).toBe(307);
    expect(cashierSettingsRes.headers.get('location')).toContain('/admin/dashboard?error=forbidden');

    // 5. Manager role allowed on /admin/settings and /api/v1/customers
    const managerToken = await signSessionToken({
      userId: 'emp-4',
      merchantId: 'merch-1',
      merchantSlug: 'cafe-canelo',
      role: 'manager',
      name: 'Laura',
    });
    const managerRes = await middleware(
      new NextRequest('http://localhost/api/v1/customers', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${managerToken}` },
      })
    );
    expect(managerRes.status).toBe(200);
    expect(managerRes.headers.get('x-middleware-request-x-fidelizia-role')).toBe('manager');
  });

  it('POST /api/v1/auth/login does NOT mutate getSupabaseAdmin() service_role authorization on owner email signInWithPassword', async () => {
    const capturedAuthHeaders: Array<{ url: string; authorization: string | null }> = [];
    const ownerUserId = 'owner-uuid-1';
    const merchantRow = {
      id: '00000000-0000-0000-0000-000000000001',
      slug: 'cafe-canelo',
      name: 'Café Canelo',
      is_active: true,
      user_id: ownerUserId,
    };

    const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined)
      );
      capturedAuthHeaders.push({
        url,
        authorization: headers.get('authorization'),
      });

      if (url.includes('/rest/v1/merchants')) {
        return new Response(JSON.stringify(merchantRow), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/rest/v1/employees')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/auth/v1/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'USER_JWT_ATTACKER_OR_OWNER',
            token_type: 'bearer',
            expires_in: 3600,
            refresh_token: 'refresh-tok',
            user: { id: ownerUserId, email: 'owner@canelo.com', aud: 'authenticated' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      if (url.includes('/rest/v1/customers')) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });

    vi.stubGlobal('fetch', fetchStub);

    // Initialize real singleton before login
    const adminSingleton = getSupabaseAdmin();
    expect(adminSingleton).toBeDefined();

    const ownerLoginReq = new NextRequest('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': '198.51.100.10' },
      body: JSON.stringify({
        merchantSlug: 'cafe-canelo',
        identifier: 'owner@canelo.com',
        secret: 'OwnerPassword123!',
      }),
    });

    const loginRes = await loginPost(ownerLoginReq);
    expect(loginRes.status).toBe(200);
    const loginBody = await loginRes.json();
    expect(loginBody.session.role).toBe('admin');

    // Subsequent DB call via getSupabaseAdmin() MUST still send SUPABASE_SERVICE_ROLE_KEY
    await getSupabaseAdmin().from('customers').select('*');

    const customerCall = capturedAuthHeaders.find((c) => c.url.includes('/rest/v1/customers'));
    expect(customerCall).toBeDefined();
    expect(customerCall?.authorization).toBe('Bearer service-role-test-key');
  });

  it('POST /api/v1/auth/login enforces per-account rate limiting even when IP headers rotate', async () => {
    const pinHash = await hashSecret('9999', 4);
    const mockClient = createAuthSupabaseMock({
      merchant: {
        id: '00000000-0000-0000-0000-000000000001',
        slug: 'cafe-canelo',
        name: 'Café Canelo',
        is_active: true,
        user_id: null,
      },
      employees: [
        {
          id: '00000000-0000-0000-0000-000000000004',
          merchant_id: '00000000-0000-0000-0000-000000000001',
          name: 'Laura',
          username: 'laura',
          email: null,
          pin_hash: pinHash,
          password_hash: null,
          dsb_password_hash: null,
          role: 'manager',
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ],
    });
    setSupabaseAdminForTests(mockClient);

    // Rotate IP headers across 10 failed attempts for the same account
    for (let i = 1; i <= 10; i++) {
      const req = new NextRequest('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': `203.0.113.${i}`,
        },
        body: JSON.stringify({
          merchantSlug: 'cafe-canelo',
          identifier: 'laura',
          secret: String(1000 + i),
        }),
      });
      const res = await loginPost(req);
      expect(res.status).toBe(401);
    }

    // 11th attempt from a brand new IP must be blocked with 429 by per-account limiter
    const eleventhReq = new NextRequest('http://localhost/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.77',
      },
      body: JSON.stringify({
        merchantSlug: 'cafe-canelo',
        identifier: 'LAURA',
        secret: '9999',
      }),
    });
    const eleventhRes = await loginPost(eleventhReq);
    expect(eleventhRes.status).toBe(429);
  });

  it('sets protocol-aware Secure cookie flag (omitted on http://, set on https:// or x-forwarded-proto: https)', async () => {
    const pinHash = await hashSecret('9999', 4);
    const mockClient = createAuthSupabaseMock({
      merchant: {
        id: '00000000-0000-0000-0000-000000000001',
        slug: 'cafe-canelo',
        name: 'Café Canelo',
        is_active: true,
        user_id: null,
      },
      employees: [
        {
          id: '00000000-0000-0000-0000-000000000004',
          merchant_id: '00000000-0000-0000-0000-000000000001',
          name: 'Laura',
          username: 'laura',
          email: null,
          pin_hash: pinHash,
          password_hash: null,
          dsb_password_hash: null,
          role: 'manager',
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ],
    });
    setSupabaseAdminForTests(mockClient);

    vi.stubEnv('NODE_ENV', 'production');
    try {
      const httpLoginRes = await loginPost(
        new NextRequest('http://127.0.0.1:3000/api/v1/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-real-ip': '10.0.0.11' },
          body: JSON.stringify({ merchantSlug: 'cafe-canelo', identifier: 'laura', secret: '9999' }),
        })
      );
      expect(httpLoginRes.status).toBe(200);
      expect(httpLoginRes.headers.get('set-cookie')?.toLowerCase()).not.toContain('secure');

      const httpsProxyLoginRes = await loginPost(
        new NextRequest('http://127.0.0.1:3000/api/v1/auth/login', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-real-ip': '10.0.0.12',
            'x-forwarded-proto': 'https',
          },
          body: JSON.stringify({ merchantSlug: 'cafe-canelo', identifier: 'laura', secret: '9999' }),
        })
      );
      expect(httpsProxyLoginRes.status).toBe(200);
      expect(httpsProxyLoginRes.headers.get('set-cookie')?.toLowerCase()).toContain('secure');

      const httpLogoutRes = await logoutPost(
        new NextRequest('http://127.0.0.1:3000/api/v1/auth/logout', { method: 'POST' })
      );
      expect(httpLogoutRes.headers.get('set-cookie')?.toLowerCase()).not.toContain('secure');

      const httpsLogoutRes = await logoutPost(
        new NextRequest('https://fidelizia.app/api/v1/auth/logout', { method: 'POST' })
      );
      expect(httpsLogoutRes.headers.get('set-cookie')?.toLowerCase()).toContain('secure');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
