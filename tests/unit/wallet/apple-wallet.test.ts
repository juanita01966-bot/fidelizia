import http2 from 'node:http2';
import type { AddressInfo } from 'node:net';
import { NextRequest } from 'next/server';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateApplePassBuffer,
  sendApplePushNotification,
  triggerApplePassUpdate,
  verifyAppleAuthHeader,
} from '@/lib/wallet/apple-wallet-service';
import { appleDeviceRepo, passRepo } from '@/lib/repositories';
import { resetSupabaseAdmin, setSupabaseAdminForTests, type SupabaseAdminClient } from '@/lib/supabase/server';
import { resetRateLimiterForTests } from '@/lib/api/rate-limit';
import {
  DELETE as unregisterDeviceDelete,
  POST as registerDevicePost,
} from '@/app/api/v1/apple/v1/devices/[deviceLibraryId]/registrations/[passTypeId]/[serial]/route';
import { GET as listSerialsGet } from '@/app/api/v1/apple/v1/devices/[deviceLibraryId]/registrations/[passTypeId]/route';
import { GET as downloadPassGet } from '@/app/api/v1/apple/v1/passes/[passTypeId]/[serial]/route';
import { POST as appleLogPost } from '@/app/api/v1/apple/v1/log/route';
import type { Customer, Location, Merchant, WalletPass } from '@/types/domain';
import { generateAppleWalletCertFixtures } from '../../e2e/lib/fixtures.mjs';
import { parseZipBuffer } from '../../e2e/lib/pkpass-inspector.mjs';

const PASS_TYPE_ID = 'pass.com.fidelizia.unit';
const TEAM_ID = 'FIDELIZIA9';

function createFixtureEntities(): {
  merchant: Merchant;
  customer: Customer;
  pass: WalletPass;
  locations: Location[];
} {
  const nowIso = '2026-11-20T18:00:00.000Z';
  const merchant: Merchant = {
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
    created_at: nowIso,
    updated_at: nowIso,
  };
  const customer: Customer = {
    id: '00000000-0000-0000-0000-000000000005',
    merchant_id: merchant.id,
    phone: '+573001234567',
    full_name: 'Valentina Gómez',
    birthdate: '1994-05-12',
    loyalty_tier: 'gold',
    rfm_segment: 'champion',
    terms_accepted_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
  };
  const pass: WalletPass = {
    id: '00000000-0000-0000-0000-000000000006',
    merchant_id: merchant.id,
    customer_id: customer.id,
    pass_serial_number: 'PASS-APPLE-UNIT-001',
    pass_type: 'apple',
    authentication_token: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
    push_token: 'deadbeef1234567890abcdef',
    current_stamps: 5,
    total_visits: 5,
    total_rewards_redeemed: 1,
    last_visit_at: nowIso,
    last_push_title: '2x1 Espresso',
    last_push_message: 'Presenta tu pase hoy antes de las 6pm',
    status: 'active',
    created_at: nowIso,
    updated_at: nowIso,
  };
  const locations: Location[] = [
    {
      id: '00000000-0000-0000-0000-000000000002',
      merchant_id: merchant.id,
      name: 'Sede Principal',
      address: 'Calle 85 # 11-53',
      latitude: 4.6682,
      longitude: -74.0538,
      radius_meters: 250,
      relevant_text: 'Estás cerca de Café Canelo',
      is_active: true,
      created_at: nowIso,
    },
  ];
  return { merchant, customer, pass, locations };
}

describe('Apple Wallet Service, .pkpass Generation, PassKit Web Service & APNs', () => {
  const originalEnv = {
    passTypeId: process.env.APPLE_PASS_TYPE_ID,
    teamId: process.env.APPLE_TEAM_ID,
    wwdr: process.env.APPLE_WWDR_CERT_BASE64,
    cert: process.env.APPLE_SIGNER_CERT_BASE64,
    key: process.env.APPLE_SIGNER_KEY_BASE64,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  };

  beforeEach(() => {
    const certs = generateAppleWalletCertFixtures({ passTypeId: PASS_TYPE_ID, teamId: TEAM_ID }) as {
      wwdrCertBase64: string;
      signerCertBase64: string;
      signerKeyBase64: string;
    };
    process.env.APPLE_PASS_TYPE_ID = PASS_TYPE_ID;
    process.env.APPLE_TEAM_ID = TEAM_ID;
    process.env.APPLE_WWDR_CERT_BASE64 = certs.wwdrCertBase64;
    process.env.APPLE_SIGNER_CERT_BASE64 = certs.signerCertBase64;
    process.env.APPLE_SIGNER_KEY_BASE64 = certs.signerKeyBase64;
    process.env.NEXT_PUBLIC_APP_URL = 'https://fidelizia.example.com';

    resetSupabaseAdmin();
    resetRateLimiterForTests();
    setSupabaseAdminForTests({ from: () => ({}) } as unknown as SupabaseAdminClient);
  });

  afterEach(() => {
    resetSupabaseAdmin();
    resetRateLimiterForTests();
    if (originalEnv.passTypeId === undefined) delete process.env.APPLE_PASS_TYPE_ID;
    else process.env.APPLE_PASS_TYPE_ID = originalEnv.passTypeId;
    if (originalEnv.teamId === undefined) delete process.env.APPLE_TEAM_ID;
    else process.env.APPLE_TEAM_ID = originalEnv.teamId;
    if (originalEnv.wwdr === undefined) delete process.env.APPLE_WWDR_CERT_BASE64;
    else process.env.APPLE_WWDR_CERT_BASE64 = originalEnv.wwdr;
    if (originalEnv.cert === undefined) delete process.env.APPLE_SIGNER_CERT_BASE64;
    else process.env.APPLE_SIGNER_CERT_BASE64 = originalEnv.cert;
    if (originalEnv.key === undefined) delete process.env.APPLE_SIGNER_KEY_BASE64;
    else process.env.APPLE_SIGNER_KEY_BASE64 = originalEnv.key;
    if (originalEnv.appUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalEnv.appUrl;
  });

  it('verifyAppleAuthHeader validates exact ApplePass token in constant time and rejects invalid headers', () => {
    const token = 'secret-token-xyz-123';
    expect(verifyAppleAuthHeader(`ApplePass ${token}`, token)).toBe(true);
    expect(verifyAppleAuthHeader(`Bearer ${token}`, token)).toBe(false);
    expect(verifyAppleAuthHeader('ApplePass wrong-token', token)).toBe(false);
    expect(verifyAppleAuthHeader(null, token)).toBe(false);
  });

  it('generateApplePassBuffer produces signed .pkpass with changeMessage on primary stamps and back latest_update', async () => {
    const { merchant, customer, pass, locations } = createFixtureEntities();
    const pkpassBuf = await generateApplePassBuffer(customer, pass, merchant, locations);
    expect(Buffer.isBuffer(pkpassBuf)).toBe(true);
    expect(pkpassBuf.length).toBeGreaterThan(500);

    const { entries } = parseZipBuffer(pkpassBuf) as { entries: Map<string, Buffer> };
    expect(entries.has('pass.json')).toBe(true);
    expect(entries.has('manifest.json')).toBe(true);
    expect(entries.has('signature')).toBe(true);
    expect(entries.has('icon.png')).toBe(true);
    expect(entries.get('icon.png')!.length).toBeGreaterThan(100);

    const passJson = JSON.parse(entries.get('pass.json')!.toString('utf8')) as {
      serialNumber: string;
      passTypeIdentifier: string;
      teamIdentifier: string;
      authenticationToken: string;
      webServiceURL?: string;
      storeCard: {
        primaryFields: Array<{ key: string; changeMessage?: string }>;
        backFields: Array<{ key: string; changeMessage?: string; value: string }>;
      };
    };

    expect(passJson.serialNumber).toBe(pass.pass_serial_number);
    expect(passJson.passTypeIdentifier).toBe(PASS_TYPE_ID);
    expect(passJson.teamIdentifier).toBe(TEAM_ID);
    expect(passJson.authenticationToken).toBe(pass.authentication_token);
    expect(passJson.webServiceURL).toBe('https://fidelizia.example.com/api/v1/apple');

    const stampsField = passJson.storeCard.primaryFields.find((f) => f.key === 'stamps');
    const promoField = passJson.storeCard.backFields.find((f) => f.key === 'latest_update');
    expect(stampsField?.changeMessage).toContain('%@');
    expect(promoField?.changeMessage).toBe('%@');
    expect(promoField?.value).toContain('Presenta tu pase hoy');
  });

  it('PassKit Web Service handles device registration, updated serial listing, If-Modified-Since 304, unregister, and logs', async () => {
    const { merchant, customer, pass, locations } = createFixtureEntities();
    const passSpy = vi.spyOn(passRepo, 'getBySerial').mockResolvedValue(pass);
    const registerSpy = vi.spyOn(appleDeviceRepo, 'registerDevice').mockResolvedValue('created');
    const unregisterSpy = vi.spyOn(appleDeviceRepo, 'unregisterDevice').mockResolvedValue(true);
    const serialsSpy = vi.spyOn(appleDeviceRepo, 'getSerialsForDevice').mockResolvedValue({
      serialNumbers: [pass.pass_serial_number],
      lastUpdated: '2026-11-20T18:05:00.000Z',
    });
    const bundleSpy = vi.spyOn(passRepo, 'getWithCustomerAndMerchantBySerial').mockResolvedValue({
      pass,
      customer,
      merchant,
      locations,
    });

    // 1. Register device (201)
    const regReq = new NextRequest(
      `http://localhost/api/v1/apple/v1/devices/dev-1/registrations/${PASS_TYPE_ID}/${pass.pass_serial_number}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `ApplePass ${pass.authentication_token}`,
        },
        body: JSON.stringify({ pushToken: 'apns-device-token-123456' }),
      }
    );
    const regRes = await registerDevicePost(regReq, {
      params: Promise.resolve({
        deviceLibraryId: 'dev-1',
        passTypeId: PASS_TYPE_ID,
        serial: pass.pass_serial_number,
      }),
    });
    expect(regRes.status).toBe(201);
    expect(registerSpy).toHaveBeenCalledTimes(1);

    // 2. Unauthorized token returns 401
    const unauthReq = new NextRequest(
      `http://localhost/api/v1/apple/v1/devices/dev-1/registrations/${PASS_TYPE_ID}/${pass.pass_serial_number}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'ApplePass invalid-token',
        },
        body: JSON.stringify({ pushToken: 'apns-device-token-123456' }),
      }
    );
    const unauthRes = await registerDevicePost(unauthReq, {
      params: Promise.resolve({
        deviceLibraryId: 'dev-1',
        passTypeId: PASS_TYPE_ID,
        serial: pass.pass_serial_number,
      }),
    });
    expect(unauthRes.status).toBe(401);

    // 3. List updated serials with passesUpdatedSince
    const listReq = new NextRequest(
      `http://localhost/api/v1/apple/v1/devices/dev-1/registrations/${PASS_TYPE_ID}?passesUpdatedSince=2026-11-20T17:00:00Z`
    );
    const listRes = await listSerialsGet(listReq, {
      params: Promise.resolve({ deviceLibraryId: 'dev-1', passTypeId: PASS_TYPE_ID }),
    });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { serialNumbers: string[]; lastUpdated: string };
    expect(listBody.serialNumbers).toEqual([pass.pass_serial_number]);
    expect(serialsSpy).toHaveBeenCalled();

    // 4. Download pass returns 304 when If-Modified-Since >= pass.updated_at, and 200 otherwise
    const imsReq = new NextRequest(
      `http://localhost/api/v1/apple/v1/passes/${PASS_TYPE_ID}/${pass.pass_serial_number}`,
      {
        headers: {
          Authorization: `ApplePass ${pass.authentication_token}`,
          'If-Modified-Since': 'Fri, 20 Nov 2026 18:00:00 GMT',
        },
      }
    );
    const imsRes = await downloadPassGet(imsReq, {
      params: Promise.resolve({ passTypeId: PASS_TYPE_ID, serial: pass.pass_serial_number }),
    });
    expect(imsRes.status).toBe(304);

    const dlReq = new NextRequest(
      `http://localhost/api/v1/apple/v1/passes/${PASS_TYPE_ID}/${pass.pass_serial_number}`,
      {
        headers: { Authorization: `ApplePass ${pass.authentication_token}` },
      }
    );
    const dlRes = await downloadPassGet(dlReq, {
      params: Promise.resolve({ passTypeId: PASS_TYPE_ID, serial: pass.pass_serial_number }),
    });
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers.get('content-type')).toBe('application/vnd.apple.pkpass');
    expect(bundleSpy).toHaveBeenCalled();

    // 5. Unregister device (200)
    const delReq = new NextRequest(
      `http://localhost/api/v1/apple/v1/devices/dev-1/registrations/${PASS_TYPE_ID}/${pass.pass_serial_number}`,
      {
        method: 'DELETE',
        headers: { Authorization: `ApplePass ${pass.authentication_token}` },
      }
    );
    const delRes = await unregisterDeviceDelete(delReq, {
      params: Promise.resolve({
        deviceLibraryId: 'dev-1',
        passTypeId: PASS_TYPE_ID,
        serial: pass.pass_serial_number,
      }),
    });
    expect(delRes.status).toBe(200);
    expect(passSpy).toHaveBeenCalled();
    expect(unregisterSpy).toHaveBeenCalled();

    // 6. POST /v1/log
    const logReq = new NextRequest('http://localhost/api/v1/apple/v1/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logs: ['[PassKit] test warning'] }),
    });
    const logRes = await appleLogPost(logReq);
    expect(logRes.status).toBe(200);
  });

  it('sendApplePushNotification handles APNs 200 success and triggerApplePassUpdate deletes 410 Unregistered tokens', async () => {
    const { merchant, pass } = createFixtureEntities();
    let mode: 'ok' | 'unregistered' = 'ok';
    const receivedPaths: string[] = [];

    const h2Server = http2.createServer((req, res) => {
      receivedPaths.push(req.headers[':path'] as string);
      req.resume();
      req.on('end', () => {
        if (mode === 'ok') {
          res.writeHead(200, { 'apns-id': 'apns-test-id-001' });
          res.end();
        } else {
          res.writeHead(410, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ reason: 'Unregistered' }));
        }
      });
    });

    await new Promise<void>((resolve) => h2Server.listen(0, '127.0.0.1', () => resolve()));
    const address = h2Server.address() as AddressInfo;
    const apnsHost = `http://127.0.0.1:${address.port}`;

    try {
      const okRes = await sendApplePushNotification('token-active-123456', { apnsHost });
      expect(okRes.success).toBe(true);
      expect(okRes.status).toBe(200);
      expect(okRes.apnsId).toBe('apns-test-id-001');
      expect(receivedPaths[0]).toBe('/3/device/token-active-123456');

      // 410 cleanup via triggerApplePassUpdate
      mode = 'unregistered';
      const origHost = process.env.APPLE_APNS_HOST;
      process.env.APPLE_APNS_HOST = apnsHost;
      try {
        const recordPushSpy = vi.spyOn(passRepo, 'recordPushNotification').mockResolvedValue(undefined);
        const tokensSpy = vi
          .spyOn(appleDeviceRepo, 'getPushTokensBySerial')
          .mockResolvedValue(['stale-apns-token-999']);
        const deleteTokensSpy = vi.spyOn(appleDeviceRepo, 'deleteByPushTokens').mockResolvedValue(undefined);

        const eq2 = vi.fn().mockResolvedValue({ error: null });
        const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
        const update = vi.fn().mockReturnValue({ eq: eq1 });
        const mockSupabase = { from: () => ({ update }) } as unknown as SupabaseAdminClient;

        const cleanPass: WalletPass = { ...pass, push_token: 'stale-apns-token-999' };
        const result = await triggerApplePassUpdate(mockSupabase, merchant.id, cleanPass, {
          title: '2x1 Espresso',
          message: 'Solo por hoy',
        });

        expect(result.success).toBe(false);
        expect(result.cleanedTokens).toBe(1);
        expect(recordPushSpy).toHaveBeenCalledTimes(1);
        expect(tokensSpy).toHaveBeenCalledTimes(1);
        expect(deleteTokensSpy).toHaveBeenCalledWith(mockSupabase, ['stale-apns-token-999']);
        expect(update).toHaveBeenCalled();
      } finally {
        if (origHost === undefined) delete process.env.APPLE_APNS_HOST;
        else process.env.APPLE_APNS_HOST = origHost;
      }
    } finally {
      await new Promise<void>((resolve) => h2Server.close(() => resolve()));
    }
  });
});
