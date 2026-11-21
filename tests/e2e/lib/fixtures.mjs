import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import forge from 'node-forge';

export const FIXTURE_PINS = Object.freeze({
  CANELO_CASHIER_PIN: '1234',
  CANELO_MANAGER_PIN: '9999',
  CANELO_ADMIN_PIN: '0000',
  CANELO_INACTIVE_PIN: '4321',
  SUR_CASHIER_PIN: '5678',
  SUR_MANAGER_PIN: '8888',
});

export const FIXTURE_PASSWORDS = Object.freeze({
  CANELO_ADMIN_PWD: 'CaneloAdmin#2026',
  CANELO_STAFF_PWD: 'CaneloStaff#2026',
  SUR_ADMIN_PWD: 'SurAdmin#2026',
});

export const FIXTURE_IDS = Object.freeze({
  MERCHANT_CANELO_ID: '00000000-0000-0000-0000-000000000001',
  MERCHANT_SUR_ID: '00000000-0000-0000-0000-000000000101',

  LOC_CANELO_ID: '00000000-0000-0000-0000-000000000002',
  LOC_SUR_ID: '00000000-0000-0000-0000-000000000102',

  EMP_CANELO_CASHIER_ID: '00000000-0000-0000-0000-000000000003',
  EMP_CANELO_MANAGER_ID: '00000000-0000-0000-0000-000000000004',
  EMP_CANELO_ADMIN_ID: '00000000-0000-0000-0000-000000000014',
  EMP_CANELO_INACTIVE_ID: '00000000-0000-0000-0000-000000000024',
  EMP_SUR_CASHIER_ID: '00000000-0000-0000-0000-000000000103',
  EMP_SUR_MANAGER_ID: '00000000-0000-0000-0000-000000000104',

  CUST_CANELO_CHAMPION_ID: '00000000-0000-0000-0000-000000000005',
  CUST_CANELO_APPLE_ID: '00000000-0000-0000-0000-000000000015',
  CUST_CANELO_AT_RISK_ID: '00000000-0000-0000-0000-000000000025',
  CUST_CANELO_COOLDOWN_ID: '00000000-0000-0000-0000-000000000035',
  CUST_CANELO_SUSPENDED_ID: '00000000-0000-0000-0000-000000000045',
  CUST_SUR_LOYAL_ID: '00000000-0000-0000-0000-000000000105',

  PASS_CANELO_001_ID: '00000000-0000-0000-0000-000000000006',
  PASS_CANELO_002_ID: '00000000-0000-0000-0000-000000000016',
  PASS_CANELO_003_ID: '00000000-0000-0000-0000-000000000026',
  PASS_CANELO_004_ID: '00000000-0000-0000-0000-000000000036',
  PASS_CANELO_SUSPENDED_ID: '00000000-0000-0000-0000-000000000046',
  PASS_SUR_001_ID: '00000000-0000-0000-0000-000000000106',
  PASS_SUR_002_ID: '00000000-0000-0000-0000-000000000116',

  APPLE_REG_VALENTINA_ID: '00000000-0000-0000-0000-000000000018',
  APPLE_REG_ELENA_ID: '00000000-0000-0000-0000-000000000118',

  TX_CANELO_001_ID: '00000000-0000-0000-0000-000000000007',
  TX_CANELO_002_ID: '00000000-0000-0000-0000-000000000017',
  TX_CANELO_RECENT_ID: '00000000-0000-0000-0000-000000000027',
  TX_SUR_001_ID: '00000000-0000-0000-0000-000000000107',

  RES_CANELO_001_ID: '00000000-0000-0000-0000-000000000009',
  RES_SUR_001_ID: '00000000-0000-0000-0000-000000000109',

  FA_CANELO_001_ID: '00000000-0000-0000-0000-000000000010',
  FA_SUR_001_ID: '00000000-0000-0000-0000-000000000110',

  REV_CANELO_001_ID: '00000000-0000-0000-0000-000000000011',
  REV_SUR_001_ID: '00000000-0000-0000-0000-000000000111',
});

export const E2E_ENV_DEFAULTS = Object.freeze({
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-test-anon-key-fidelizia',
  SUPABASE_SERVICE_ROLE_KEY: 'e2e-test-service-role-key-fidelizia',
  SESSION_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  APPLE_PASS_TYPE_ID: 'pass.com.dynamind.canelo.e2e',
  APPLE_TEAM_ID: 'DYNAMIND26',
  APPLE_WEB_SERVICE_SECRET: 'e2e_apple_ws_secret_2026',
  GOOGLE_ISSUER_ID: '3388000000023227346',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'fidelizia-e2e@dynamind-test.iam.gserviceaccount.com',
});

export function hashSecret(plain, rounds = 4) {
  return bcrypt.hashSync(String(plain), rounds);
}

export function verifySecret(plain, hash) {
  if (!plain || !hash) return false;
  return bcrypt.compareSync(String(plain), String(hash));
}

function makePngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcVal = zlib.crc32(crcInput) >>> 0;
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Generates a valid RGBA PNG buffer (> 100 bytes) using node:zlib (deflateSync + crc32).
 * @param {number} width
 * @param {number} height
 * @param {[number, number, number, number]} [rgba=[212, 163, 115, 255]]
 * @returns {Buffer}
 */
export function generateTestPngAsset(width, height, rgba = [212, 163, 115, 255]) {
  const w = Math.max(1, Math.trunc(width));
  const h = Math.max(1, Math.trunc(height));
  const [r, g, b, a] = rgba;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bitDepth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const rowBytes = 1 + w * 4;
  const raw = Buffer.alloc(rowBytes * h);
  for (let y = 0; y < h; y += 1) {
    const rowStart = y * rowBytes;
    raw[rowStart] = 0; // filter None
    for (let x = 0; x < w; x += 1) {
      const px = rowStart + 1 + x * 4;
      raw[px] = r & 0xff;
      raw[px + 1] = g & 0xff;
      raw[px + 2] = b & 0xff;
      raw[px + 3] = a & 0xff;
    }
  }

  const compressed = zlib.deflateSync(raw);
  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Generates an ephemeral 2048-bit RS256 Google service account keypair (PKCS#8 + SPKI).
 * @param {{ issuerId?: string, serviceAccountEmail?: string }} [options]
 */
export function generateGoogleServiceAccountFixtures(options = {}) {
  const issuerId = options.issuerId || E2E_ENV_DEFAULTS.GOOGLE_ISSUER_ID;
  const serviceAccountEmail = options.serviceAccountEmail || E2E_ENV_DEFAULTS.GOOGLE_SERVICE_ACCOUNT_EMAIL;

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  return {
    issuerId,
    serviceAccountEmail,
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
    privateKeyEscaped: privateKey.replace(/\r?\n/g, '\\n'),
  };
}

function toPositiveHexSerial() {
  const bytes = crypto.randomBytes(8);
  bytes[0] = (bytes[0] & 0x7f) | 0x01;
  return bytes.toString('hex');
}

/**
 * Generates ephemeral Apple WWDR CA + Pass Signer X.509 v3 PEM certificates & PKCS#8 key
 * verified compatible with passkit-generator v3.7.0 and Node http2.connect().
 * @param {{ passTypeId?: string, teamId?: string, webServiceSecret?: string, passphrase?: string }} [options]
 */
export function generateAppleWalletCertFixtures(options = {}) {
  const passTypeId = options.passTypeId || E2E_ENV_DEFAULTS.APPLE_PASS_TYPE_ID;
  const teamId = options.teamId || E2E_ENV_DEFAULTS.APPLE_TEAM_ID;
  const webServiceSecret = options.webServiceSecret || E2E_ENV_DEFAULTS.APPLE_WEB_SERVICE_SECRET;
  const passphrase = options.passphrase;

  const now = Date.now();
  const notBefore = new Date(now - 24 * 60 * 60 * 1000);
  const notAfter = new Date(now + 365 * 24 * 60 * 60 * 1000);

  // 1. WWDR CA keypair & X.509 v3 certificate
  const wwdrPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const wwdrForgePrivate = forge.pki.privateKeyFromPem(wwdrPair.privateKey);
  const wwdrForgePublic = forge.pki.publicKeyFromPem(wwdrPair.publicKey);

  const wwdrCert = forge.pki.createCertificate();
  wwdrCert.publicKey = wwdrForgePublic;
  wwdrCert.serialNumber = toPositiveHexSerial();
  wwdrCert.validity.notBefore = notBefore;
  wwdrCert.validity.notAfter = notAfter;
  const wwdrAttrs = [
    { name: 'commonName', value: 'Apple Worldwide Developer Relations E2E Test CA' },
    { name: 'organizationName', value: 'Apple Inc. (E2E Test)' },
    { name: 'countryName', value: 'US' },
  ];
  wwdrCert.setSubject(wwdrAttrs);
  wwdrCert.setIssuer(wwdrAttrs);
  wwdrCert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    { name: 'subjectKeyIdentifier' },
  ]);
  wwdrCert.sign(wwdrForgePrivate, forge.md.sha256.create());
  const wwdrCertPem = forge.pki.certificateToPem(wwdrCert);

  // 2. Pass Signer keypair & X.509 v3 certificate signed by WWDR CA
  const signerPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const signerForgePublic = forge.pki.publicKeyFromPem(signerPair.publicKey);

  const signerCert = forge.pki.createCertificate();
  signerCert.publicKey = signerForgePublic;
  signerCert.serialNumber = toPositiveHexSerial();
  signerCert.validity.notBefore = notBefore;
  signerCert.validity.notAfter = notAfter;
  const signerSubject = [
    { name: 'commonName', value: `Pass Type ID: ${passTypeId}` },
    { type: '0.9.2342.19200300.100.1.1', shortName: 'UID', value: passTypeId },
    { name: 'organizationalUnitName', value: teamId },
    { name: 'organizationName', value: 'Fidelizia E2E Test Org' },
    { name: 'countryName', value: 'CO' },
  ];
  signerCert.setSubject(signerSubject);
  signerCert.setIssuer(wwdrAttrs);
  signerCert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
    { name: 'extKeyUsage', clientAuth: true },
    { name: 'subjectKeyIdentifier' },
  ]);
  signerCert.sign(wwdrForgePrivate, forge.md.sha256.create());
  const signerCertPem = forge.pki.certificateToPem(signerCert);

  let signerKeyPem = signerPair.privateKey;
  if (passphrase) {
    const forgeSignerPriv = forge.pki.privateKeyFromPem(signerPair.privateKey);
    signerKeyPem = forge.pki.encryptRsaPrivateKey(forgeSignerPriv, passphrase);
  }

  return {
    passTypeId,
    teamId,
    webServiceSecret,
    passphrase: passphrase || undefined,
    wwdrCertPem,
    signerCertPem,
    signerKeyPem,
    wwdrCertBase64: Buffer.from(wwdrCertPem, 'utf8').toString('base64'),
    signerCertBase64: Buffer.from(signerCertPem, 'utf8').toString('base64'),
    signerKeyBase64: Buffer.from(signerKeyPem, 'utf8').toString('base64'),
  };
}

/**
 * Convenience combined crypto fixture generator for Google + Apple wallet tests.
 */
export function createTestCryptoFixtures(options = {}) {
  const google = generateGoogleServiceAccountFixtures(options.google);
  const apple = generateAppleWalletCertFixtures(options.apple);

  return {
    google,
    apple,
    googlePrivateKeyPem: google.privateKeyPem,
    googlePublicKeyPem: google.publicKeyPem,
    googlePrivateKeyEscaped: google.privateKeyEscaped,
    appleWwdrCertPem: apple.wwdrCertPem,
    appleSignerCertPem: apple.signerCertPem,
    appleSignerKeyPem: apple.signerKeyPem,
    appleWwdrCertBase64: apple.wwdrCertBase64,
    appleSignerCertBase64: apple.signerCertBase64,
    appleSignerKeyBase64: apple.signerKeyBase64,
  };
}

/**
 * Generates deterministic multi-tenant seed data across all 11 Fidelizia tables.
 * @param {{ now?: Date | string, pinRounds?: number, webServiceSecret?: string }} [options]
 */
export function createSeedState(options = {}) {
  const nowDate = options.now ? new Date(options.now) : new Date();
  const nowMs = nowDate.getTime();
  const pinRounds = options.pinRounds ?? 4;
  const wsSecret = options.webServiceSecret || E2E_ENV_DEFAULTS.APPLE_WEB_SERVICE_SECRET;

  const isoOffset = (deltaMs) => new Date(nowMs + deltaMs).toISOString();
  const HOUR = 60 * 60 * 1000;
  const MIN = 60 * 1000;
  const DAY = 24 * HOUR;

  const defaultOpeningHours = {
    monday: { open: '08:00', close: '22:00', closed: false },
    tuesday: { open: '08:00', close: '22:00', closed: false },
    wednesday: { open: '08:00', close: '22:00', closed: false },
    thursday: { open: '08:00', close: '22:00', closed: false },
    friday: { open: '08:00', close: '23:59', closed: false },
    saturday: { open: '09:00', close: '23:59', closed: false },
    sunday: { open: '09:00', close: '20:00', closed: false },
  };

  const merchants = [
    {
      id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      user_id: null,
      name: 'Café Canelo & Specialty Roasters',
      slug: 'cafe-canelo',
      logo_url: null,
      brand_color: '#8b5cf6',
      secondary_color: '#09090b',
      google_place_id: 'ChIJCaneloBogotaE2E001',
      stamps_needed: 10,
      reward_description: 'Bebida de especialidad gratis o postre artesanal',
      cooldown_hours: 3,
      scanner_geofence_meters: 250,
      opening_hours: defaultOpeningHours,
      card_pattern: 'guilloche',
      show_emv_chip: true,
      show_hologram: true,
      loyalty_program_mode: 'multi_tier',
      card_morphology: 'rounded',
      card_gradient: { preset: 'obsidian_gold', from: '#1c1007', via: '#2a1810', to: '#08080a', angle: 135 },
      tier_config: { bronzeMin: 0, silverMin: 5, goldMin: 15, championMin: 25 },
      preconfigured_rewards: ['Espresso doble cortesía', 'Cold Brew + Croissant', 'Bolsa de café 250g'],
      reward_milestones: [
        { id: 'ms-5', stamp_number: 5, reward: 'Shot extra o leche vegetal', icon: 'coffee' },
        { id: 'ms-10', stamp_number: 10, reward: 'Bebida de especialidad gratis', icon: 'gift' },
      ],
      is_active: true,
      created_at: isoOffset(-90 * DAY),
      updated_at: isoOffset(-1 * DAY),
    },
    {
      id: FIXTURE_IDS.MERCHANT_SUR_ID,
      user_id: null,
      name: 'Tostadores del Sur',
      slug: 'tostadores-sur',
      logo_url: null,
      brand_color: '#d4a373',
      secondary_color: '#0b0b0e',
      google_place_id: 'ChIJSurMedellinE2E002',
      stamps_needed: 8,
      reward_description: 'Café filtrado V60 de origen único',
      cooldown_hours: 2,
      scanner_geofence_meters: 150,
      opening_hours: defaultOpeningHours,
      card_pattern: 'carbon_fiber',
      show_emv_chip: false,
      show_hologram: true,
      loyalty_program_mode: 'single_card',
      card_morphology: 'orthogonal',
      card_gradient: { preset: 'espresso_noir', from: '#121215', to: '#08080a', angle: 145 },
      tier_config: { bronzeMin: 0, silverMin: 4, goldMin: 10, championMin: 20 },
      preconfigured_rewards: ['Americano gratis', 'V60 de cortesía', 'Degustación para 2'],
      reward_milestones: [{ id: 'ms-8', stamp_number: 8, reward: 'V60 gratis', icon: 'cup' }],
      is_active: true,
      created_at: isoOffset(-60 * DAY),
      updated_at: isoOffset(-2 * DAY),
    },
  ];

  const locations = [
    {
      id: FIXTURE_IDS.LOC_CANELO_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      name: 'Sede Chapinero',
      address: 'Calle 65 # 7-42, Bogotá',
      latitude: 4.6682,
      longitude: -74.0538,
      radius_meters: 150,
      relevant_text: '¡Estás cerca de Café Canelo Chapinero! Suma tu sello de hoy',
      is_active: true,
      created_at: isoOffset(-90 * DAY),
    },
    {
      id: FIXTURE_IDS.LOC_SUR_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_SUR_ID,
      name: 'Sede El Poblado',
      address: 'Carrera 37 # 10-25, Medellín',
      latitude: 6.2088,
      longitude: -75.567,
      radius_meters: 100,
      relevant_text: '¡Estás cerca de Tostadores del Sur! Pasa por tu V60',
      is_active: true,
      created_at: isoOffset(-60 * DAY),
    },
  ];

  const adminPwdHash = hashSecret(FIXTURE_PASSWORDS.CANELO_ADMIN_PWD, pinRounds);
  const staffPwdHash = hashSecret(FIXTURE_PASSWORDS.CANELO_STAFF_PWD, pinRounds);
  const surAdminPwdHash = hashSecret(FIXTURE_PASSWORDS.SUR_ADMIN_PWD, pinRounds);

  const employees = [
    {
      id: FIXTURE_IDS.EMP_CANELO_CASHIER_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      location_id: FIXTURE_IDS.LOC_CANELO_ID,
      name: 'Laura Cajera',
      email: 'laura@cafecanelo.co',
      pin_hash: hashSecret(FIXTURE_PINS.CANELO_CASHIER_PIN, pinRounds),
      password_hash: staffPwdHash,
      dsb_password: staffPwdHash,
      role: 'cashier',
      is_active: true,
      created_at: isoOffset(-80 * DAY),
    },
    {
      id: FIXTURE_IDS.EMP_CANELO_MANAGER_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      location_id: FIXTURE_IDS.LOC_CANELO_ID,
      name: 'Diego Gerente',
      email: 'diego@cafecanelo.co',
      pin_hash: hashSecret(FIXTURE_PINS.CANELO_MANAGER_PIN, pinRounds),
      password_hash: staffPwdHash,
      dsb_password: staffPwdHash,
      role: 'manager',
      is_active: true,
      created_at: isoOffset(-85 * DAY),
    },
    {
      id: FIXTURE_IDS.EMP_CANELO_ADMIN_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      location_id: FIXTURE_IDS.LOC_CANELO_ID,
      name: 'Camila Admin',
      email: 'admin@cafecanelo.co',
      pin_hash: hashSecret(FIXTURE_PINS.CANELO_ADMIN_PIN, pinRounds),
      password_hash: adminPwdHash,
      dsb_password: adminPwdHash,
      role: 'admin',
      is_active: true,
      created_at: isoOffset(-90 * DAY),
    },
    {
      id: FIXTURE_IDS.EMP_CANELO_INACTIVE_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      location_id: FIXTURE_IDS.LOC_CANELO_ID,
      name: 'Ex Empleado',
      email: 'ex@cafecanelo.co',
      pin_hash: hashSecret(FIXTURE_PINS.CANELO_INACTIVE_PIN, pinRounds),
      password_hash: staffPwdHash,
      dsb_password: staffPwdHash,
      role: 'cashier',
      is_active: false,
      created_at: isoOffset(-88 * DAY),
    },
    {
      id: FIXTURE_IDS.EMP_SUR_CASHIER_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_SUR_ID,
      location_id: FIXTURE_IDS.LOC_SUR_ID,
      name: 'Mateo Barista',
      email: 'mateo@tostadoressur.co',
      pin_hash: hashSecret(FIXTURE_PINS.SUR_CASHIER_PIN, pinRounds),
      password_hash: surAdminPwdHash,
      dsb_password: surAdminPwdHash,
      role: 'cashier',
      is_active: true,
      created_at: isoOffset(-55 * DAY),
    },
    {
      id: FIXTURE_IDS.EMP_SUR_MANAGER_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_SUR_ID,
      location_id: FIXTURE_IDS.LOC_SUR_ID,
      name: 'Sofía Gerente Sur',
      email: 'admin@tostadoressur.co',
      pin_hash: hashSecret(FIXTURE_PINS.SUR_MANAGER_PIN, pinRounds),
      password_hash: surAdminPwdHash,
      dsb_password: surAdminPwdHash,
      role: 'admin',
      is_active: true,
      created_at: isoOffset(-60 * DAY),
    },
  ];

  const birthThisMonth = `${nowDate.getUTCFullYear() - 28}-${String(nowDate.getUTCMonth() + 1).padStart(2, '0')}-15`;

  const customers = [
    {
      id: FIXTURE_IDS.CUST_CANELO_CHAMPION_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      phone: '+573001234567',
      full_name: 'Carlos Mendoza',
      birthdate: birthThisMonth,
      terms_accepted_at: isoOffset(-60 * DAY),
      rfm_segment: 'champion',
      loyalty_tier: 'champion',
      custom_reward: null,
      discount_percentage: null,
      created_at: isoOffset(-60 * DAY),
      updated_at: isoOffset(-48 * HOUR),
    },
    {
      id: FIXTURE_IDS.CUST_CANELO_APPLE_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      phone: '+573109876543',
      full_name: 'Valentina Duque',
      birthdate: '1994-03-19',
      terms_accepted_at: isoOffset(-45 * DAY),
      rfm_segment: 'loyal',
      loyalty_tier: 'silver',
      custom_reward: null,
      discount_percentage: null,
      created_at: isoOffset(-45 * DAY),
      updated_at: isoOffset(-72 * HOUR),
    },
    {
      id: FIXTURE_IDS.CUST_CANELO_AT_RISK_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      phone: '+573155554433',
      full_name: 'Andrés Restrepo',
      birthdate: '1990-07-08',
      terms_accepted_at: isoOffset(-70 * DAY),
      rfm_segment: 'at_risk',
      loyalty_tier: 'bronze',
      custom_reward: null,
      discount_percentage: null,
      created_at: isoOffset(-70 * DAY),
      updated_at: isoOffset(-25 * DAY),
    },
    {
      id: FIXTURE_IDS.CUST_CANELO_COOLDOWN_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      phone: '+573201112233',
      full_name: 'Sofía Vargas',
      birthdate: '1998-11-02',
      terms_accepted_at: isoOffset(-10 * DAY),
      rfm_segment: 'new',
      loyalty_tier: 'bronze',
      custom_reward: null,
      discount_percentage: null,
      created_at: isoOffset(-10 * DAY),
      updated_at: isoOffset(-30 * MIN),
    },
    {
      id: FIXTURE_IDS.CUST_CANELO_SUSPENDED_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      phone: '+573219998877',
      full_name: 'Mateo Blocked',
      birthdate: null,
      terms_accepted_at: isoOffset(-20 * DAY),
      rfm_segment: 'hibernating',
      loyalty_tier: 'bronze',
      custom_reward: null,
      discount_percentage: null,
      created_at: isoOffset(-20 * DAY),
      updated_at: isoOffset(-15 * DAY),
    },
    {
      id: FIXTURE_IDS.CUST_SUR_LOYAL_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_SUR_ID,
      phone: '+573007776655',
      full_name: 'Elena Ríos',
      birthdate: '1992-05-22',
      terms_accepted_at: isoOffset(-30 * DAY),
      rfm_segment: 'loyal',
      loyalty_tier: 'silver',
      custom_reward: null,
      discount_percentage: null,
      created_at: isoOffset(-30 * DAY),
      updated_at: isoOffset(-48 * HOUR),
    },
  ];

  const wallet_passes = [
    {
      id: FIXTURE_IDS.PASS_CANELO_001_ID,
      customer_id: FIXTURE_IDS.CUST_CANELO_CHAMPION_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      pass_type: 'google',
      pass_serial_number: 'PASS-CANELO-001',
      push_token: null,
      authentication_token: `${wsSecret}_PASS-CANELO-001`,
      current_stamps: 8,
      total_visits: 24,
      total_rewards_redeemed: 11,
      last_visit_at: isoOffset(-48 * HOUR),
      last_push_title: null,
      last_push_message: null,
      google_push_count_24h: 0,
      google_push_window_start: null,
      status: 'active',
      created_at: isoOffset(-60 * DAY),
      updated_at: isoOffset(-48 * HOUR),
    },
    {
      id: FIXTURE_IDS.PASS_CANELO_002_ID,
      customer_id: FIXTURE_IDS.CUST_CANELO_APPLE_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      pass_type: 'apple',
      pass_serial_number: 'PASS-CANELO-002',
      push_token: 'apns-token-valentina-001',
      authentication_token: `${wsSecret}_PASS-CANELO-002`,
      current_stamps: 9,
      total_visits: 9,
      total_rewards_redeemed: 3,
      last_visit_at: isoOffset(-72 * HOUR),
      last_push_title: null,
      last_push_message: null,
      google_push_count_24h: 0,
      google_push_window_start: null,
      status: 'active',
      created_at: isoOffset(-45 * DAY),
      updated_at: isoOffset(-72 * HOUR),
    },
    {
      id: FIXTURE_IDS.PASS_CANELO_003_ID,
      customer_id: FIXTURE_IDS.CUST_CANELO_AT_RISK_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      pass_type: 'google',
      pass_serial_number: 'PASS-CANELO-003',
      push_token: null,
      authentication_token: `${wsSecret}_PASS-CANELO-003`,
      current_stamps: 10,
      total_visits: 10,
      total_rewards_redeemed: 0,
      last_visit_at: isoOffset(-25 * DAY),
      last_push_title: null,
      last_push_message: null,
      google_push_count_24h: 0,
      google_push_window_start: null,
      status: 'active',
      created_at: isoOffset(-70 * DAY),
      updated_at: isoOffset(-25 * DAY),
    },
    {
      id: FIXTURE_IDS.PASS_CANELO_004_ID,
      customer_id: FIXTURE_IDS.CUST_CANELO_COOLDOWN_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      pass_type: 'google',
      pass_serial_number: 'PASS-CANELO-004',
      push_token: null,
      authentication_token: `${wsSecret}_PASS-CANELO-004`,
      current_stamps: 2,
      total_visits: 2,
      total_rewards_redeemed: 0,
      last_visit_at: isoOffset(-30 * MIN),
      last_push_title: null,
      last_push_message: null,
      google_push_count_24h: 0,
      google_push_window_start: null,
      status: 'active',
      created_at: isoOffset(-10 * DAY),
      updated_at: isoOffset(-30 * MIN),
    },
    {
      id: FIXTURE_IDS.PASS_CANELO_SUSPENDED_ID,
      customer_id: FIXTURE_IDS.CUST_CANELO_SUSPENDED_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      pass_type: 'apple',
      pass_serial_number: 'PASS-CANELO-SUSPENDED',
      push_token: null,
      authentication_token: `${wsSecret}_PASS-CANELO-SUSPENDED`,
      current_stamps: 1,
      total_visits: 1,
      total_rewards_redeemed: 0,
      last_visit_at: isoOffset(-15 * DAY),
      last_push_title: null,
      last_push_message: null,
      google_push_count_24h: 0,
      google_push_window_start: null,
      status: 'suspended',
      created_at: isoOffset(-20 * DAY),
      updated_at: isoOffset(-15 * DAY),
    },
    {
      id: FIXTURE_IDS.PASS_SUR_001_ID,
      customer_id: FIXTURE_IDS.CUST_SUR_LOYAL_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_SUR_ID,
      pass_type: 'google',
      pass_serial_number: 'PASS-SUR-001',
      push_token: null,
      authentication_token: `${wsSecret}_PASS-SUR-001`,
      current_stamps: 4,
      total_visits: 4,
      total_rewards_redeemed: 0,
      last_visit_at: isoOffset(-48 * HOUR),
      last_push_title: null,
      last_push_message: null,
      google_push_count_24h: 0,
      google_push_window_start: null,
      status: 'active',
      created_at: isoOffset(-30 * DAY),
      updated_at: isoOffset(-48 * HOUR),
    },
    {
      id: FIXTURE_IDS.PASS_SUR_002_ID,
      customer_id: FIXTURE_IDS.CUST_SUR_LOYAL_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_SUR_ID,
      pass_type: 'apple',
      pass_serial_number: 'PASS-SUR-002',
      push_token: 'apns-token-elena-001',
      authentication_token: `${wsSecret}_PASS-SUR-002`,
      current_stamps: 4,
      total_visits: 4,
      total_rewards_redeemed: 0,
      last_visit_at: isoOffset(-48 * HOUR),
      last_push_title: null,
      last_push_message: null,
      google_push_count_24h: 0,
      google_push_window_start: null,
      status: 'active',
      created_at: isoOffset(-30 * DAY),
      updated_at: isoOffset(-48 * HOUR),
    },
  ];

  const apple_device_registrations = [
    {
      id: FIXTURE_IDS.APPLE_REG_VALENTINA_ID,
      device_library_identifier: 'dev-iphone-valentina-001',
      push_token: 'apns-token-valentina-001',
      pass_type_identifier: E2E_ENV_DEFAULTS.APPLE_PASS_TYPE_ID,
      serial_number: 'PASS-CANELO-002',
      created_at: isoOffset(-40 * DAY),
    },
    {
      id: FIXTURE_IDS.APPLE_REG_ELENA_ID,
      device_library_identifier: 'dev-iphone-elena-001',
      push_token: 'apns-token-elena-001',
      pass_type_identifier: E2E_ENV_DEFAULTS.APPLE_PASS_TYPE_ID,
      serial_number: 'PASS-SUR-002',
      created_at: isoOffset(-28 * DAY),
    },
  ];

  const transactions = [
    {
      id: FIXTURE_IDS.TX_CANELO_001_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      location_id: FIXTURE_IDS.LOC_CANELO_ID,
      employee_id: FIXTURE_IDS.EMP_CANELO_CASHIER_ID,
      customer_id: FIXTURE_IDS.CUST_CANELO_CHAMPION_ID,
      pass_id: FIXTURE_IDS.PASS_CANELO_001_ID,
      ticket_number: 'FAC-1001',
      amount: 24500,
      stamps_awarded: 1,
      balance_after: 8,
      client_latitude: 4.6682,
      client_longitude: -74.0538,
      discount_applied_percent: null,
      original_amount: 24500,
      created_at: isoOffset(-48 * HOUR),
    },
    {
      id: FIXTURE_IDS.TX_CANELO_002_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      location_id: FIXTURE_IDS.LOC_CANELO_ID,
      employee_id: FIXTURE_IDS.EMP_CANELO_CASHIER_ID,
      customer_id: FIXTURE_IDS.CUST_CANELO_APPLE_ID,
      pass_id: FIXTURE_IDS.PASS_CANELO_002_ID,
      ticket_number: 'FAC-1002',
      amount: 18000,
      stamps_awarded: 1,
      balance_after: 9,
      client_latitude: 4.6682,
      client_longitude: -74.0538,
      discount_applied_percent: null,
      original_amount: 18000,
      created_at: isoOffset(-72 * HOUR),
    },
    {
      id: FIXTURE_IDS.TX_CANELO_RECENT_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      location_id: FIXTURE_IDS.LOC_CANELO_ID,
      employee_id: FIXTURE_IDS.EMP_CANELO_CASHIER_ID,
      customer_id: FIXTURE_IDS.CUST_CANELO_COOLDOWN_ID,
      pass_id: FIXTURE_IDS.PASS_CANELO_004_ID,
      ticket_number: 'FAC-RECENT',
      amount: 14000,
      stamps_awarded: 1,
      balance_after: 2,
      client_latitude: 4.6682,
      client_longitude: -74.0538,
      discount_applied_percent: null,
      original_amount: 14000,
      created_at: isoOffset(-30 * MIN),
    },
    {
      id: FIXTURE_IDS.TX_SUR_001_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_SUR_ID,
      location_id: FIXTURE_IDS.LOC_SUR_ID,
      employee_id: FIXTURE_IDS.EMP_SUR_CASHIER_ID,
      customer_id: FIXTURE_IDS.CUST_SUR_LOYAL_ID,
      pass_id: FIXTURE_IDS.PASS_SUR_001_ID,
      ticket_number: 'SUR-1001',
      amount: 16500,
      stamps_awarded: 1,
      balance_after: 4,
      client_latitude: 6.2088,
      client_longitude: -75.567,
      discount_applied_percent: null,
      original_amount: 16500,
      created_at: isoOffset(-48 * HOUR),
    },
  ];

  // UTC boundary seed: 23:30 -05:00 (= 04:30Z next day in UTC)
  const localLateDate = new Date(nowMs + 1 * DAY);
  const yyyy = localLateDate.getUTCFullYear();
  const mm = String(localLateDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(localLateDate.getUTCDate()).padStart(2, '0');
  const boundaryDateTimeIso = new Date(`${yyyy}-${mm}-${dd}T23:30:00-05:00`).toISOString();

  const reservations = [
    {
      id: FIXTURE_IDS.RES_CANELO_001_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      customer_id: FIXTURE_IDS.CUST_CANELO_CHAMPION_ID,
      location_id: FIXTURE_IDS.LOC_CANELO_ID,
      date_time: boundaryDateTimeIso,
      guests_count: 3,
      status: 'confirmed',
      notes: 'Mesa junto a la barra de métodos',
      created_at: isoOffset(-2 * DAY),
      updated_at: isoOffset(-2 * DAY),
    },
    {
      id: FIXTURE_IDS.RES_SUR_001_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_SUR_ID,
      customer_id: FIXTURE_IDS.CUST_SUR_LOYAL_ID,
      location_id: FIXTURE_IDS.LOC_SUR_ID,
      date_time: isoOffset(48 * HOUR),
      guests_count: 2,
      status: 'confirmed',
      notes: 'Cata de orígenes',
      created_at: isoOffset(-1 * DAY),
      updated_at: isoOffset(-1 * DAY),
    },
  ];

  const fraud_alerts = [
    {
      id: FIXTURE_IDS.FA_CANELO_001_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      employee_id: FIXTURE_IDS.EMP_CANELO_CASHIER_ID,
      customer_id: FIXTURE_IDS.CUST_CANELO_COOLDOWN_ID,
      alert_type: 'cooldown_violation',
      severity: 'medium',
      details: { ticket_number: 'FAC-OLD-DUP', required_cooldown_hours: 3 },
      is_resolved: false,
      created_at: isoOffset(-12 * HOUR),
    },
    {
      id: FIXTURE_IDS.FA_SUR_001_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_SUR_ID,
      employee_id: FIXTURE_IDS.EMP_SUR_CASHIER_ID,
      customer_id: FIXTURE_IDS.CUST_SUR_LOYAL_ID,
      alert_type: 'ticket_reused',
      severity: 'high',
      details: { ticket_number: 'SUR-0999' },
      is_resolved: false,
      created_at: isoOffset(-24 * HOUR),
    },
  ];

  const reviews_feedback = [
    {
      id: FIXTURE_IDS.REV_CANELO_001_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_CANELO_ID,
      customer_id: FIXTURE_IDS.CUST_CANELO_CHAMPION_ID,
      transaction_id: FIXTURE_IDS.TX_CANELO_001_ID,
      rating: 5,
      comments: 'Excelente flat white y atención rápida',
      is_public_redirect: true,
      manager_contacted: false,
      created_at: isoOffset(-47 * HOUR),
    },
    {
      id: FIXTURE_IDS.REV_SUR_001_ID,
      merchant_id: FIXTURE_IDS.MERCHANT_SUR_ID,
      customer_id: FIXTURE_IDS.CUST_SUR_LOYAL_ID,
      transaction_id: FIXTURE_IDS.TX_SUR_001_ID,
      rating: 2,
      comments: 'Demora en entrega del V60',
      is_public_redirect: false,
      manager_contacted: false,
      created_at: isoOffset(-46 * HOUR),
    },
  ];

  return {
    merchants,
    locations,
    employees,
    customers,
    wallet_passes,
    apple_device_registrations,
    transactions,
    redemptions: [],
    reviews_feedback,
    reservations,
    fraud_alerts,
  };
}
