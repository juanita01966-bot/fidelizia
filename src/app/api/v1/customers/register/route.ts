import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, extractClientIp } from '@/lib/api/rate-limit';
import { parseJsonBody } from '@/lib/api/validation';
import { customerRepo, merchantRepo, passRepo, referralRepo } from '@/lib/repositories';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { CustomerRegisterSchema } from '@/types/domain';
import { REFERRAL_COOKIE_NAME } from '@/types/referrals';

export const runtime = 'nodejs';

function generateSerialNumber(merchantSlug: string): string {
  const prefix = merchantSlug
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 6) || 'FIDZ';
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `PASS-${prefix}-${rand}`;
}

function isUniqueViolation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('23505') || /duplicate key|unique constraint/i.test(msg);
}

export async function POST(req: NextRequest) {
  const rateLimit = applyRateLimit(req, 'customers:register', {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  const parsed = await parseJsonBody(req, CustomerRegisterSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const {
    fullName,
    phone,
    birthdate,
    passType,
    merchantSlug,
    serialNumber,
    referralCode: bodyReferralCode,
  } = parsed.data;
  const targetSlug = (merchantSlug || 'cafe-canelo').trim().toLowerCase();

  try {
    const supabase = getSupabaseAdmin();
    const merchant = await merchantRepo.getBySlug(supabase, targetSlug);
    if (!merchant) {
      return NextResponse.json(
        { error: 'MERCHANT_NOT_FOUND', message: 'Comercio no encontrado o inactivo' },
        { status: 404, headers: rateLimit.headers }
      );
    }

    const existingCustomer = await customerRepo.findByPhone(supabase, merchant.id, phone);
    let customer = existingCustomer;
    let isNewCustomer = false;

    if (!customer) {
      try {
        customer = await customerRepo.create(supabase, merchant.id, {
          fullName,
          phone,
          birthdate: birthdate ?? null,
          termsAcceptedAt: new Date().toISOString(),
        });
        isNewCustomer = true;
      } catch (createErr) {
        if (isUniqueViolation(createErr)) {
          customer = await customerRepo.findByPhone(supabase, merchant.id, phone);
          isNewCustomer = false;
        }
        if (!customer) {
          throw createErr;
        }
      }
    }

    const effectiveReferralCode =
      bodyReferralCode?.trim() || req.cookies.get(REFERRAL_COOKIE_NAME)?.value?.trim() || null;

    let referralAttribution: { attributed: boolean; promoterCode?: string } | null = null;
    if (isNewCustomer && effectiveReferralCode) {
      try {
        const attrResult = await referralRepo.attributeNewCustomer(supabase, {
          merchantId: merchant.id,
          customerId: customer.id,
          customerPhone: customer.phone,
          referralCode: effectiveReferralCode,
          ip: extractClientIp(req),
          userAgent: req.headers.get('user-agent'),
        });
        if (attrResult.attributed) {
          referralAttribution = {
            attributed: true,
            promoterCode: attrResult.promoterCode,
          };
        }
      } catch (refErr: unknown) {
        const refMsg = refErr instanceof Error ? refErr.message : String(refErr);
        console.error('[Customer Register Referral Attribution Error]:', refMsg);
      }
    }

    let pass = await passRepo.getByCustomerAndType(supabase, merchant.id, customer.id, passType);
    if (!pass) {
      const requestedSerial = serialNumber?.trim();
      const serialToUse = requestedSerial || generateSerialNumber(merchant.slug);
      const authenticationToken = crypto.randomBytes(24).toString('hex');

      try {
        pass = await passRepo.create(supabase, {
          merchantId: merchant.id,
          customerId: customer.id,
          passType,
          serialNumber: serialToUse,
          authenticationToken,
          initialStamps: 1,
          initialVisits: 1,
        });
      } catch (passErr) {
        if (isUniqueViolation(passErr)) {
          pass = await passRepo.getByCustomerAndType(supabase, merchant.id, customer.id, passType);
          if (!pass && !requestedSerial) {
            pass = await passRepo.create(supabase, {
              merchantId: merchant.id,
              customerId: customer.id,
              passType,
              serialNumber: generateSerialNumber(merchant.slug),
              authenticationToken: crypto.randomBytes(24).toString('hex'),
              initialStamps: 1,
              initialVisits: 1,
            });
          }
        }
        if (!pass) {
          throw passErr;
        }
      }
    }

    const { authentication_token: _omittedAuth, ...safePass } = pass;

    return NextResponse.json(
      {
        success: true,
        isNewCustomer,
        referral: referralAttribution,
        customer,
        pass: safePass,
        merchant: {
          id: merchant.id,
          name: merchant.name,
          slug: merchant.slug,
          stamps_needed: merchant.stamps_needed,
          reward_description: merchant.reward_description,
        },
      },
      { status: 201, headers: rateLimit.headers }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al registrar cliente';
    console.error('[Customer Register Error]:', message);
    return NextResponse.json(
      { error: 'REGISTER_FAILED', message: 'No fue posible completar el registro' },
      { status: 500 }
    );
  }
}
