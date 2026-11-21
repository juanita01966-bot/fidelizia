import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getSessionSecret,
  signSessionToken,
  verifySessionToken,
  type ServerSession,
} from '@/lib/auth/token';

const TEST_SECRET = 'test-secret-fidelizia-32-chars-minimum-key!!';

const SAMPLE_SESSION: ServerSession = {
  userId: '00000000-0000-0000-0000-000000000004',
  merchantId: '00000000-0000-0000-0000-000000000001',
  merchantSlug: 'cafe-canelo',
  role: 'manager',
  name: 'Laura Gerente (Canjes)',
};

describe('auth/token (Web Crypto HMAC-SHA256)', () => {
  const originalSecret = process.env.AUTH_SESSION_SECRET;

  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.AUTH_SESSION_SECRET;
    } else {
      process.env.AUTH_SESSION_SECRET = originalSecret;
    }
  });

  it('fails fast when AUTH_SESSION_SECRET is missing or shorter than 32 characters', async () => {
    delete process.env.AUTH_SESSION_SECRET;
    expect(() => getSessionSecret()).toThrow(/AUTH_SESSION_SECRET/);
    await expect(signSessionToken(SAMPLE_SESSION)).rejects.toThrow(/AUTH_SESSION_SECRET/);

    process.env.AUTH_SESSION_SECRET = 'too-short-secret';
    expect(() => getSessionSecret()).toThrow(/32 characters/);
  });

  it('signs and verifies a valid ServerSession roundtrip', async () => {
    const token = await signSessionToken(SAMPLE_SESSION, { nowSeconds: 1_700_000_000 });
    expect(token.split('.')).toHaveLength(2);

    const verified = await verifySessionToken(token, { nowSeconds: 1_700_000_100 });
    expect(verified).toEqual(SAMPLE_SESSION);
  });

  it('rejects tokens with tampered payload or tampered signature', async () => {
    const token = await signSessionToken(SAMPLE_SESSION, { nowSeconds: 1_700_000_000 });
    const [payloadB64, sigB64] = token.split('.');

    const tamperedPayload = `${payloadB64.slice(0, -1)}A.${sigB64}`;
    expect(await verifySessionToken(tamperedPayload, { nowSeconds: 1_700_000_100 })).toBeNull();

    const tamperedSig = `${payloadB64}.${sigB64.slice(0, -2)}ZZ`;
    expect(await verifySessionToken(tamperedSig, { nowSeconds: 1_700_000_100 })).toBeNull();
  });

  it('rejects expired tokens and malformed token strings', async () => {
    const token = await signSessionToken(SAMPLE_SESSION, {
      ttlSeconds: 60,
      nowSeconds: 1_700_000_000,
    });

    expect(await verifySessionToken(token, { nowSeconds: 1_700_000_059 })).toEqual(SAMPLE_SESSION);
    expect(await verifySessionToken(token, { nowSeconds: 1_700_000_060 })).toBeNull();
    expect(await verifySessionToken('')).toBeNull();
    expect(await verifySessionToken(null)).toBeNull();
    expect(await verifySessionToken('not.a.valid.jwt.token')).toBeNull();
  });

  it('rejects tokens signed with a different secret', async () => {
    const token = await signSessionToken(SAMPLE_SESSION, {
      secret: TEST_SECRET,
      nowSeconds: 1_700_000_000,
    });
    const verified = await verifySessionToken(token, {
      secret: 'another-completely-different-32-char-secret!!',
      nowSeconds: 1_700_000_010,
    });
    expect(verified).toBeNull();
  });
});
