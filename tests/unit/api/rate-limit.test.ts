import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyRateLimit,
  checkRateLimit,
  extractClientIp,
  resetRateLimiterForTests,
} from '@/lib/api/rate-limit';

describe('api/rate-limit', () => {
  beforeEach(() => {
    resetRateLimiterForTests();
  });

  it('allows up to limit requests, returns 429 with Retry-After, and resets after windowMs', async () => {
    let fakeNow = 1_000_000;
    const now = () => fakeNow;
    const req = new Request('http://localhost/api/v1/auth/login', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });

    const r1 = applyRateLimit(req, 'login', { limit: 2, windowMs: 60_000, now });
    expect(r1.allowed).toBe(true);

    const r2 = applyRateLimit(req, 'login', { limit: 2, windowMs: 60_000, now });
    expect(r2.allowed).toBe(true);

    const r3 = applyRateLimit(req, 'login', { limit: 2, windowMs: 60_000, now });
    expect(r3.allowed).toBe(false);
    if (!r3.allowed) {
      expect(r3.response.status).toBe(429);
      expect(r3.response.headers.get('Retry-After')).toBe('60');
    }

    // Advance past window
    fakeNow += 60_001;
    const r4 = applyRateLimit(req, 'login', { limit: 2, windowMs: 60_000, now });
    expect(r4.allowed).toBe(true);
  });

  it('rejects immediately when limit <= 0 (including first hit)', () => {
    const now = () => 5_000_000;
    const zero = checkRateLimit('zero-key', { limit: 0, windowMs: 60_000, now });
    expect(zero.allowed).toBe(false);
    expect(zero.remaining).toBe(0);

    const negative = checkRateLimit('neg-key', { limit: -2, windowMs: 60_000, now });
    expect(negative.allowed).toBe(false);
    expect(negative.remaining).toBe(0);
  });

  it('prefers trusted proxy headers (x-vercel-forwarded-for, cf-connecting-ip, x-real-ip) over x-forwarded-for', () => {
    const vercelReq = new Request('http://localhost/api/v1/auth/login', {
      headers: {
        'x-vercel-forwarded-for': '198.51.100.42',
        'x-forwarded-for': '10.0.0.1',
      },
    });
    expect(extractClientIp(vercelReq)).toBe('198.51.100.42');

    const cfReq = new Request('http://localhost/api/v1/auth/login', {
      headers: {
        'cf-connecting-ip': '203.0.113.55',
        'x-real-ip': '192.0.2.10',
        'x-forwarded-for': '10.0.0.1',
      },
    });
    expect(extractClientIp(cfReq)).toBe('203.0.113.55');

    const realIpReq = new Request('http://localhost/api/v1/auth/login', {
      headers: {
        'x-real-ip': '192.0.2.10',
        'x-forwarded-for': '10.0.0.1',
      },
    });
    expect(extractClientIp(realIpReq)).toBe('192.0.2.10');
  });

  it('never evicts actively blocked buckets under 5000+ key flood and fails closed when all slots are blocked', () => {
    const now = () => 10_000_000;
    const blockedIp = '198.51.100.99';

    // Block target IP (limit 3)
    for (let i = 0; i < 3; i++) {
      const res = applyRateLimit(
        new Request('http://localhost/api/v1/auth/login', {
          headers: { 'x-real-ip': blockedIp },
        }),
        'login',
        { limit: 3, windowMs: 60_000, now }
      );
      expect(res.allowed).toBe(true);
    }
    const blockedRes = applyRateLimit(
      new Request('http://localhost/api/v1/auth/login', {
        headers: { 'x-real-ip': blockedIp },
      }),
      'login',
      { limit: 3, windowMs: 60_000, now }
    );
    expect(blockedRes.allowed).toBe(false);

    // Flood with 5005 distinct spoofed IPs (1 non-blocked request each)
    for (let i = 0; i < 5005; i++) {
      applyRateLimit(
        new Request('http://localhost/api/v1/auth/login', {
          headers: { 'x-real-ip': `203.0.${Math.floor(i / 250)}.${(i % 250) + 1}` },
        }),
        'login',
        { limit: 3, windowMs: 60_000, now }
      );
    }

    // Original blocked IP MUST still be blocked
    const stillBlocked = applyRateLimit(
      new Request('http://localhost/api/v1/auth/login', {
        headers: { 'x-real-ip': blockedIp },
      }),
      'login',
      { limit: 3, windowMs: 60_000, now }
    );
    expect(stillBlocked.allowed).toBe(false);

    // Now test saturation: 5000 actively blocked keys -> 5001st unknown key must fail closed
    resetRateLimiterForTests();
    for (let i = 0; i < 5000; i++) {
      expect(checkRateLimit(`saturated:${i}`, { limit: 1, windowMs: 60_000, now }).allowed).toBe(true);
    }
    const overflowResult = checkRateLimit('saturated:overflow', { limit: 1, windowMs: 60_000, now });
    expect(overflowResult.allowed).toBe(false);
  });
});
