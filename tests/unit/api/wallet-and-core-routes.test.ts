import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hashSecret } from '@/lib/auth/password';
import { SESSION_COOKIE_NAME, signSessionToken } from '@/lib/auth/token';
import { resetRateLimiterForTests } from '@/lib/api/rate-limit';
import { resetSupabaseAdmin, setSupabaseAdminForTests, type SupabaseAdminClient } from '@/lib/supabase/server';
import {
  customerRepo,
  employeeRepo,
  feedbackRepo,
  fraudAlertRepo,
  merchantRepo,
  passRepo,
  PosRpcError,
  redemptionRepo,
  reservationRepo,
  transactionRepo,
} from '@/lib/repositories';
import * as googleWallet from '@/lib/wallet/google-wallet-service';
import * as appleWallet from '@/lib/wallet/apple-wallet-service';
import { POST as pushPost } from '@/app/api/v1/notifications/push/route';
import { POST as scanVisitPost } from '@/app/api/v1/pos/scan-visit/route';
import { POST as redeemRewardPost } from '@/app/api/v1/pos/redeem-reward/route';
import { POST as registerPost } from '@/app/api/v1/customers/register/route';
import { POST as bookingsPost } from '@/app/api/v1/bookings/route';
import { POST as feedbackPost } from '@/app/api/v1/feedback/route';
import { GET as settingsGet, POST as settingsPost } from '@/app/api/v1/merchant/settings/route';
import type { Customer, Location, Merchant, WalletPass } from '@/types/domain';

const TEST_SECRET = 'fidelizia-unit-secret-key-32-chars-minimum!';
const MERCHANT_ID = '00000000-0000-0000-0000-000000000001';
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000005';
const PASS_ID = '00000000-0000-0000-0000-000000000006';

function baseEntities(): {
  merchant: Merchant;
  customer: Customer;
  googlePass: WalletPass;
  applePass: WalletPass;
  location: Location;
} {
  const now = '2026-11-20T18:00:00.000Z';
  const merchant: Merchant = {
    id: MERCHANT_ID,
    user_id: 'owner-1',
    name: 'Café Canelo',
    slug: 'cafe-canelo',
    logo_url: 'https://fidelizia.app/logo.png',
    brand_color: '#8b5cf6',
    secondary_color: '#d4a373',
    google_place_id: 'ChIJ_TEST_PLACE',
    stamps_needed: 10,
    reward_description: 'Café + Croissant',
    cooldown_hours: 3,
    scanner_geofence_meters: 250,
    opening_hours: {},
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  const customer: Customer = {
    id: CUSTOMER_ID,
    merchant_id: MERCHANT_ID,
    phone: '+573001234567',
    full_name: 'Carlos Mendoza',
    birthdate: '1990-02-15',
    loyalty_tier: 'silver',
    rfm_segment: 'loyal',
    terms_accepted_at: now,
    created_at: now,
    updated_at: now,
  };
  const googlePass: WalletPass = {
    id: PASS_ID,
    merchant_id: MERCHANT_ID,
    customer_id: CUSTOMER_ID,
    pass_serial_number: 'PASS-CANELO-001',
    pass_type: 'google',
    authentication_token: 'abc123def456abc123def456abc123def456abc123def456',
    push_token: null,
    current_stamps: 6,
    total_visits: 6,
    total_rewards_redeemed: 1,
    last_visit_at: now,
    status: 'active',
    created_at: now,
    updated_at: now,
  };
  const applePass: WalletPass = {
    ...googlePass,
    id: '00000000-0000-0000-0000-000000000016',
    pass_serial_number: 'PASS-CANELO-002',
    pass_type: 'apple',
  };
  const location: Location = {
    id: '00000000-0000-0000-0000-000000000002',
    merchant_id: MERCHANT_ID,
    name: 'Zona G',
    address: 'Calle 85',
    latitude: 4.6682,
    longitude: -74.0538,
    radius_meters: 250,
    relevant_text: 'Hola',
    is_active: true,
    created_at: now,
  };
  return { merchant, customer, googlePass, applePass, location };
}

async function makeAdminCookie(): Promise<string> {
  const token = await signSessionToken(
    {
      userId: '00000000-0000-0000-0000-000000000014',
      merchantId: MERCHANT_ID,
      merchantSlug: 'cafe-canelo',
      role: 'admin',
      name: 'Admin Canelo',
    },
    { secret: TEST_SECRET }
  );
  return `${SESSION_COOKIE_NAME}=${token}`;
}

describe('API v1 Core & Wallet Route Handlers', () => {
  const originalSecret = process.env.AUTH_SESSION_SECRET;

  beforeEach(() => {
    process.env.AUTH_SESSION_SECRET = TEST_SECRET;
    resetRateLimiterForTests();
    resetSupabaseAdmin();
    setSupabaseAdminForTests({ from: () => ({}) } as unknown as SupabaseAdminClient);
  });

  afterEach(() => {
    resetSupabaseAdmin();
    resetRateLimiterForTests();
    if (originalSecret === undefined) delete process.env.AUTH_SESSION_SECRET;
    else process.env.AUTH_SESSION_SECRET = originalSecret;
    vi.restoreAllMocks();
  });

  it('POST /api/v1/notifications/push with serialNumber resolves real pass without overwriting stamps to 1 or forcing google', async () => {
    const { merchant, customer, applePass, location } = baseEntities();
    // Simulate an Apple pass with 6 stamps
    applePass.current_stamps = 6;

    vi.spyOn(merchantRepo, 'getById').mockResolvedValue(merchant);
    const bundleSpy = vi
      .spyOn(passRepo, 'getWithCustomerAndMerchantBySerial')
      .mockResolvedValue({ pass: applePass, customer, merchant, locations: [location] });
    const applePushSpy = vi.spyOn(appleWallet, 'triggerApplePassUpdate').mockResolvedValue({
      success: true,
      sentCount: 1,
      failedCount: 0,
      cleanedTokens: 0,
      errors: [],
    });
    const googlePushSpy = vi.spyOn(googleWallet, 'sendGoogleWalletNotification');

    const cookieHeader = await makeAdminCookie();
    const req = new NextRequest('http://localhost/api/v1/notifications/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        serialNumber: 'PASS-CANELO-002',
        title: '2x1 Espresso',
        body: 'Solo por hoy en barra',
      }),
    });

    const res = await pushPost(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      appleWalletDelivered: number;
      googleWalletDelivered: number;
    };
    expect(json.appleWalletDelivered).toBe(1);
    expect(json.googleWalletDelivered).toBe(0);
    expect(bundleSpy).toHaveBeenCalledWith(expect.anything(), 'PASS-CANELO-002', MERCHANT_ID);
    expect(applePushSpy).toHaveBeenCalledTimes(1);
    // Ensure real stamps (6) and real pass_type ('apple') were preserved when passed to triggerApplePassUpdate
    const passedPass = applePushSpy.mock.calls[0][2];
    expect(passedPass.current_stamps).toBe(6);
    expect(passedPass.pass_type).toBe('apple');
    expect(googlePushSpy).not.toHaveBeenCalled();
  });

  it('POST /api/v1/pos/scan-visit validates bcrypt PIN, calls RPC, awaits wallet sync, and logs fraud_alerts on RPC rejection', async () => {
    const { merchant, customer, googlePass, location } = baseEntities();
    const cashierPinHash = await hashSecret('1234', 4);

    vi.spyOn(employeeRepo, 'listActiveAuthCandidates').mockResolvedValue([
      {
        id: '00000000-0000-0000-0000-000000000003',
        merchant_id: MERCHANT_ID,
        location_id: location.id,
        name: 'Mateo',
        username: 'mateo',
        email: null,
        pin_hash: cashierPinHash,
        dsb_password_hash: null,
        role: 'cashier',
        is_active: true,
        created_at: new Date().toISOString(),
      },
    ]);

    // 1. Wrong PIN returns 401
    const badReq = new NextRequest('http://localhost/api/v1/pos/scan-visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantId: MERCHANT_ID,
        employeePin: '9876',
        passSerialNumber: 'PASS-CANELO-001',
        ticketNumber: 'T-001',
        amount: 25000,
      }),
    });
    const badRes = await scanVisitPost(badReq);
    expect(badRes.status).toBe(401);

    // 2. Valid PIN runs RPC & awaits Google sync
    const rpcSpy = vi.spyOn(transactionRepo, 'processPosScan').mockResolvedValue({
      success: true,
      transaction_id: 'tx-1',
      pass_id: googlePass.id,
      pass_serial_number: googlePass.pass_serial_number,
      pass_type: 'google',
      customer_id: customer.id,
      customer_name: customer.full_name,
      location_id: location.id,
      loyalty_tier: 'silver',
      custom_reward: null,
      ticket_number: 'T-002',
      original_amount: 32000,
      discount_applied_percent: 0,
      final_amount: 32000,
      stamps_current: 7,
      stamps_needed: 10,
      reward_ready: false,
      reward_description: merchant.reward_description,
    });
    vi.spyOn(passRepo, 'getWithCustomerAndMerchantBySerial').mockResolvedValue({
      pass: { ...googlePass, current_stamps: 7 },
      customer,
      merchant,
      locations: [location],
    });
    const googleSyncSpy = vi
      .spyOn(googleWallet, 'syncGooglePassStamps')
      .mockResolvedValue({ success: true, status: 200 });

    const okReq = new NextRequest('http://localhost/api/v1/pos/scan-visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantId: MERCHANT_ID,
        employeePin: '1234',
        passSerialNumber: 'PASS-CANELO-001',
        ticketNumber: 'T-002',
        amount: 32000,
      }),
    });
    const okRes = await scanVisitPost(okReq);
    expect(okRes.status).toBe(200);
    const okJson = (await okRes.json()) as { walletSync: { google?: { success: boolean } } };
    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(googleSyncSpy).toHaveBeenCalledTimes(1);
    expect(okJson.walletSync.google?.success).toBe(true);

    // 3. Cooldown error from RPC records fraud alert
    vi.spyOn(transactionRepo, 'processPosScan').mockRejectedValue(
      new PosRpcError('COOLDOWN_ACTIVE', 429, 'Espera 3 horas', 'cooldown_violation')
    );
    vi.spyOn(passRepo, 'getBySerial').mockResolvedValue(googlePass);
    const fraudCreateSpy = vi.spyOn(fraudAlertRepo, 'create').mockResolvedValue({} as never);

    const cooldownReq = new NextRequest('http://localhost/api/v1/pos/scan-visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantId: MERCHANT_ID,
        employeePin: '1234',
        passSerialNumber: 'PASS-CANELO-001',
        ticketNumber: 'T-003',
        amount: 15000,
      }),
    });
    const cooldownRes = await scanVisitPost(cooldownReq);
    expect(cooldownRes.status).toBe(429);
    expect(fraudCreateSpy).toHaveBeenCalledTimes(1);
  });

  it('POST /api/v1/pos/redeem-reward rejects cashier PIN and succeeds for manager PIN', async () => {
    const { merchant, customer, googlePass, location } = baseEntities();
    const cashierPinHash = await hashSecret('1234', 4);
    const managerPinHash = await hashSecret('9999', 4);

    vi.spyOn(merchantRepo, 'getById').mockResolvedValue(merchant);
    vi.spyOn(employeeRepo, 'listActiveAuthCandidates').mockResolvedValue([
      {
        id: '00000000-0000-0000-0000-000000000003',
        merchant_id: MERCHANT_ID,
        location_id: location.id,
        name: 'Cajero',
        username: null,
        email: null,
        pin_hash: cashierPinHash,
        dsb_password_hash: null,
        role: 'cashier',
        is_active: true,
        created_at: new Date().toISOString(),
      },
      {
        id: '00000000-0000-0000-0000-000000000004',
        merchant_id: MERCHANT_ID,
        location_id: location.id,
        name: 'Gerente',
        username: null,
        email: null,
        pin_hash: managerPinHash,
        dsb_password_hash: null,
        role: 'manager',
        is_active: true,
        created_at: new Date().toISOString(),
      },
    ]);

    const cashierReq = new NextRequest('http://localhost/api/v1/pos/redeem-reward', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantId: MERCHANT_ID,
        passSerialNumber: 'PASS-CANELO-001',
        managerPin: '1234',
      }),
    });
    expect((await redeemRewardPost(cashierReq)).status).toBe(403);

    vi.spyOn(redemptionRepo, 'redeemReward').mockResolvedValue({
      success: true,
      redemption_id: 'red-1',
      customer_id: customer.id,
      customer_name: customer.full_name,
      pass_id: googlePass.id,
      pass_serial_number: googlePass.pass_serial_number,
      pass_type: 'google',
      stamps_deducted: 10,
      stamps_remaining: 0,
      total_rewards_redeemed: 2,
      loyalty_tier: 'silver',
      reward_name: 'Café + Croissant',
    });
    vi.spyOn(passRepo, 'getWithCustomerAndMerchantBySerial').mockResolvedValue({
      pass: { ...googlePass, current_stamps: 0 },
      customer,
      merchant,
      locations: [location],
    });
    vi.spyOn(googleWallet, 'syncGooglePassStamps').mockResolvedValue({ success: true, status: 200 });

    const managerReq = new NextRequest('http://localhost/api/v1/pos/redeem-reward', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantId: MERCHANT_ID,
        passSerialNumber: 'PASS-CANELO-001',
        managerPin: '9999',
      }),
    });
    const res = await redeemRewardPost(managerReq);
    expect(res.status).toBe(200);
  });

  it('POST /api/v1/customers/register enforces termsAccepted and creates pass with 48-char random auth token', async () => {
    const { merchant, customer, googlePass } = baseEntities();
    vi.spyOn(merchantRepo, 'getBySlug').mockResolvedValue(merchant);

    // 1. Missing termsAccepted returns 400
    const badReq = new NextRequest('http://localhost/api/v1/customers/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Sofía Castro',
        phone: '+573001112233',
        termsAccepted: false,
      }),
    });
    expect((await registerPost(badReq)).status).toBe(400);

    // 2. Valid request creates customer & pass with 48-hex-char auth token and redacts token in response
    vi.spyOn(customerRepo, 'findByPhone').mockResolvedValue(null);
    vi.spyOn(customerRepo, 'create').mockResolvedValue(customer);
    vi.spyOn(passRepo, 'getByCustomerAndType').mockResolvedValue(null);
    const passCreateSpy = vi.spyOn(passRepo, 'create').mockResolvedValue(googlePass);

    const okReq = new NextRequest('http://localhost/api/v1/customers/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Carlos Mendoza',
        phone: '+573001234567',
        passType: 'google',
        merchantSlug: 'cafe-canelo',
        termsAccepted: true,
      }),
    });
    const okRes = await registerPost(okReq);
    expect(okRes.status).toBe(201);
    const createArgs = passCreateSpy.mock.calls[0][1];
    expect(createArgs.authenticationToken).toMatch(/^[a-f0-9]{48}$/);
    const json = (await okRes.json()) as { pass: Record<string, unknown> };
    expect(json.pass.authentication_token).toBeUndefined();
  });

  it('POST /api/v1/bookings, POST /api/v1/feedback, and GET/POST /api/v1/merchant/settings persist and sync properly', async () => {
    const { merchant, customer, location } = baseEntities();

    // Bookings POST
    vi.spyOn(merchantRepo, 'getBySlug').mockResolvedValue(merchant);
    vi.spyOn(customerRepo, 'findByPhone').mockResolvedValue(customer);
    vi.spyOn(reservationRepo, 'create').mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000099',
      merchant_id: MERCHANT_ID,
      customer_id: CUSTOMER_ID,
      location_id: null,
      date_time: '2026-11-21T19:00:00.000Z',
      guests_count: 4,
      notes: 'Mesa tranquila',
      status: 'confirmed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const bookReq = new NextRequest('http://localhost/api/v1/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantSlug: 'cafe-canelo',
        customerPhone: '+573001234567',
        customerName: 'Carlos Mendoza',
        dateTime: '2026-11-21T19:00:00.000Z',
        guestsCount: 4,
        notes: 'Mesa tranquila',
      }),
    });
    expect((await bookingsPost(bookReq)).status).toBe(201);

    // Feedback POST (high rating -> Google Maps redirect URL)
    vi.spyOn(merchantRepo, 'getById').mockResolvedValue(merchant);
    vi.spyOn(feedbackRepo, 'create').mockResolvedValue({
      id: 'fb-1',
      merchant_id: MERCHANT_ID,
      transaction_id: null,
      customer_id: CUSTOMER_ID,
      rating: 5,
      comments: 'Excelente',
      is_public_redirect: true,
      manager_contacted: false,
      created_at: new Date().toISOString(),
    });
    const fbReq = new NextRequest('http://localhost/api/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantId: MERCHANT_ID,
        customerPhone: '+573001234567',
        rating: 5,
        comments: 'Excelente',
      }),
    });
    const fbRes = await feedbackPost(fbReq);
    expect(fbRes.status).toBe(201);
    const fbJson = (await fbRes.json()) as { isPublicRedirect: boolean; redirectUrl: string };
    expect(fbJson.isPublicRedirect).toBe(true);
    expect(fbJson.redirectUrl).toContain('ChIJ_TEST_PLACE');

    // Merchant Settings GET (public) & POST (admin)
    vi.spyOn(merchantRepo, 'listLocations').mockResolvedValue([location]);
    const getRes = await settingsGet(new NextRequest('http://localhost/api/v1/merchant/settings?slug=cafe-canelo'));
    expect(getRes.status).toBe(200);

    vi.spyOn(merchantRepo, 'updateSettings').mockResolvedValue({ ...merchant, stamps_needed: 12 });
    vi.spyOn(googleWallet, 'updateGoogleLoyaltyClassDesign').mockResolvedValue({
      success: true,
      hexBackgroundColor: '#8b5cf6',
    });
    vi.spyOn(passRepo, 'listActiveByMerchant').mockResolvedValue([]);

    const adminCookie = await makeAdminCookie();
    const postSetReq = new NextRequest('http://localhost/api/v1/merchant/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ stamps_needed: 12 }),
    });
    const postSetRes = await settingsPost(postSetReq);
    expect(postSetRes.status).toBe(200);
    const postSetJson = (await postSetRes.json()) as { googleWalletSync: boolean };
    expect(postSetJson.googleWalletSync).toBe(true);
  });
});
