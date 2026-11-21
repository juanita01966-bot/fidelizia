import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, extractClientIp } from '@/lib/api/rate-limit';
import { referralRepo } from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import {
  REFERRAL_COOKIE_NAME,
  isValidReferralCode,
  normalizeReferralCode,
} from '@/types/referrals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REFERRAL_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function resolveCookieSecure(req: NextRequest): boolean {
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  if (forwardedProto === 'https') return true;
  if (forwardedProto === 'http') return false;
  return req.url.toLowerCase().startsWith('https://');
}

function redirectInvalid(req: NextRequest, rateHeaders?: Record<string, string>): NextResponse {
  const fallbackUrl = new URL('/', req.url);
  fallbackUrl.searchParams.set('ref_invalid', '1');
  const res = NextResponse.redirect(fallbackUrl, { status: 302 });
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (rateHeaders) {
    for (const [k, v] of Object.entries(rateHeaders)) {
      res.headers.set(k, v);
    }
  }
  return res;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const rateLimit = applyRateLimit(req, 'referrals:qr-redirect', {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  const { code: rawCode } = await params;
  const normalizedCode = normalizeReferralCode(rawCode ?? '');
  if (!isValidReferralCode(normalizedCode)) {
    return redirectInvalid(req, rateLimit.headers);
  }

  const supabase = getSupabaseAdmin();

  let lookup: Awaited<ReturnType<typeof referralRepo.findActivePromoterByCode>> = null;
  try {
    lookup = await referralRepo.findActivePromoterByCode(supabase, normalizedCode);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Referral Redirect Lookup Error]:', message);
    return redirectInvalid(req, rateLimit.headers);
  }

  if (!lookup) {
    return redirectInvalid(req, rateLimit.headers);
  }

  // Record QR scan safely — tracking failure must never interrupt user redirect
  const clientIp = extractClientIp(req);
  const userAgent = req.headers.get('user-agent');
  try {
    await referralRepo.recordQrVisit(supabase, {
      merchantId: lookup.merchant.id,
      campaignId: lookup.campaign.id,
      promoterId: lookup.promoter.id,
      ip: clientIp,
      userAgent,
    });
  } catch (visitErr: unknown) {
    const message = visitErr instanceof Error ? visitErr.message : String(visitErr);
    console.error('[Referral QR Visit Record Error]:', message);
  }

  // First-touch attribution fairness: keep existing valid fidz_ref cookie if present
  const existingCookieRaw = req.cookies.get(REFERRAL_COOKIE_NAME)?.value;
  const existingCookieCode = existingCookieRaw ? normalizeReferralCode(existingCookieRaw) : '';
  const hasFirstTouch = isValidReferralCode(existingCookieCode);
  const effectiveRefCode = hasFirstTouch ? existingCookieCode : lookup.promoter.code;

  const destination = new URL(`/join/${encodeURIComponent(lookup.merchant.slug)}`, req.url);
  destination.searchParams.set('ref', effectiveRefCode);

  const res = NextResponse.redirect(destination, { status: 302 });
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  for (const [k, v] of Object.entries(rateLimit.headers)) {
    res.headers.set(k, v);
  }

  if (!hasFirstTouch) {
    res.cookies.set(REFERRAL_COOKIE_NAME, lookup.promoter.code, {
      path: '/',
      maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
      sameSite: 'lax',
      httpOnly: false,
      secure: resolveCookieSecure(req),
    });
  }

  return res;
}
