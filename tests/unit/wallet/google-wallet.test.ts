import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Location, Merchant, WalletPass } from '@/types/domain';

const mockRequestFn = vi.hoisted(() => vi.fn());

vi.mock('google-auth-library', () => {
  return {
    GoogleAuth: class MockGoogleAuth {
      async getClient() {
        return { request: mockRequestFn };
      }
    },
  };
});

import {
  ensureGoogleLoyaltyClass,
  sendGoogleWalletNotification,
  syncGooglePassStamps,
} from '@/lib/wallet/google-wallet-service';

function makeTestMerchant(overrides?: Partial<Merchant>): Merchant {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    user_id: 'owner-1',
    name: 'Café Canelo',
    slug: 'cafe-canelo',
    logo_url: 'https://fidelizia.app/logo.png',
    brand_color: '#8b5cf6',
    secondary_color: '#d4a373',
    google_place_id: null,
    stamps_needed: 10,
    reward_description: 'Café + Croissant',
    cooldown_hours: 3,
    scanner_geofence_meters: 250,
    opening_hours: {},
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeTestPass(overrides?: Partial<WalletPass>): WalletPass {
  return {
    id: '00000000-0000-0000-0000-000000000006',
    merchant_id: '00000000-0000-0000-0000-000000000001',
    customer_id: '00000000-0000-0000-0000-000000000005',
    pass_serial_number: 'PASS-CANELO-001',
    pass_type: 'google',
    authentication_token: 'auth-token-secure-12345',
    push_token: null,
    current_stamps: 4,
    total_visits: 4,
    total_rewards_redeemed: 0,
    last_visit_at: new Date().toISOString(),
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeTestLocation(): Location {
  return {
    id: '00000000-0000-0000-0000-000000000002',
    merchant_id: '00000000-0000-0000-0000-000000000001',
    name: 'Zona G',
    address: 'Calle 85 # 11-53',
    latitude: 4.6682,
    longitude: -74.0538,
    radius_meters: 250,
    relevant_text: 'Bienvenido',
    is_active: true,
    created_at: new Date().toISOString(),
  };
}

describe('Google Wallet Service', () => {
  const originalEnv = {
    issuerId: process.env.GOOGLE_ISSUER_ID,
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    pk: process.env.GOOGLE_PRIVATE_KEY,
  };

  beforeEach(() => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    process.env.GOOGLE_ISSUER_ID = '3388000000023227346';
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'wallet@fidelizia-test.iam.gserviceaccount.com';
    process.env.GOOGLE_PRIVATE_KEY = privateKey.replace(/\r?\n/g, '\\n');
    mockRequestFn.mockReset();
  });

  afterEach(() => {
    if (originalEnv.issuerId === undefined) delete process.env.GOOGLE_ISSUER_ID;
    else process.env.GOOGLE_ISSUER_ID = originalEnv.issuerId;
    if (originalEnv.email === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    else process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = originalEnv.email;
    if (originalEnv.pk === undefined) delete process.env.GOOGLE_PRIVATE_KEY;
    else process.env.GOOGLE_PRIVATE_KEY = originalEnv.pk;
  });

  it('ensureGoogleLoyaltyClass creates via POST when missing (404) and patches without reviewStatus when existing', async () => {
    const merchant = makeTestMerchant();
    const locations = [makeTestLocation()];

    // Case 1: GET returns 404 -> POST /loyaltyClass with UNDER_REVIEW
    mockRequestFn
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockResolvedValueOnce({ status: 200, data: {} });

    const created = await ensureGoogleLoyaltyClass(merchant, locations);
    expect(created.success).toBe(true);
    expect(mockRequestFn).toHaveBeenCalledTimes(2);
    const postCall = mockRequestFn.mock.calls[1][0] as { method: string; data: Record<string, unknown> };
    expect(postCall.method).toBe('POST');
    expect(postCall.data.reviewStatus).toBe('UNDER_REVIEW');

    // Case 2: GET returns 200 -> PATCH /loyaltyClass without reviewStatus in payload or updateMask
    mockRequestFn.mockReset();
    mockRequestFn
      .mockResolvedValueOnce({ status: 200, data: { id: '3388000000023227346.canelo_loyalty_v1' } })
      .mockResolvedValueOnce({ status: 200, data: {} });

    const patched = await ensureGoogleLoyaltyClass(merchant, locations);
    expect(patched.success).toBe(true);
    const patchCall = mockRequestFn.mock.calls[1][0] as {
      url: string;
      method: string;
      data: Record<string, unknown>;
    };
    expect(patchCall.method).toBe('PATCH');
    expect(patchCall.url).not.toContain('reviewStatus');
    expect(patchCall.data.reviewStatus).toBeUndefined();
  });

  it('syncGooglePassStamps uses PATCH with NOTIFY_ON_UPDATE and preserves existing messages', async () => {
    mockRequestFn.mockResolvedValueOnce({ status: 200, data: {} });

    const pass = makeTestPass({ current_stamps: 7 });
    const merchant = makeTestMerchant();
    const result = await syncGooglePassStamps(pass, merchant, { notify: true });

    expect(result.success).toBe(true);
    expect(mockRequestFn).toHaveBeenCalledTimes(1);
    const reqArgs = mockRequestFn.mock.calls[0][0] as {
      url: string;
      method: string;
      data: Record<string, unknown>;
    };
    expect(reqArgs.method).toBe('PATCH');
    expect(reqArgs.url).toContain('loyaltyObject/3388000000023227346.PASS-CANELO-001');
    expect(reqArgs.url).not.toContain('messages');
    expect(reqArgs.data.notifyPreference).toBe('NOTIFY_ON_UPDATE');
    expect(reqArgs.data.messages).toBeUndefined();
  });

  it('sendGoogleWalletNotification calls POST /addMessage with TEXT_AND_NOTIFY and degrades to TEXT when quota exhausted', async () => {
    const merchant = makeTestMerchant();

    // 1. Under quota -> TEXT_AND_NOTIFY
    mockRequestFn.mockResolvedValueOnce({ status: 200, data: {} });
    const underQuotaPass = makeTestPass({
      push_count_24h: 1,
      push_window_reset_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    const res1 = await sendGoogleWalletNotification(
      underQuotaPass,
      merchant,
      '2x1 Hoy',
      'Presenta tu pase en barra'
    );
    expect(res1.success).toBe(true);
    expect(res1.quotaFallback).toBe(false);
    expect(res1.incrementedQuota).toBe(true);
    const call1 = mockRequestFn.mock.calls[0][0] as {
      url: string;
      method: string;
      data: { message: { messageType: string } };
    };
    expect(call1.method).toBe('POST');
    expect(call1.url).toContain('/loyaltyObject/3388000000023227346.PASS-CANELO-001/addMessage');
    expect(call1.data.message.messageType).toBe('TEXT_AND_NOTIFY');

    // 2. Local 24h quota reached (>= 3) -> silent TEXT without burning push quota
    mockRequestFn.mockReset();
    mockRequestFn.mockResolvedValueOnce({ status: 200, data: {} });
    const maxedPass = makeTestPass({
      push_count_24h: 3,
      push_window_reset_at: new Date(Date.now() + 3600_000).toISOString(),
    });
    const res2 = await sendGoogleWalletNotification(
      maxedPass,
      merchant,
      'Promo Silenciosa',
      'Guardado en tarjeta'
    );
    expect(res2.success).toBe(true);
    expect(res2.quotaFallback).toBe(true);
    expect(res2.incrementedQuota).toBe(false);
    const call2 = mockRequestFn.mock.calls[0][0] as {
      data: { message: { messageType: string } };
    };
    expect(call2.data.message.messageType).toBe('TEXT');

    // 3. Google API returns HTTP 429 -> fallback retry with TEXT
    mockRequestFn.mockReset();
    mockRequestFn
      .mockRejectedValueOnce({
        response: { status: 429, data: { error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota limit' } } },
      })
      .mockResolvedValueOnce({ status: 200, data: {} });

    const res3 = await sendGoogleWalletNotification(
      underQuotaPass,
      merchant,
      'Último intento',
      'Texto de respaldo'
    );
    expect(res3.success).toBe(true);
    expect(res3.quotaFallback).toBe(true);
    expect(res3.incrementedQuota).toBe(false);
    expect(mockRequestFn).toHaveBeenCalledTimes(2);
    const call3Retry = mockRequestFn.mock.calls[1][0] as {
      data: { message: { messageType: string } };
    };
    expect(call3Retry.data.message.messageType).toBe('TEXT');
  });
});
