export const SESSION_COOKIE_NAME = 'fidelizia_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export type ServerRole = 'admin' | 'manager' | 'cashier';

export interface ServerSession {
  userId: string;
  merchantId: string;
  merchantSlug: string;
  role: ServerRole;
  name: string;
}

export interface SessionTokenPayload extends ServerSession {
  iat: number;
  exp: number;
}

const VALID_ROLES: ReadonlySet<string> = new Set<ServerRole>(['admin', 'manager', 'cashier']);

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function importHmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages
  );
}

export function getSessionSecret(secretOverride?: string): string {
  const raw = secretOverride ?? process.env.AUTH_SESSION_SECRET ?? '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length < 32) {
    throw new Error('[Auth] AUTH_SESSION_SECRET must be configured and at least 32 characters');
  }
  return trimmed;
}

export async function signSessionToken(
  session: ServerSession,
  options?: { ttlSeconds?: number; secret?: string; nowSeconds?: number }
): Promise<string> {
  const secret = getSessionSecret(options?.secret);
  const now = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ttl = options?.ttlSeconds ?? SESSION_TTL_SECONDS;

  const payload: SessionTokenPayload = {
    userId: session.userId,
    merchantId: session.merchantId,
    merchantSlug: session.merchantSlug,
    role: session.role,
    name: session.name,
    iat: now,
    exp: now + ttl,
  };

  const encoder = new TextEncoder();
  const payloadB64 = encodeBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret, ['sign']);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  const sigB64 = encodeBase64Url(new Uint8Array(signatureBuffer));

  return `${payloadB64}.${sigB64}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
  options?: { secret?: string; nowSeconds?: number }
): Promise<ServerSession | null> {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  const sigBytes = decodeBase64Url(sigB64);
  const payloadBytes = decodeBase64Url(payloadB64);
  if (!sigBytes || !payloadBytes) return null;

  let secret: string;
  try {
    secret = getSessionSecret(options?.secret);
  } catch {
    return null;
  }

  try {
    const encoder = new TextEncoder();
    const key = await importHmacKey(secret, ['verify']);
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      Uint8Array.from(sigBytes),
      encoder.encode(payloadB64)
    );
    if (!isValid) return null;

    const decodedText = new TextDecoder().decode(payloadBytes);
    const parsed = JSON.parse(decodedText) as Partial<SessionTokenPayload>;

    const now = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (typeof parsed.exp !== 'number' || !Number.isFinite(parsed.exp) || parsed.exp <= now) {
      return null;
    }

    if (
      typeof parsed.userId !== 'string' ||
      parsed.userId.trim().length === 0 ||
      typeof parsed.merchantId !== 'string' ||
      parsed.merchantId.trim().length === 0 ||
      typeof parsed.merchantSlug !== 'string' ||
      parsed.merchantSlug.trim().length === 0 ||
      typeof parsed.name !== 'string' ||
      parsed.name.trim().length === 0 ||
      typeof parsed.role !== 'string' ||
      !VALID_ROLES.has(parsed.role)
    ) {
      return null;
    }

    return {
      userId: parsed.userId,
      merchantId: parsed.merchantId,
      merchantSlug: parsed.merchantSlug,
      role: parsed.role as ServerRole,
      name: parsed.name,
    };
  } catch {
    return null;
  }
}
