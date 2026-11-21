import { GoogleAuth } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import type { Customer, Location, Merchant, WalletPass } from '@/types/domain';

const WALLETOBJECTS_BASE = 'https://walletobjects.googleapis.com/walletobjects/v1';
const GOOGLE_PUSH_24H_LIMIT = 3;

export const DEFAULT_HERO_IMAGE_URL =
  process.env.NEXT_PUBLIC_WALLET_HERO_IMAGE ||
  'https://tmsdbjrzaggegfxkxfqz.supabase.co/storage/v1/object/public/wallet-assets/hero_card_canelo.png';

export const DEFAULT_PROGRAM_LOGO_URL =
  process.env.NEXT_PUBLIC_LOGO_URL ||
  'https://tmsdbjrzaggegfxkxfqz.supabase.co/storage/v1/object/public/wallet-assets/logo_canelo.png';

export const DEFAULT_WALLET_HEX_BG = '#1c1007';

export interface GoogleWalletResult {
  success: boolean;
  simulated?: boolean;
  status?: number;
  notSavedYet?: boolean;
  quotaFallback?: boolean;
  incrementedQuota?: boolean;
  warning?: string;
  error?: string;
}

export function getGoogleIssuerId(): string {
  return (process.env.GOOGLE_ISSUER_ID || '').trim();
}

export function getGoogleServiceAccountEmail(): string {
  return (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
}

export function getGooglePrivateKey(): string {
  const raw = process.env.GOOGLE_PRIVATE_KEY || '';
  if (!raw) return '';
  let cleaned = raw.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned.replace(/\\n/g, '\n');
}

export function isGoogleWalletConfigured(): boolean {
  const issuerId = getGoogleIssuerId();
  const email = getGoogleServiceAccountEmail();
  const pk = getGooglePrivateKey();
  return Boolean(
    issuerId &&
      email &&
      pk.length > 50 &&
      pk.includes('BEGIN PRIVATE KEY') &&
      pk.includes('END PRIVATE KEY')
  );
}

export function getGoogleWalletDiagnostics() {
  const issuerId = getGoogleIssuerId();
  const email = getGoogleServiceAccountEmail();
  const pk = getGooglePrivateKey();
  const hasPrivateKey = Boolean(pk && pk.length > 50);
  const privateKeyValidFormat =
    pk.includes('-----BEGIN PRIVATE KEY-----') && pk.includes('-----END PRIVATE KEY-----');

  return {
    configured: Boolean(issuerId && email && hasPrivateKey && privateKeyValidFormat),
    hasIssuerId: Boolean(issuerId),
    hasServiceAccountEmail: Boolean(email),
    hasPrivateKey,
    privateKeyValidFormat,
  };
}

export function getGoogleClassId(merchantSlug: string): string {
  const issuerId = getGoogleIssuerId();
  if (!issuerId) {
    throw new Error('GOOGLE_ISSUER_ID no está configurado en el servidor.');
  }
  const cleanSlug = merchantSlug.trim().toLowerCase();
  if (!cleanSlug || cleanSlug === 'cafe-canelo') {
    return `${issuerId}.canelo_loyalty_v1`;
  }
  const safeSuffix = cleanSlug.replace(/[^a-z0-9_]/g, '_');
  return `${issuerId}.${safeSuffix}_loyalty_v1`;
}

export function getGoogleObjectId(serialNumber: string): string {
  const issuerId = getGoogleIssuerId();
  if (!issuerId) {
    throw new Error('GOOGLE_ISSUER_ID no está configurado en el servidor.');
  }
  return `${issuerId}.${serialNumber.trim()}`;
}

let cachedAuth: GoogleAuth | null = null;
let cachedAuthKeyFingerprint = '';

function getGoogleAuth(): GoogleAuth {
  const email = getGoogleServiceAccountEmail();
  const pk = getGooglePrivateKey();
  const fingerprint = `${email}:${pk.slice(0, 32)}:${pk.length}`;

  if (!cachedAuth || cachedAuthKeyFingerprint !== fingerprint) {
    cachedAuth = new GoogleAuth({
      credentials: {
        client_email: email,
        private_key: pk,
      },
      scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
    });
    cachedAuthKeyFingerprint = fingerprint;
  }

  return cachedAuth;
}

export function resetGoogleAuthForTests(): void {
  cachedAuth = null;
  cachedAuthKeyFingerprint = '';
}

function buildAllowedOrigins(requestOrigin?: string): string[] {
  const candidates = [process.env.NEXT_PUBLIC_APP_URL, requestOrigin];
  const validOrigins: string[] = [];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate.trim());
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        validOrigins.push(url.origin);
      }
    } catch {
      // Ignore malformed origin values
    }
  }

  return Array.from(new Set(validOrigins));
}

function resolveMerchantColors(merchant: Merchant): string {
  return merchant.card_gradient?.from || merchant.brand_color || DEFAULT_WALLET_HEX_BG;
}

function resolveProgramLogoUrl(merchant: Merchant): string {
  if (merchant.logo_url && /^https?:\/\/.+/.test(merchant.logo_url)) {
    return merchant.logo_url;
  }
  return DEFAULT_PROGRAM_LOGO_URL;
}

function mapLocationsPayload(locations: Location[]) {
  return locations
    .filter((l) => l.is_active && Number.isFinite(l.latitude) && Number.isFinite(l.longitude))
    .map((l) => ({
      latitude: l.latitude,
      longitude: l.longitude,
    }));
}

function buildLoyaltyClassPayload(merchant: Merchant, locations: Location[], includeReviewStatus: boolean) {
  const classId = getGoogleClassId(merchant.slug);
  const hexBg = resolveMerchantColors(merchant);
  const logoUrl = resolveProgramLogoUrl(merchant);
  const mappedLocations = mapLocationsPayload(locations);

  const payload: Record<string, unknown> = {
    id: classId,
    issuerName: merchant.name,
    programName: `${merchant.name} · Club VIP`,
    programLogo: {
      sourceUri: { uri: logoUrl },
      contentDescription: {
        defaultValue: { language: 'es-CO', value: `${merchant.name} Logo` },
      },
    },
    heroImage: {
      sourceUri: { uri: DEFAULT_HERO_IMAGE_URL },
      contentDescription: {
        defaultValue: { language: 'es-CO', value: `${merchant.name} Tarjeta Oficial` },
      },
    },
    hexBackgroundColor: hexBg,
    ...(mappedLocations.length > 0 ? { locations: mappedLocations } : {}),
  };

  if (includeReviewStatus) {
    payload.reviewStatus = 'UNDER_REVIEW';
  }

  return payload;
}

function buildPointsFields(pass: WalletPass, merchant: Merchant, customer?: Customer) {
  const totalStamps = Math.max(1, merchant.stamps_needed || 10);
  const currentStamps = Math.max(0, pass.current_stamps || 0);
  const isRewardReady = currentStamps >= totalStamps;
  const filledIcons = '⭐'.repeat(Math.min(currentStamps, totalStamps));
  const emptyIcons = '⚪'.repeat(Math.max(0, totalStamps - currentStamps));
  const stampsVisual = `${filledIcons}${emptyIcons}`;
  const rewardLabel = customer?.custom_reward || merchant.reward_description || 'Premio de Autor';

  return {
    totalStamps,
    currentStamps,
    isRewardReady,
    loyaltyPoints: {
      label: isRewardReady ? '🎉 ¡PREMIO DESBLOQUEADO!' : `Progreso de Sellos (${currentStamps}/${totalStamps})`,
      balance: {
        string: isRewardReady
          ? `🏆 ${currentStamps}/${totalStamps} SELLOS COMPLETOS`
          : `${stampsVisual} (${currentStamps}/${totalStamps})`,
      },
    },
    secondaryLoyaltyPoints: {
      label: isRewardReady ? 'Premio en Caja' : 'Meta de Recompensa',
      balance: {
        string: isRewardReady
          ? rewardLabel
          : `${Math.max(0, totalStamps - currentStamps)} sellos restantes para: ${rewardLabel}`,
      },
    },
  };
}

function extractGoogleError(err: unknown): { status?: number; message: string; isQuotaError: boolean } {
  const errObj = err as {
    response?: { status?: number; data?: { error?: { message?: string; status?: string } } };
    message?: string;
  };
  const status = errObj?.response?.status;
  const apiMessage = errObj?.response?.data?.error?.message || errObj?.message || 'Error desconocido de Google Wallet';
  const apiStatus = errObj?.response?.data?.error?.status || '';
  const isQuotaError =
    status === 429 ||
    apiStatus === 'RESOURCE_EXHAUSTED' ||
    /quota|rate limit|notification limit|too many/i.test(apiMessage);
  return { status, message: apiMessage, isQuotaError };
}

/**
 * Garantiza que exista la LoyaltyClass en Google Wallet.
 * En creación usa reviewStatus='UNDER_REVIEW'; en actualización (PATCH) NUNCA sobreescribe reviewStatus.
 */
export async function ensureGoogleLoyaltyClass(
  merchant: Merchant,
  locations: Location[] = []
): Promise<GoogleWalletResult> {
  if (!isGoogleWalletConfigured()) {
    return {
      success: false,
      simulated: true,
      error: 'Credenciales de Google Wallet no configuradas.',
    };
  }

  const classId = getGoogleClassId(merchant.slug);
  const classUrl = `${WALLETOBJECTS_BASE}/loyaltyClass/${encodeURIComponent(classId)}`;
  const auth = getGoogleAuth();
  const client = await auth.getClient();

  try {
    await client.request({ url: classUrl, method: 'GET' });
    const updateMask = [
      'heroImage',
      'hexBackgroundColor',
      'programLogo',
      'issuerName',
      'programName',
      ...(locations.length > 0 ? ['locations'] : []),
    ].join(',');
    const patchPayload = buildLoyaltyClassPayload(merchant, locations, false);
    await client.request({
      url: `${classUrl}?updateMask=${updateMask}`,
      method: 'PATCH',
      data: patchPayload,
    });
    return { success: true, status: 200 };
  } catch (err: unknown) {
    const parsed = extractGoogleError(err);
    if (parsed.status === 404) {
      const createPayload = buildLoyaltyClassPayload(merchant, locations, true);
      await client.request({
        url: `${WALLETOBJECTS_BASE}/loyaltyClass`,
        method: 'POST',
        data: createPayload,
      });
      return { success: true, status: 200 };
    }
    return { success: false, status: parsed.status, error: parsed.message };
  }
}

/**
 * Actualiza el diseño visual de la clase en caliente sin alterar reviewStatus.
 */
export async function updateGoogleLoyaltyClassDesign(
  merchant: Merchant,
  locations: Location[] = [],
  options?: {
    hexBackgroundColor?: string;
    issuerName?: string;
    programName?: string;
    heroImageUrl?: string;
  }
): Promise<GoogleWalletResult & { hexBackgroundColor?: string }> {
  const hexBg = options?.hexBackgroundColor || resolveMerchantColors(merchant);
  if (!isGoogleWalletConfigured()) {
    return {
      success: false,
      simulated: true,
      hexBackgroundColor: hexBg,
      error: 'Credenciales de Google Wallet no configuradas.',
    };
  }

  const classId = getGoogleClassId(merchant.slug);
  const classUrl = `${WALLETOBJECTS_BASE}/loyaltyClass/${encodeURIComponent(classId)}`;
  const auth = getGoogleAuth();
  const client = await auth.getClient();

  const issuerName = options?.issuerName || merchant.name;
  const programName = options?.programName || `${merchant.name} · Club VIP`;
  const heroImageUrl = options?.heroImageUrl || DEFAULT_HERO_IMAGE_URL;

  const patchPayload = {
    hexBackgroundColor: hexBg,
    issuerName,
    programName,
    programLogo: {
      sourceUri: { uri: resolveProgramLogoUrl(merchant) },
      contentDescription: {
        defaultValue: { language: 'es-CO', value: `${issuerName} Logo` },
      },
    },
    heroImage: {
      sourceUri: { uri: heroImageUrl },
      contentDescription: {
        defaultValue: { language: 'es-CO', value: `${issuerName} Tarjeta Oficial` },
      },
    },
  };

  try {
    await client.request({
      url: `${classUrl}?updateMask=hexBackgroundColor,issuerName,programName,programLogo,heroImage`,
      method: 'PATCH',
      data: patchPayload,
    });
    return { success: true, status: 200, hexBackgroundColor: hexBg };
  } catch (err: unknown) {
    const parsed = extractGoogleError(err);
    if (parsed.status === 404) {
      const ensured = await ensureGoogleLoyaltyClass(merchant, locations);
      return { ...ensured, hexBackgroundColor: hexBg };
    }
    return { success: false, status: parsed.status, error: parsed.message, hexBackgroundColor: hexBg };
  }
}

/**
 * Construye el LoyaltyObject + JWT RS256 firmado para "Add to Google Wallet".
 */
export async function generateGoogleWalletSaveUrl(
  customer: Customer,
  pass: WalletPass,
  merchant: Merchant,
  locations: Location[] = [],
  requestOrigin?: string
): Promise<string> {
  if (!isGoogleWalletConfigured()) {
    throw new Error(
      'Google Wallet no está configurado en el servidor (faltan GOOGLE_ISSUER_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_PRIVATE_KEY).'
    );
  }

  // Intentar asegurar la clase en Google API antes de emitir el JWT (sin bloquear si el mock/red responde luego)
  try {
    await ensureGoogleLoyaltyClass(merchant, locations);
  } catch (err) {
    console.warn('[Google Wallet] No se pudo pre-verificar LoyaltyClass:', err);
  }

  const classId = getGoogleClassId(merchant.slug);
  const objectId = getGoogleObjectId(pass.pass_serial_number);
  const points = buildPointsFields(pass, merchant, customer);
  const mappedLocations = mapLocationsPayload(locations);
  const primaryLoc = locations.find((l) => l.is_active) || locations[0];

  const textModules = [
    {
      id: 'sede_principal',
      header: primaryLoc ? primaryLoc.name : merchant.name,
      body: `${primaryLoc ? `${primaryLoc.address}. ` : ''}Meta: ${points.totalStamps} sellos para ${customer.custom_reward || merchant.reward_description}. Presenta este código en caja.`,
    },
  ];

  if (
    merchant.loyalty_program_mode === 'single_card' &&
    merchant.reward_milestones &&
    merchant.reward_milestones.length > 0
  ) {
    const milestonesText = merchant.reward_milestones
      .map((m) => `• Sello #${m.stamp_number}: ${m.reward}`)
      .join('\n');
    textModules.push({
      id: 'escalera_premios',
      header: '🎁 Escalera de Premios por Hitos',
      body: milestonesText,
    });
  }

  const loyaltyObject: Record<string, unknown> = {
    id: objectId,
    classId,
    state: pass.status === 'active' ? 'ACTIVE' : 'INACTIVE',
    accountId: pass.pass_serial_number,
    accountName: customer.full_name,
    heroImage: {
      sourceUri: { uri: DEFAULT_HERO_IMAGE_URL },
      contentDescription: {
        defaultValue: { language: 'es-CO', value: `${merchant.name} Tarjeta Oficial` },
      },
    },
    loyaltyPoints: points.loyaltyPoints,
    secondaryLoyaltyPoints: points.secondaryLoyaltyPoints,
    barcode: {
      type: 'QR_CODE',
      value: pass.pass_serial_number,
      alternateText: pass.pass_serial_number,
    },
    textModulesData: textModules,
    ...(mappedLocations.length > 0 ? { locations: mappedLocations } : {}),
  };

  const loyaltyClass = buildLoyaltyClassPayload(merchant, locations, true);
  const origins = buildAllowedOrigins(requestOrigin);

  const claims = {
    iss: getGoogleServiceAccountEmail(),
    aud: 'google',
    origins,
    typ: 'savetowallet',
    payload: {
      loyaltyClasses: [loyaltyClass],
      loyaltyObjects: [loyaltyObject],
    },
  };

  const token = jwt.sign(claims, getGooglePrivateKey(), { algorithm: 'RS256' });
  return `https://pay.google.com/gp/v/save/${token}`;
}

/**
 * Actualiza puntos/sellos en Google Wallet usando notifyPreference='NOTIFY_ON_UPDATE'
 * sin sobrescribir ni destruir el historial de mensajes del usuario.
 */
export async function syncGooglePassStamps(
  pass: WalletPass,
  merchant: Merchant,
  options?: { customer?: Customer; notify?: boolean }
): Promise<GoogleWalletResult> {
  if (!isGoogleWalletConfigured()) {
    return {
      success: false,
      simulated: true,
      error: 'Credenciales de Google Wallet no configuradas en el servidor.',
    };
  }

  const objectId = getGoogleObjectId(pass.pass_serial_number);
  const points = buildPointsFields(pass, merchant, options?.customer);
  const shouldNotify = options?.notify !== false;
  const url = `${WALLETOBJECTS_BASE}/loyaltyObject/${encodeURIComponent(objectId)}?updateMask=loyaltyPoints,secondaryLoyaltyPoints,heroImage,state`;

  const patchPayload: Record<string, unknown> = {
    state: pass.status === 'active' ? 'ACTIVE' : 'INACTIVE',
    heroImage: {
      sourceUri: { uri: DEFAULT_HERO_IMAGE_URL },
      contentDescription: {
        defaultValue: { language: 'es-CO', value: `${merchant.name} Tarjeta Oficial` },
      },
    },
    loyaltyPoints: points.loyaltyPoints,
    secondaryLoyaltyPoints: points.secondaryLoyaltyPoints,
    ...(shouldNotify ? { notifyPreference: 'NOTIFY_ON_UPDATE' } : {}),
  };

  try {
    const auth = getGoogleAuth();
    const client = await auth.getClient();
    await client.request({
      url,
      method: 'PATCH',
      data: patchPayload,
    });
    return { success: true, status: 200 };
  } catch (err: unknown) {
    const parsed = extractGoogleError(err);
    return {
      success: false,
      status: parsed.status,
      notSavedYet: parsed.status === 404,
      error:
        parsed.status === 404
          ? `El pase (${pass.pass_serial_number}) aún no ha sido guardado en Google Wallet del cliente.`
          : `Google Wallet API (${parsed.status || 'Error'}): ${parsed.message}`,
    };
  }
}

/**
 * Envía una notificación push nativa en pantalla de bloqueo de Google Wallet usando
 * el endpoint oficial POST /loyaltyObject/{id}/addMessage con TEXT_AND_NOTIFY.
 * Controla la cuota de 3 notificaciones push por cada 24 horas haciendo fallback seguro a TEXT.
 */
export async function sendGoogleWalletNotification(
  pass: WalletPass,
  merchant: Merchant,
  title: string,
  body: string,
  options?: { displayDurationHours?: number }
): Promise<GoogleWalletResult> {
  if (!isGoogleWalletConfigured()) {
    return {
      success: false,
      simulated: true,
      error: 'Credenciales de Google Wallet no configuradas en el servidor.',
    };
  }

  const objectId = getGoogleObjectId(pass.pass_serial_number);
  const addMessageUrl = `${WALLETOBJECTS_BASE}/loyaltyObject/${encodeURIComponent(objectId)}/addMessage`;

  const nowMs = Date.now();
  const durationHours = Math.max(1, Math.min(72, options?.displayDurationHours ?? 24));
  const startIso = new Date(nowMs).toISOString();
  const endIso = new Date(nowMs + durationHours * 60 * 60 * 1000).toISOString();

  const windowActive =
    Boolean(pass.push_window_reset_at) &&
    new Date(pass.push_window_reset_at as string).getTime() > nowMs;
  const quotaReached = windowActive && (pass.push_count_24h ?? 0) >= GOOGLE_PUSH_24H_LIMIT;

  const buildMessagePayload = (messageType: 'TEXT_AND_NOTIFY' | 'TEXT') => ({
    message: {
      id: `msg-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
      header: title.trim() || merchant.name,
      body: body.trim(),
      messageType,
      displayInterval: {
        start: { date: startIso },
        end: { date: endIso },
      },
    },
  });

  const auth = getGoogleAuth();
  const client = await auth.getClient();

  if (quotaReached) {
    try {
      await client.request({
        url: addMessageUrl,
        method: 'POST',
        data: buildMessagePayload('TEXT'),
      });
      return {
        success: true,
        status: 200,
        quotaFallback: true,
        incrementedQuota: false,
        warning: 'Cuota de 3 notificaciones push/24h alcanzada: mensaje guardado silenciosamente en el pase (TEXT).',
      };
    } catch (fallbackErr: unknown) {
      const parsed = extractGoogleError(fallbackErr);
      return {
        success: false,
        status: parsed.status,
        notSavedYet: parsed.status === 404,
        error: `Google Wallet API (${parsed.status || 'Error'}): ${parsed.message}`,
      };
    }
  }

  try {
    await client.request({
      url: addMessageUrl,
      method: 'POST',
      data: buildMessagePayload('TEXT_AND_NOTIFY'),
    });
    return {
      success: true,
      status: 200,
      quotaFallback: false,
      incrementedQuota: true,
    };
  } catch (err: unknown) {
    const parsed = extractGoogleError(err);
    if (parsed.isQuotaError) {
      try {
        await client.request({
          url: addMessageUrl,
          method: 'POST',
          data: buildMessagePayload('TEXT'),
        });
        return {
          success: true,
          status: 200,
          quotaFallback: true,
          incrementedQuota: false,
          warning: 'Límite 24h de Google Wallet alcanzado: mensaje agregado como TEXT silencioso.',
        };
      } catch (retryErr: unknown) {
        const retryParsed = extractGoogleError(retryErr);
        return {
          success: false,
          status: retryParsed.status,
          error: `Google Wallet API (${retryParsed.status || 'Error'}): ${retryParsed.message}`,
        };
      }
    }

    return {
      success: false,
      status: parsed.status,
      notSavedYet: parsed.status === 404,
      error:
        parsed.status === 404
          ? `El pase (${pass.pass_serial_number}) aún no ha sido guardado en Google Wallet del cliente.`
          : `Google Wallet API (${parsed.status || 'Error'}): ${parsed.message}`,
    };
  }
}
