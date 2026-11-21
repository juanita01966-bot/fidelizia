import { NextResponse } from 'next/server';

interface RateLimitBucket {
  count: number;
  limit: number;
  resetAtMs: number;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  retryAfterSeconds: number;
}

const MAX_BUCKETS = 5000;
const buckets = new Map<string, RateLimitBucket>();

function pruneExpiredBuckets(nowMs: number): void {
  if (buckets.size === 0) return;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAtMs <= nowMs) {
      buckets.delete(key);
    }
  }
}

function evictUnblockedBucketsIfFull(): void {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets.entries()) {
    // NEVER evict actively blocked buckets (count >= limit) under flood
    if (bucket.count < bucket.limit) {
      buckets.delete(key);
      if (buckets.size < MAX_BUCKETS) break;
    }
  }
}

function firstHeaderIp(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
}

export function extractClientIp(req: Request): string {
  return (
    firstHeaderIp(req.headers.get('x-vercel-forwarded-for')) ??
    firstHeaderIp(req.headers.get('cf-connecting-ip')) ??
    firstHeaderIp(req.headers.get('x-real-ip')) ??
    firstHeaderIp(req.headers.get('x-forwarded-for')) ??
    '127.0.0.1'
  );
}

export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number; now?: () => number }
): RateLimitCheckResult {
  const nowMs = opts.now ? opts.now() : Date.now();
  const safeWindowMs = Math.max(0, opts.windowMs);
  const defaultRetryAfter = Math.max(1, Math.ceil(safeWindowMs / 1000));

  if (opts.limit <= 0) {
    return {
      allowed: false,
      limit: Math.max(0, opts.limit),
      remaining: 0,
      resetAtMs: nowMs + safeWindowMs,
      retryAfterSeconds: defaultRetryAfter,
    };
  }

  if (buckets.size >= 500) {
    pruneExpiredBuckets(nowMs);
  }

  const existing = buckets.get(key);
  if (existing && existing.resetAtMs <= nowMs) {
    buckets.delete(key);
  }

  const active = buckets.get(key);
  if (!active) {
    pruneExpiredBuckets(nowMs);
    if (buckets.size >= MAX_BUCKETS) {
      evictUnblockedBucketsIfFull();
    }
    if (buckets.size >= MAX_BUCKETS) {
      // Fail closed if all MAX_BUCKETS slots are held by active blocked entries
      return {
        allowed: false,
        limit: opts.limit,
        remaining: 0,
        resetAtMs: nowMs + safeWindowMs,
        retryAfterSeconds: defaultRetryAfter,
      };
    }

    const resetAtMs = nowMs + safeWindowMs;
    buckets.set(key, { count: 1, limit: opts.limit, resetAtMs });
    return {
      allowed: true,
      limit: opts.limit,
      remaining: Math.max(0, opts.limit - 1),
      resetAtMs,
      retryAfterSeconds: defaultRetryAfter,
    };
  }

  active.count += 1;
  active.limit = opts.limit;
  const remaining = Math.max(0, opts.limit - active.count);
  const retryAfterSeconds = Math.max(1, Math.ceil((active.resetAtMs - nowMs) / 1000));

  return {
    allowed: active.count <= opts.limit,
    limit: opts.limit,
    remaining,
    resetAtMs: active.resetAtMs,
    retryAfterSeconds,
  };
}

export function applyRateLimit(
  req: Request,
  keyPrefix: string,
  opts: {
    limit: number;
    windowMs: number;
    keySuffix?: string;
    includeIp?: boolean;
    now?: () => number;
  }
):
  | { allowed: true; headers: Record<string, string> }
  | { allowed: false; response: NextResponse } {
  let key: string;
  if (opts.includeIp === false) {
    key = opts.keySuffix ? `${keyPrefix}:${opts.keySuffix}` : keyPrefix;
  } else {
    const ip = extractClientIp(req);
    key = opts.keySuffix ? `${keyPrefix}:${ip}:${opts.keySuffix}` : `${keyPrefix}:${ip}`;
  }
  const result = checkRateLimit(key, {
    limit: opts.limit,
    windowMs: opts.windowMs,
    now: opts.now,
  });

  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAtMs / 1000)),
  };

  if (!result.allowed) {
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Demasiadas solicitudes. Intenta nuevamente en unos segundos.',
        },
        {
          status: 429,
          headers: {
            ...headers,
            'Retry-After': String(result.retryAfterSeconds),
          },
        }
      ),
    };
  }

  return { allowed: true, headers };
}

export function resetRateLimiterForTests(): void {
  buckets.clear();
}
