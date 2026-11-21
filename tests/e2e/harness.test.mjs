import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { PKPass } from 'passkit-generator';

import {
  E2E_ENV_DEFAULTS,
  FIXTURE_IDS,
  FIXTURE_PASSWORDS,
  FIXTURE_PINS,
  createSeedState,
  createTestCryptoFixtures,
  generateAppleWalletCertFixtures,
  generateGoogleServiceAccountFixtures,
  generateTestPngAsset,
  verifySecret,
} from './lib/fixtures.mjs';
import { startSupabaseMock } from './lib/supabase-mock.mjs';
import { startWalletMocks } from './lib/wallet-mocks.mjs';
import { inspectPkpass, inspectPngBuffer, parseZipBuffer } from './lib/pkpass-inspector.mjs';
import {
  decodePngToLuminance,
  decodeQr,
  decodeQrFromPng,
  decodeQrFromSvg,
  encodeQrToPng,
  encodeQrToSvg,
  tryDecodeQr,
} from './lib/qr-decoder.mjs';
import {
  VIEWPORT_DESKTOP,
  VIEWPORT_MOBILE,
  launchBrowser,
  resolveChromiumExecutable,
} from './lib/browser-driver.mjs';

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '..', '..');

function runNodeAsync(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c.toString('utf8'); });
    child.stderr.on('data', (c) => { stderr += c.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function buildSyntheticDeflateZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const compressed = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data) >>> 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8); // DEFLATE
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);

    localParts.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);

    centralParts.push(central, nameBuf);
    offset += local.length + nameBuf.length + compressed.length;
  }

  const cdBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, cdBuf, eocd]);
}

function buildFilteredPng(width, height, pixelsRgba, filterType) {
  const magic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const makeChunk = (type, data) => {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(zlib.crc32(Buffer.concat([t, data])) >>> 0, 0);
    return Buffer.concat([len, t, data, crcBuf]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const stride = width * 4;
  const filtered = Buffer.alloc(height * (1 + stride));
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  };

  for (let y = 0; y < height; y += 1) {
    const dst = y * (1 + stride);
    filtered[dst] = filterType;
    for (let x = 0; x < stride; x += 1) {
      const cur = pixelsRgba[y * stride + x];
      const left = x >= 4 ? pixelsRgba[y * stride + x - 4] : 0;
      const up = y > 0 ? pixelsRgba[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= 4 ? pixelsRgba[(y - 1) * stride + x - 4] : 0;

      let out = cur;
      if (filterType === 1) out = (cur - left) & 0xff;
      else if (filterType === 2) out = (cur - up) & 0xff;
      else if (filterType === 3) out = (cur - ((left + up) >> 1)) & 0xff;
      else if (filterType === 4) out = (cur - paeth(left, up, upLeft)) & 0xff;
      filtered[dst + 1 + x] = out;
    }
  }

  return Buffer.concat([
    magic,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(filtered)),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('E2E Harness Self-Verification Suite', () => {
  describe('1. fixtures.mjs', () => {
    it('creates deterministic multi-tenant seed state with bcryptjs-hashed credentials', () => {
      const state = createSeedState({ now: '2026-11-20T18:00:00.000Z' });
      assert.equal(state.merchants.length, 2);
      assert.equal(state.merchants[0].slug, 'cafe-canelo');
      assert.equal(state.merchants[1].slug, 'tostadores-sur');

      const cashier = state.employees.find((e) => e.id === FIXTURE_IDS.EMP_CANELO_CASHIER_ID);
      assert.ok(cashier);
      assert.equal(verifySecret(FIXTURE_PINS.CANELO_CASHIER_PIN, cashier.pin_hash), true);
      assert.equal(verifySecret('0000', cashier.pin_hash), false);

      const admin = state.employees.find((e) => e.id === FIXTURE_IDS.EMP_CANELO_ADMIN_ID);
      assert.ok(admin);
      assert.equal(verifySecret(FIXTURE_PASSWORDS.CANELO_ADMIN_PWD, admin.password_hash), true);

      const applePass = state.wallet_passes.find((p) => p.pass_serial_number === 'PASS-CANELO-002');
      assert.equal(applePass.current_stamps, 9);
      assert.equal(
        applePass.authentication_token,
        `${E2E_ENV_DEFAULTS.APPLE_WEB_SERVICE_SECRET}_PASS-CANELO-002`
      );

      // -05:00 UTC boundary reservation seed
      const boundaryRes = state.reservations.find((r) => r.id === FIXTURE_IDS.RES_CANELO_001_ID);
      assert.ok(boundaryRes);
      assert.ok(boundaryRes.date_time.endsWith('T04:30:00.000Z'));
    });

    it('generates valid RS256 Google keypair and Apple X.509 certificates accepted by PKPass', async () => {
      const google = generateGoogleServiceAccountFixtures();
      assert.ok(google.privateKeyPem.includes('-----BEGIN PRIVATE KEY-----'));
      const token = jwt.sign({ iss: google.serviceAccountEmail }, google.privateKeyPem, {
        algorithm: 'RS256',
      });
      const verified = jwt.verify(token, google.publicKeyPem, { algorithms: ['RS256'] });
      assert.equal(verified.iss, google.serviceAccountEmail);

      const apple = generateAppleWalletCertFixtures({ passphrase: 'test-passphrase-123' });
      const icon29 = generateTestPngAsset(29, 29);
      const icon58 = generateTestPngAsset(58, 58);
      assert.ok(icon29.length > 100);
      assert.ok(icon58.length > 100);

      const pass = new PKPass(
        { 'icon.png': icon29, 'icon@2x.png': icon58 },
        {
          wwdr: Buffer.from(apple.wwdrCertBase64, 'base64'),
          signerCert: Buffer.from(apple.signerCertBase64, 'base64'),
          signerKey: Buffer.from(apple.signerKeyBase64, 'base64'),
          signerKeyPassphrase: apple.passphrase,
        },
        {
          formatVersion: 1,
          passTypeIdentifier: apple.passTypeId,
          teamIdentifier: apple.teamId,
          organizationName: 'Café Canelo Test',
          description: 'Harness Test Pass',
          serialNumber: 'PASS-TEST-001',
        }
      );
      pass.type = 'storeCard';
      const pkpassBuf = pass.getAsBuffer();
      assert.ok(pkpassBuf.length > 500);
    });
  });

  describe('2. supabase-mock.mjs', () => {
    it('supports PostgREST queries, embedded FK joins, single/maybeSingle, upsert, RLS, and restart persistence', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fidelizia-supamock-'));
      const stateFile = path.join(tmpDir, 'state.json');
      let mock = await startSupabaseMock({ stateFile });

      try {
        const admin = createClient(mock.url, mock.serviceRoleKey);
        const anon = createClient(mock.url, mock.anonKey);

        // Embedded parent->child join + order + range + exact count
        const { data: custList, count, error: custErr } = await admin
          .from('customers')
          .select('id, full_name, rfm_segment, wallet_passes(pass_serial_number, current_stamps)', {
            count: 'exact',
          })
          .eq('merchant_id', FIXTURE_IDS.MERCHANT_CANELO_ID)
          .in('rfm_segment', ['champion', 'loyal'])
          .order('full_name', { ascending: true })
          .range(0, 9);

        assert.equal(custErr, null);
        assert.equal(count, 2);
        assert.equal(custList.length, 2);
        assert.equal(custList[0].full_name, 'Carlos Mendoza');
        assert.equal(custList[0].wallet_passes[0].pass_serial_number, 'PASS-CANELO-001');

        // Child->parent join + !inner + head count
        const { count: headCount, error: headErr } = await admin
          .from('wallet_passes')
          .select('id, customers!inner(rfm_segment)', { count: 'exact', head: true })
          .eq('customers.rfm_segment', 'champion');
        assert.equal(headErr, null);
        assert.equal(headCount, 1);

        // .single() vs .maybeSingle()
        const singleZero = await admin
          .from('wallet_passes')
          .select('*')
          .eq('pass_serial_number', 'NO-SUCH-PASS')
          .single();
        assert.equal(singleZero.error?.code, 'PGRST116');

        const maybeZero = await admin
          .from('wallet_passes')
          .select('*')
          .eq('pass_serial_number', 'NO-SUCH-PASS')
          .maybeSingle();
        assert.equal(maybeZero.error, null);
        assert.equal(maybeZero.data, null);

        // Unique violation (23505) vs upsert merge
        const dupInsert = await admin.from('apple_device_registrations').insert({
          device_library_identifier: 'dev-iphone-valentina-001',
          push_token: 'new-token',
          pass_type_identifier: E2E_ENV_DEFAULTS.APPLE_PASS_TYPE_ID,
          serial_number: 'PASS-CANELO-002',
        });
        assert.equal(dupInsert.error?.code, '23505');

        const upsertRes = await admin
          .from('apple_device_registrations')
          .upsert(
            {
              device_library_identifier: 'dev-iphone-valentina-001',
              push_token: 'apns-token-valentina-updated',
              pass_type_identifier: E2E_ENV_DEFAULTS.APPLE_PASS_TYPE_ID,
              serial_number: 'PASS-CANELO-002',
            },
            { onConflict: 'device_library_identifier,serial_number' }
          )
          .select()
          .single();
        assert.equal(upsertRes.error, null);
        assert.equal(upsertRes.data.push_token, 'apns-token-valentina-updated');

        // Strict RLS for anon
        const anonMerchants = await anon.from('merchants').select('slug').eq('is_active', true);
        assert.equal(anonMerchants.error, null);
        assert.equal(anonMerchants.data.length, 2);

        const anonEmployees = await anon.from('employees').select('*');
        assert.equal(anonEmployees.error?.code, '42501');

        const anonRpc = await anon.rpc('process_pos_scan', {
          p_merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
        });
        assert.equal(anonRpc.error?.code, '42501');

        // Restart persistence verification
        await mock.close();
        mock = await startSupabaseMock({ stateFile });
        const adminAfterRestart = createClient(mock.url, mock.serviceRoleKey);
        const persisted = await adminAfterRestart
          .from('apple_device_registrations')
          .select('push_token')
          .eq('device_library_identifier', 'dev-iphone-valentina-001')
          .single();
        assert.equal(persisted.error, null);
        assert.equal(persisted.data.push_token, 'apns-token-valentina-updated');
      } finally {
        await mock.close();
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('executes process_pos_scan and redeem_reward RPCs including antifraud rejections', async () => {
      const mock = await startSupabaseMock();
      try {
        const admin = createClient(mock.url, mock.serviceRoleKey);

        // Happy path scan on Valentina's 9/10 Apple pass -> unlocks 10/10 reward
        const scanOk = await admin.rpc('process_pos_scan', {
          p_merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
          p_employee_id: FIXTURE_IDS.EMP_CANELO_CASHIER_ID,
          p_pass_serial_number: 'PASS-CANELO-002',
          p_ticket_number: 'FAC-NEW-9001',
          p_amount: 22000,
          p_scanner_lat: 4.6682,
          p_scanner_lng: -74.0538,
        });
        assert.equal(scanOk.error, null);
        assert.equal(scanOk.data.stamps_current, 10);
        assert.equal(scanOk.data.reward_ready, true);

        // Duplicate ticket -> P0001 + ticket_reused fraud alert
        const dupTicket = await admin.rpc('process_pos_scan', {
          p_merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
          p_employee_id: FIXTURE_IDS.EMP_CANELO_CASHIER_ID,
          p_pass_serial_number: 'PASS-CANELO-001',
          p_ticket_number: 'FAC-NEW-9001',
          p_amount: 10000,
        });
        assert.equal(dupTicket.error?.code, 'P0001');
        assert.match(dupTicket.error.message, /TICKET_ALREADY_USED/);

        // Cooldown violation on Sofía Vargas -> P0001 + cooldown_violation alert
        const cooldownRes = await admin.rpc('process_pos_scan', {
          p_merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
          p_employee_id: FIXTURE_IDS.EMP_CANELO_CASHIER_ID,
          p_pass_serial_number: 'PASS-CANELO-004',
          p_ticket_number: 'FAC-NEW-9002',
          p_amount: 10000,
        });
        assert.equal(cooldownRes.error?.code, 'P0001');
        assert.match(cooldownRes.error.message, /COOLDOWN_ACTIVE/);

        // Geofence breach on Carlos Mendoza -> P0001 + geofence_breach alert
        const geoRes = await admin.rpc('process_pos_scan', {
          p_merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
          p_employee_id: FIXTURE_IDS.EMP_CANELO_CASHIER_ID,
          p_pass_serial_number: 'PASS-CANELO-001',
          p_ticket_number: 'FAC-NEW-9003',
          p_amount: 10000,
          p_scanner_lat: 6.2088,
          p_scanner_lng: -75.567,
        });
        assert.equal(geoRes.error?.code, 'P0001');
        assert.match(geoRes.error.message, /GEOFENCE_BREACH/);

        const alerts = mock.getTable('fraud_alerts');
        assert.ok(alerts.some((a) => a.alert_type === 'ticket_reused'));
        assert.ok(alerts.some((a) => a.alert_type === 'geofence_breach'));

        // Redeem reward: cashier denied, manager succeeds
        const cashierRedeem = await admin.rpc('redeem_reward', {
          p_merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
          p_pass_serial_number: 'PASS-CANELO-002',
          p_employee_id: FIXTURE_IDS.EMP_CANELO_CASHIER_ID,
          p_stamps_to_deduct: 10,
        });
        assert.equal(cashierRedeem.error?.code, 'P0001');
        assert.match(cashierRedeem.error.message, /UNAUTHORIZED_MANAGER/);

        const managerRedeem = await admin.rpc('redeem_reward', {
          p_merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
          p_pass_serial_number: 'PASS-CANELO-002',
          p_employee_id: FIXTURE_IDS.EMP_CANELO_MANAGER_ID,
          p_stamps_to_deduct: 10,
        });
        assert.equal(managerRedeem.error, null);
        assert.equal(managerRedeem.data.stamps_remaining, 0);
        assert.equal(managerRedeem.data.total_rewards_redeemed, 4);
      } finally {
        await mock.close();
      }
    });
  });

  describe('3. wallet-mocks.mjs + wallet-network-interceptor.cjs', () => {
    it('routes GoogleAuth, fetch(), and http2.connect() in child process and supports fault injection', async () => {
      const cryptoFixtures = createTestCryptoFixtures();
      const walletMocks = await startWalletMocks({
        googlePublicKeyPem: cryptoFixtures.googlePublicKeyPem,
      });

      try {
        walletMocks.markAppleTokenUnregistered('dead-apns-token');
        walletMocks.injectGoogleFault({
          method: 'PATCH',
          pathPattern: 'FAULT_429',
          status: 429,
          times: 1,
        });

        const interceptorPath = path
          .join(WORKSPACE_ROOT, 'tests', 'e2e', 'lib', 'wallet-network-interceptor.cjs')
          .replace(/\\/g, '/');

        const childScript = `
          import { GoogleAuth } from 'google-auth-library';
          import { connect as h2Connect } from 'node:http2';

          const auth = new GoogleAuth({
            credentials: {
              client_email: process.env.TEST_GOOGLE_EMAIL,
              private_key: process.env.TEST_GOOGLE_PK,
            },
            scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
          });
          const client = await auth.getClient();

          const patchRes = await client.request({
            url: 'https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/3388.PASS-CANELO-001?updateMask=loyaltyPoints',
            method: 'PATCH',
            data: { notifyPreference: 'NOTIFY_ON_UPDATE', loyaltyPoints: { balance: { int: 9 } } },
          });

          const addMsgRes = await fetch('https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/3388.PASS-CANELO-001/addMessage', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ message: { header: '2x1', body: 'Hoy 2x1', messageType: 'TEXT_AND_NOTIFY' } }),
          });

          let fault429Status = 0;
          try {
            await fetch('https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/FAULT_429', {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({}),
            });
          } catch {}
          const faultRes = await fetch('https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/FAULT_429', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
          });
          fault429Status = faultRes.status;

          function sendApns(token) {
            return new Promise((resolve, reject) => {
              const session = h2Connect('https://api.push.apple.com');
              session.on('error', reject);
              const req = session.request({
                ':method': 'POST',
                ':path': '/3/device/' + token,
                'apns-topic': 'pass.com.dynamind.canelo.e2e',
                'apns-push-type': 'background',
              });
              let status = 0;
              const chunks = [];
              req.on('response', (h) => { status = h[':status']; });
              req.on('data', (c) => chunks.push(c));
              req.on('end', () => {
                session.close();
                resolve({ status, body: Buffer.concat(chunks).toString('utf8') });
              });
              req.end('{}');
            });
          }

          const apnsOk = await sendApns('apns-token-valentina-001');
          const apns410 = await sendApns('dead-apns-token');

          console.log(JSON.stringify({
            patchStatus: patchRes.status,
            addMsgStatus: addMsgRes.status,
            fault429Status,
            apnsOk,
            apns410,
          }));
        `;

        // Note: Reset fault so first fetch triggers 429 cleanly
        walletMocks.clearFaults();
        walletMocks.injectGoogleFault({
          method: 'PATCH',
          pathPattern: 'FAULT_429',
          status: 429,
          times: 2,
        });

        const existingOpts = process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : '';
        const res = await runNodeAsync(
          ['--input-type=module', '-e', childScript],
          {
            cwd: WORKSPACE_ROOT,
            env: {
              ...process.env,
              NODE_OPTIONS: `${existingOpts}--require ${interceptorPath}`,
              FIDELIZIA_E2E_GOOGLE_WALLET_MOCK_URL: walletMocks.googleUrl,
              FIDELIZIA_E2E_APPLE_APNS_MOCK_URL: walletMocks.apnsUrl,
              TEST_GOOGLE_EMAIL: cryptoFixtures.google.serviceAccountEmail,
              TEST_GOOGLE_PK: cryptoFixtures.googlePrivateKeyPem,
            },
          }
        );

        assert.equal(res.status, 0, `Child failed: ${res.stderr}`);
        const out = JSON.parse(res.stdout.trim().split(/\r?\n/).pop());
        assert.equal(out.patchStatus, 200);
        assert.equal(out.addMsgStatus, 200);
        assert.equal(out.fault429Status, 429);
        assert.equal(out.apnsOk.status, 200);
        assert.equal(out.apns410.status, 410);

        const oauthReqs = walletMocks.getOAuthTokenRequests();
        assert.ok(oauthReqs.length >= 1);

        const walletObj = walletMocks.getLoyaltyObject('3388.PASS-CANELO-001');
        assert.equal(walletObj.notifyPreference, 'NOTIFY_ON_UPDATE');
        assert.equal(walletObj.messages[0].messageType, 'TEXT_AND_NOTIFY');

        const apnsReqs = walletMocks.getApnsRequests();
        assert.equal(apnsReqs.length, 2);
        assert.equal(apnsReqs[0].apnsTopic, 'pass.com.dynamind.canelo.e2e');
        assert.equal(apnsReqs[0].apnsPushType, 'background');
      } finally {
        await walletMocks.close();
      }
    });
  });

  describe('4. pkpass-inspector.mjs', () => {
    it('validates real PKPass archive, DEFLATE synthetic ZIP, and catches 70-byte placeholder PNGs', async () => {
      const apple = generateAppleWalletCertFixtures();
      const icon29 = generateTestPngAsset(29, 29);
      const icon58 = generateTestPngAsset(58, 58);

      const pass = new PKPass(
        { 'icon.png': icon29, 'icon@2x.png': icon58 },
        {
          wwdr: Buffer.from(apple.wwdrCertBase64, 'base64'),
          signerCert: Buffer.from(apple.signerCertBase64, 'base64'),
          signerKey: Buffer.from(apple.signerKeyBase64, 'base64'),
        },
        {
          formatVersion: 1,
          passTypeIdentifier: apple.passTypeId,
          teamIdentifier: apple.teamId,
          organizationName: 'Café Canelo',
          description: 'Fidelidad',
          serialNumber: 'PASS-CANELO-002',
          webServiceURL: 'https://fidelizia.test/api/v1/apple',
          authenticationToken: 'sec_PASS-CANELO-002',
        }
      );
      pass.type = 'storeCard';
      pass.primaryFields.push({
        key: 'stamps',
        label: 'SELLOS',
        value: '9 / 10',
        changeMessage: 'Actualizado a %@',
      });

      const inspected = inspectPkpass(pass.getAsBuffer(), {
        expectedSerialNumber: 'PASS-CANELO-002',
        expectedPassTypeId: apple.passTypeId,
        expectedTeamId: apple.teamId,
      });
      assert.equal(inspected.valid, true, `Errors: ${inspected.errors.join(', ')}`);
      assert.equal(inspected.passType, 'storeCard');
      assert.equal(inspected.signatureInfo.certificateCount, 2);
      assert.equal(inspected.pngs['icon.png'].width, 29);
      assert.equal(inspected.pngs['icon@2x.png'].width, 58);

      // Synthetic DEFLATE ZIP
      const deflateZip = buildSyntheticDeflateZip([
        ['pass.json', Buffer.from('{"serialNumber":"DEFLATE-1"}', 'utf8')],
        ['icon.png', icon29],
      ]);
      const parsedDeflate = parseZipBuffer(deflateZip);
      assert.equal(parsedDeflate.compressionMethods['pass.json'], 8);
      assert.equal(JSON.parse(parsedDeflate.entries.get('pass.json').toString('utf8')).serialNumber, 'DEFLATE-1');

      // Verify real 29x29 icon.png replaced the 70-byte placeholder AND reject synthetic <100 byte PNGs
      const repoIconPath = path.join(
        WORKSPACE_ROOT,
        'public',
        'wallet-templates',
        'canelo.pass',
        'icon.png'
      );
      if (fs.existsSync(repoIconPath)) {
        const repoIconBuf = fs.readFileSync(repoIconPath);
        const repoIconPng = inspectPngBuffer(repoIconBuf);
        assert.equal(repoIconPng.valid, true);
        assert.ok(repoIconPng.bytes >= 100);
        assert.equal(repoIconPng.width, 29);
        assert.equal(repoIconPng.height, 29);
      }
      const syntheticTiny = generateTestPngAsset(1, 1);
      const placeholderPng = inspectPngBuffer(syntheticTiny);
      assert.ok(placeholderPng.bytes < 100);
    });
  });

  describe('5. qr-decoder.mjs', () => {
    it('decodes PNGs across all 5 filter types, SVGs in rect/path modes, and rejects fake hash grids', () => {
      const payload = 'https://fidelizia.app/join/cafe-canelo?serial=FID-99';
      const pngBuf = encodeQrToPng(payload);
      assert.equal(decodeQrFromPng(pngBuf).text, payload);
      assert.equal(decodeQr(`data:image/png;base64,${pngBuf.toString('base64')}`).text, payload);

      // Exercise PNG filters 0..4 on a real QR matrix
      const { width, height, luminances } = decodePngToLuminance(pngBuf);
      const rgba = Buffer.alloc(width * height * 4);
      for (let i = 0; i < width * height; i += 1) {
        const v = luminances[i];
        rgba[i * 4] = v;
        rgba[i * 4 + 1] = v;
        rgba[i * 4 + 2] = v;
        rgba[i * 4 + 3] = 255;
      }
      for (const filterType of [0, 1, 2, 3, 4]) {
        const filteredPng = buildFilteredPng(width, height, rgba, filterType);
        assert.equal(decodeQrFromPng(filteredPng).text, payload);
      }

      // SVG rect & path modes + data URL
      const svgRect = encodeQrToSvg('FID-CANELO-9042', { mode: 'rect', margin: 0 });
      assert.equal(decodeQrFromSvg(svgRect).text, 'FID-CANELO-9042');

      const svgPath = encodeQrToSvg('FID-CANELO-PATH', { mode: 'path', margin: 2 });
      assert.equal(decodeQrFromSvg(svgPath).text, 'FID-CANELO-PATH');
      assert.equal(
        decodeQr(`data:image/svg+xml;base64,${Buffer.from(svgPath, 'utf8').toString('base64')}`).text,
        'FID-CANELO-PATH'
      );

      // Fake 21x21 hash grid matching legacy SvgQrCode must be rejected
      const fakeRects = [];
      const hash = 4219;
      for (let r = 0; r < 21; r += 1) {
        for (let c = 0; c < 21; c += 1) {
          if (((hash * (r + 1) * (c + 1) * 31) % 100) > 48) {
            fakeRects.push(`<rect x="${c * 6}" y="${r * 6}" width="6" height="6" fill="#09090b"/>`);
          }
        }
      }
      const fakeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="126" height="126" viewBox="0 0 126 126">${fakeRects.join('')}</svg>`;
      const fakeAttempt = tryDecodeQr(fakeSvg);
      assert.equal(fakeAttempt.scannable, false);
    });
  });

  describe('6. browser-driver.mjs', () => {
    it('drives headless Chromium for viewports, overflow, geolocation, QR capture, interaction, and telemetry', async () => {
      const exe = resolveChromiumExecutable();
      assert.ok(fs.existsSync(exe));

      const qrSvg = encodeQrToSvg('PASS-CANELO-002', { mode: 'rect', size: 180 });
      const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            body { margin: 0; background: #08080a; color: #fff; font-family: system-ui; }
            .wrap { padding: 16px; max-width: 100%; box-sizing: border-box; }
          </style>
        </head>
        <body>
          <div class="wrap">
            <h1>Fidelizia Harness Page</h1>
            <div id="qr-box">${qrSvg}</div>
            <input id="name-input" type="text" />
            <button id="submit-btn">Enviar</button>
            <div id="out"></div>
            <button id="geo-btn">Geo</button>
            <div id="geo-out"></div>
            <button id="err-btn">Trigger Errors</button>
          </div>
          <script>
            document.getElementById('submit-btn').addEventListener('click', () => {
              document.getElementById('out').textContent = 'Hola:' + document.getElementById('name-input').value;
            });
            document.getElementById('geo-btn').addEventListener('click', () => {
              navigator.geolocation.getCurrentPosition(
                (p) => { document.getElementById('geo-out').textContent = 'OK:' + p.coords.latitude.toFixed(4); },
                (e) => { document.getElementById('geo-out').textContent = 'ERR:' + e.code; }
              );
            });
            document.getElementById('err-btn').addEventListener('click', async () => {
              console.error('Simulated console error');
              await fetch('/fail-500');
              setTimeout(() => { throw new Error('Simulated page error'); }, 10);
            });
          </script>
        </body>
      </html>`;

      const testServer = http.createServer((req, res) => {
        if (req.url === '/fail-500') {
          res.writeHead(500, { 'content-type': 'text/plain' });
          res.end('Internal Error');
          return;
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
      });

      await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
      const port = testServer.address().port;
      const baseUrl = `http://127.0.0.1:${port}`;

      const browser = await launchBrowser();
      try {
        const page = await browser.newPage({ viewport: VIEWPORT_DESKTOP });
        await page.goto(baseUrl, { waitUntil: 'networkidle' });

        const desktopGeo = await page.auditPageGeometry();
        assert.equal(desktopGeo.innerWidth, 1440);
        assert.equal(desktopGeo.hasHorizontalOverflow, false);

        await page.setViewport(VIEWPORT_MOBILE);
        const mobileGeo = await page.auditPageGeometry();
        assert.equal(mobileGeo.innerWidth, 390);
        assert.equal(mobileGeo.hasHorizontalOverflow, false);

        // Inject overflowing element and verify detection, then remove it
        await page.evaluate(() => {
          const div = document.createElement('div');
          div.id = 'overflow-probe';
          div.style.width = '600px';
          div.style.height = '10px';
          document.body.appendChild(div);
        });
        const overflowGeo = await page.auditPageGeometry();
        assert.equal(overflowGeo.hasHorizontalOverflow, true);
        await page.evaluate(() => document.getElementById('overflow-probe')?.remove());

        // QR element capture + decode
        const qrs = await page.captureQrElements('#qr-box svg');
        assert.equal(qrs.length, 1);
        assert.equal(decodeQrFromSvg(qrs[0].outerHTML).text, 'PASS-CANELO-002');

        // Fill & click
        await page.fill('#name-input', 'Valentina');
        await page.click('#submit-btn');
        assert.equal(await page.textContent('#out'), 'Hola:Valentina');

        // Geolocation grant vs deny
        await page.setGeolocation({ latitude: 4.6682, longitude: -74.0538 }, baseUrl);
        await page.click('#geo-btn');
        await page.evaluate(
          () => new Promise((r) => setTimeout(r, 150))
        );
        assert.equal(await page.textContent('#geo-out'), 'OK:4.6682');

        await page.setGeolocation(null, baseUrl);
        await page.click('#geo-btn');
        await page.evaluate(
          () => new Promise((r) => setTimeout(r, 150))
        );
        assert.equal(await page.textContent('#geo-out'), 'ERR:1');

        // Telemetry capture
        page.resetTelemetry();
        await page.click('#err-btn');
        await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
        const tel = page.getTelemetry();
        assert.ok(tel.consoleErrors.some((e) => e.text.includes('Simulated console error')));
        assert.ok(tel.httpErrors.some((e) => e.status === 500));
        assert.ok(tel.pageErrors.some((e) => e.text.includes('Simulated page error')));

        const shot = await page.screenshot();
        assert.equal(inspectPngBuffer(shot).valid, true);
      } finally {
        await browser.close();
        await new Promise((resolve) => testServer.close(resolve));
      }
    });
  });

  describe('7. run-e2e.mjs CLI', () => {
    it('prints help text and exits 0 on --help', () => {
      const res = spawnSync(process.execPath, [path.join(WORKSPACE_ROOT, 'tests', 'e2e', 'run-e2e.mjs'), '--help'], {
        cwd: WORKSPACE_ROOT,
        encoding: 'utf8',
      });
      assert.equal(res.status, 0);
      assert.match(res.stdout, /Fidelizia E2E Test Runner/);
      assert.match(res.stdout, /--self-test/);
    });
  });
});
