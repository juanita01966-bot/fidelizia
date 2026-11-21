import crypto from 'node:crypto';
import fs from 'node:fs';
import http2 from 'node:http2';
import path from 'node:path';
import { PKPass } from 'passkit-generator';
import { appleDeviceRepo, passRepo } from '@/lib/repositories';
import type { SupabaseAdminClient } from '@/lib/supabase/server';
import type { Customer, Location, Merchant, WalletPass } from '@/types/domain';

const DEFAULT_APNS_HOST = 'https://api.push.apple.com';

export interface AppleCertificates {
  wwdr: Buffer;
  signerCert: Buffer;
  signerKey: Buffer;
  signerKeyPassphrase?: string;
}

export interface ApplePushResult {
  success: boolean;
  simulated?: boolean;
  status?: number;
  apnsId?: string;
  reason?: string;
  unregistered?: boolean;
  error?: string;
}

export function getApplePassTypeId(): string {
  return (process.env.APPLE_PASS_TYPE_ID || 'pass.com.dynamind.canelo').trim();
}

export function getAppleTeamId(): string {
  return (process.env.APPLE_TEAM_ID || 'DYNAMIND20').trim();
}

export function getAppleWebServiceUrl(): string | undefined {
  const override = process.env.APPLE_WEB_SERVICE_URL?.trim();
  if (override) {
    return override.replace(/\/+$/, '');
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) return undefined;
  return `${appUrl.replace(/\/+$/, '')}/api/v1/apple`;
}

export function getAppleCertificates(): AppleCertificates {
  const wwdrBase64 = (process.env.APPLE_WWDR_CERT_BASE64 || '').trim();
  const signerCertBase64 = (process.env.APPLE_SIGNER_CERT_BASE64 || '').trim();
  const signerKeyBase64 = (process.env.APPLE_SIGNER_KEY_BASE64 || '').trim();

  const decodePem = (b64: string): Buffer => {
    if (!b64) return Buffer.alloc(0);
    // Support raw PEM passed directly or Base64-encoded PEM
    if (b64.includes('-----BEGIN ')) {
      return Buffer.from(b64.replace(/\\n/g, '\n'), 'utf8');
    }
    return Buffer.from(b64, 'base64');
  };

  return {
    wwdr: decodePem(wwdrBase64),
    signerCert: decodePem(signerCertBase64),
    signerKey: decodePem(signerKeyBase64),
    signerKeyPassphrase: process.env.APPLE_CERT_PASSWORD || undefined,
  };
}

export function isAppleWalletConfigured(): boolean {
  const certs = getAppleCertificates();
  return (
    certs.wwdr.length > 50 &&
    certs.signerCert.length > 50 &&
    certs.signerKey.length > 50 &&
    Boolean(getApplePassTypeId()) &&
    Boolean(getAppleTeamId())
  );
}

export function getAppleWalletDiagnostics() {
  const certs = getAppleCertificates();
  const webServiceURL = getAppleWebServiceUrl() || '';
  const isHttpsWebService = webServiceURL.startsWith('https://');
  return {
    configured: isAppleWalletConfigured(),
    hasPassTypeId: Boolean(process.env.APPLE_PASS_TYPE_ID?.trim()),
    hasTeamId: Boolean(process.env.APPLE_TEAM_ID?.trim()),
    hasWwdrCert: certs.wwdr.length > 50,
    hasSignerCert: certs.signerCert.length > 50,
    hasSignerKey: certs.signerKey.length > 50,
    hasWebServiceUrl: Boolean(webServiceURL),
    isHttpsWebService,
  };
}

/**
 * Verificación en tiempo constante para cabecera `Authorization: ApplePass <authenticationToken>`.
 */
export function verifyAppleAuthHeader(
  authHeader: string | null | undefined,
  expectedToken: string | null | undefined
): boolean {
  if (!authHeader || !expectedToken) return false;
  const match = /^ApplePass\s+(.+)$/i.exec(authHeader.trim());
  if (!match) return false;

  const provided = match[1].trim();
  const expected = expectedToken.trim();
  if (!provided || !expected) return false;

  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

function hexToPassKitRgb(hex: string | null | undefined, fallback: string): string {
  if (!hex) return fallback;
  const clean = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return fallback;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Ensambla y firma el paquete binario .pkpass usando datos multi-tenant reales y changeMessage dinámico.
 */
export async function generateApplePassBuffer(
  customer: Customer,
  pass: WalletPass,
  merchant: Merchant,
  locations: Location[] = [],
  customAlertMessage?: string
): Promise<Buffer> {
  const certs = getAppleCertificates();
  if (certs.wwdr.length < 50 || certs.signerCert.length < 50 || certs.signerKey.length < 50) {
    throw new Error(
      'Certificados de Apple Wallet no configurados (APPLE_WWDR_CERT_BASE64, APPLE_SIGNER_CERT_BASE64, APPLE_SIGNER_KEY_BASE64).'
    );
  }

  const modelDir = path.join(process.cwd(), 'public', 'wallet-templates', 'canelo.pass');
  const readAsset = (filename: string, fallbackBuf?: Buffer): Buffer => {
    const filePath = path.join(modelDir, filename);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }
    return fallbackBuf ?? Buffer.alloc(0);
  };

  const iconBuffer = readAsset('icon.png');
  const icon2xBuffer = readAsset('icon@2x.png', iconBuffer);
  const logoBuffer = readAsset('logo.png', iconBuffer);
  const logo2xBuffer = readAsset('logo@2x.png', logoBuffer);

  const webServiceURL = getAppleWebServiceUrl();
  const stampsNeeded = Math.max(1, merchant.stamps_needed || 10);
  const rewardLabel = customer.custom_reward || merchant.reward_description || 'Premio de Autor';
  const primaryLoc = locations.find((l) => l.is_active) || locations[0];
  const bgColor = hexToPassKitRgb(merchant.card_gradient?.from || merchant.brand_color, 'rgb(20, 15, 12)');
  const labelColor = hexToPassKitRgb(merchant.secondary_color, 'rgb(212, 163, 115)');

  const passOverrides: Record<string, unknown> = {
    formatVersion: 1,
    passTypeIdentifier: getApplePassTypeId(),
    teamIdentifier: getAppleTeamId(),
    organizationName: merchant.name,
    description: `Tarjeta de Fidelidad · ${merchant.name}`,
    serialNumber: pass.pass_serial_number,
    backgroundColor: bgColor,
    foregroundColor: 'rgb(255, 255, 255)',
    labelColor,
    logoText: merchant.name,
    authenticationToken: pass.authentication_token,
  };

  if (webServiceURL) {
    passOverrides.webServiceURL = webServiceURL;
  }

  const pkPass = new PKPass(
    {
      'icon.png': iconBuffer,
      'icon@2x.png': icon2xBuffer,
      'logo.png': logoBuffer,
      'logo@2x.png': logo2xBuffer,
    },
    certs,
    passOverrides as ConstructorParameters<typeof PKPass>[2]
  );

  pkPass.type = 'storeCard';

  const stampsChangeMsg =
    pass.current_stamps >= stampsNeeded
      ? `🎉 ¡Completaste tus sellos (%@) en ${merchant.name}! Reclama: ${rewardLabel}`
      : `☕ ¡Tu tarjeta ${merchant.name} se actualizó a %@ sellos!`;

  pkPass.primaryFields.push({
    key: 'stamps',
    label: 'SELLOS ACUMULADOS',
    value: `${pass.current_stamps} / ${stampsNeeded}`,
    changeMessage: stampsChangeMsg,
  });

  pkPass.secondaryFields.push(
    {
      key: 'customer',
      label: 'CLIENTE',
      value: customer.full_name,
    },
    {
      key: 'tier',
      label: 'NIVEL',
      value: (customer.loyalty_tier || 'bronze').toUpperCase(),
    }
  );

  const latestPromoText =
    customAlertMessage?.trim() ||
    (pass.last_push_message
      ? `${pass.last_push_title ? `${pass.last_push_title}: ` : ''}${pass.last_push_message}`
      : 'Sin avisos recientes');

  pkPass.backFields.push(
    {
      key: 'latest_update',
      label: pass.last_push_title || 'ÚLTIMA NOVEDAD',
      value: latestPromoText,
      changeMessage: '%@',
    },
    {
      key: 'terms',
      label: 'Beneficio de Fidelidad',
      value: `Acumula ${stampsNeeded} sellos${primaryLoc ? ` en ${primaryLoc.address}` : ''} y reclama: ${rewardLabel}.`,
    }
  );

  pkPass.setBarcodes({
    format: 'PKBarcodeFormatQR',
    message: pass.pass_serial_number,
    messageEncoding: 'iso-8859-1',
    altText: pass.pass_serial_number,
  });

  const activeLocations = locations
    .filter((l) => l.is_active && Number.isFinite(l.latitude) && Number.isFinite(l.longitude))
    .slice(0, 10)
    .map((l) => ({
      latitude: l.latitude,
      longitude: l.longitude,
      relevantText: l.relevant_text || `¡Estás en ${merchant.name}! Presenta tu tarjeta para acumular sellos.`,
    }));

  if (activeLocations.length > 0) {
    pkPass.setLocations(...activeLocations);
  }

  return pkPass.getAsBuffer();
}

/**
 * Envía un push vacío "{}" vía HTTP/2 a APNs de producción (api.push.apple.com) con timeout,
 * lectura obligatoria de `:status` y cierre garantizado de sesión para evitar fugas.
 */
export async function sendApplePushNotification(
  pushToken: string,
  options?: { apnsHost?: string; timeoutMs?: number }
): Promise<ApplePushResult> {
  const cleanToken = pushToken.trim();
  if (!cleanToken) {
    return { success: false, error: 'Push token vacío' };
  }

  const certs = getAppleCertificates();
  if (!certs.signerCert || certs.signerCert.length < 50 || !certs.signerKey || certs.signerKey.length < 50) {
    return {
      success: false,
      simulated: true,
      error: 'Certificados de Apple APNs no configurados en el servidor.',
    };
  }

  const apnsHost = (options?.apnsHost || process.env.APPLE_APNS_HOST || DEFAULT_APNS_HOST).trim();
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const passTypeId = getApplePassTypeId();

  return new Promise((resolve) => {
    let settled = false;
    let client: http2.ClientHttp2Session | null = null;
    let req: http2.ClientHttp2Stream | null = null;
    let timeoutHandle: NodeJS.Timeout | null = null;

    const finish = (result: ApplePushResult) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      if (req && !req.destroyed) {
        try {
          req.close();
        } catch {
          // ignore cleanup failure
        }
      }
      if (client && !client.destroyed) {
        try {
          client.close();
        } catch {
          // ignore
        }
        try {
          if (!client.closed) client.destroy();
        } catch {
          // ignore
        }
      }
      resolve(result);
    };

    timeoutHandle = setTimeout(() => {
      finish({
        success: false,
        status: 504,
        error: `Timeout (${timeoutMs}ms) conectando con Apple APNs`,
      });
    }, timeoutMs);

    try {
      client = http2.connect(apnsHost, {
        cert: certs.signerCert,
        key: certs.signerKey,
        passphrase: certs.signerKeyPassphrase,
      });

      client.on('error', (err) => {
        finish({
          success: false,
          error: `Error de conexión HTTP/2 APNs: ${err.message}`,
        });
      });

      req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${encodeURIComponent(cleanToken)}`,
        'apns-topic': passTypeId,
        'apns-push-type': 'background',
        'apns-priority': '5',
      });

      let statusCode = 0;
      let apnsId: string | undefined;
      let responseBody = '';

      req.on('response', (headers) => {
        const rawStatus = headers[':status'];
        statusCode = typeof rawStatus === 'number' ? rawStatus : Number(rawStatus || 0);
        const rawApnsId = headers['apns-id'];
        apnsId = typeof rawApnsId === 'string' ? rawApnsId : undefined;
      });

      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        responseBody += chunk;
      });

      req.on('error', (err) => {
        finish({
          success: false,
          status: statusCode || undefined,
          error: `Error en stream APNs: ${err.message}`,
        });
      });

      req.on('end', () => {
        let reason: string | undefined;
        if (responseBody) {
          try {
            const parsed = JSON.parse(responseBody) as { reason?: string };
            reason = parsed.reason;
          } catch {
            reason = responseBody;
          }
        }

        if (statusCode >= 200 && statusCode < 300) {
          finish({
            success: true,
            status: statusCode,
            apnsId,
          });
          return;
        }

        finish({
          success: false,
          status: statusCode || 500,
          apnsId,
          reason,
          unregistered: statusCode === 410,
          error: reason
            ? `APNs rechazó el push (${statusCode}): ${reason}`
            : `APNs respondió con estado HTTP ${statusCode || 'desconocido'}`,
        });
      });

      req.write(JSON.stringify({}));
      req.end();
    } catch (err) {
      finish({
        success: false,
        error: err instanceof Error ? err.message : 'Fallo inesperado enviando push APNs',
      });
    }
  });
}

/**
 * Orquesta la actualización de un pase Apple Wallet:
 * 1) Persiste alerta opcional (title/message/updated_at) en `wallet_passes` para `changeMessage`.
 * 2) Envía APNs a todos los dispositivos registrados en `apple_device_registrations`.
 * 3) Purga tokens vencidos con estado 410 Unregistered.
 */
export async function triggerApplePassUpdate(
  supabase: SupabaseAdminClient,
  merchantId: string,
  pass: WalletPass,
  alert?: { title: string; message: string; incrementQuota?: boolean }
): Promise<{
  success: boolean;
  sentCount: number;
  failedCount: number;
  cleanedTokens: number;
  errors: string[];
}> {
  if (alert) {
    await passRepo.recordPushNotification(
      supabase,
      merchantId,
      [pass.id],
      alert.title,
      alert.message,
      Boolean(alert.incrementQuota)
    );
  }

  const registeredTokens = await appleDeviceRepo.getPushTokensBySerial(supabase, pass.pass_serial_number);
  const allTokens = [...registeredTokens];
  if (pass.push_token && !allTokens.includes(pass.push_token)) {
    allTokens.push(pass.push_token);
  }

  if (allTokens.length === 0) {
    return {
      success: false,
      sentCount: 0,
      failedCount: 0,
      cleanedTokens: 0,
      errors: [`El pase Apple (${pass.pass_serial_number}) no tiene dispositivos registrados.`],
    };
  }

  let sentCount = 0;
  let failedCount = 0;
  const deadTokens: string[] = [];
  const errors: string[] = [];

  for (const token of allTokens) {
    const result = await sendApplePushNotification(token);
    if (result.success) {
      sentCount += 1;
    } else {
      failedCount += 1;
      if (result.error) errors.push(result.error);
      if (result.unregistered) {
        deadTokens.push(token);
      }
    }
  }

  if (deadTokens.length > 0) {
    await appleDeviceRepo.deleteByPushTokens(supabase, deadTokens);
    if (pass.push_token && deadTokens.includes(pass.push_token)) {
      await supabase
        .from('wallet_passes')
        .update({ push_token: null, updated_at: new Date().toISOString() })
        .eq('id', pass.id)
        .eq('merchant_id', merchantId);
    }
  }

  return {
    success: sentCount > 0,
    sentCount,
    failedCount,
    cleanedTokens: deadTokens.length,
    errors,
  };
}
