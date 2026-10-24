// src/lib/wallet/apple-wallet-service.ts
import { PKPass } from 'passkit-generator';
import http2 from 'http2';
import path from 'path';
import fs from 'fs';
import { Customer, WalletPass } from '@/types/domain';

const PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_ID || 'pass.com.dynamind.canelo';
const TEAM_ID = process.env.APPLE_TEAM_ID || 'DYNAMIND2026';
const WEB_SERVICE_URL = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/v1/apple`;
const AUTH_TOKEN_SECRET = process.env.APPLE_WEB_SERVICE_SECRET || 'canelo_auth_secret_2026';

/**
 * Carga los certificados PEM desde variables Base64 en entorno serverless o archivos locales.
 */
function getAppleCertificates() {
  const wwdrBase64 = process.env.APPLE_WWDR_CERT_BASE64 || '';
  const signerCertBase64 = process.env.APPLE_SIGNER_CERT_BASE64 || '';
  const signerKeyBase64 = process.env.APPLE_SIGNER_KEY_BASE64 || '';

  const wwdr = wwdrBase64 ? Buffer.from(wwdrBase64, 'base64') : Buffer.from('');
  const signerCert = signerCertBase64 ? Buffer.from(signerCertBase64, 'base64') : Buffer.from('');
  const signerKey = signerKeyBase64 ? Buffer.from(signerKeyBase64, 'base64') : Buffer.from('');
  const signerKeyPassphrase = process.env.APPLE_CERT_PASSWORD || undefined;

  return { wwdr, signerCert, signerKey, signerKeyPassphrase };
}

/**
 * Ensambla y firma el paquete binario .pkpass al vuelo con geocerca GPS en Chapinero.
 */
export async function generateApplePassBuffer(
  customer: Customer,
  pass: WalletPass,
  customAlertMessage?: string
): Promise<Buffer> {
  const certs = getAppleCertificates();

  // Directorio local con icon.png, icon@2x.png, logo.png, logo@2x.png
  const modelDir = path.join(process.cwd(), 'public', 'wallet-templates', 'canelo.pass');

  // Lectura segura de assets
  const iconBuffer = fs.existsSync(path.join(modelDir, 'icon.png'))
    ? fs.readFileSync(path.join(modelDir, 'icon.png'))
    : Buffer.from('');
  const icon2xBuffer = fs.existsSync(path.join(modelDir, 'icon@2x.png'))
    ? fs.readFileSync(path.join(modelDir, 'icon@2x.png'))
    : iconBuffer;
  const logoBuffer = fs.existsSync(path.join(modelDir, 'logo.png'))
    ? fs.readFileSync(path.join(modelDir, 'logo.png'))
    : iconBuffer;
  const logo2xBuffer = fs.existsSync(path.join(modelDir, 'logo@2x.png'))
    ? fs.readFileSync(path.join(modelDir, 'logo@2x.png'))
    : logoBuffer;

  const pkPass = new PKPass(
    {
      'icon.png': iconBuffer,
      'icon@2x.png': icon2xBuffer,
      'logo.png': logoBuffer,
      'logo@2x.png': logo2xBuffer,
    },
    certs,
    {
      formatVersion: 1,
      passTypeIdentifier: PASS_TYPE_ID,
      teamIdentifier: TEAM_ID,
      organizationName: 'Café Canelo & Specialty Roasters',
      description: 'Tarjeta de Fidelidad Café Canelo',
      serialNumber: pass.pass_serial_number,
      backgroundColor: 'rgb(20, 15, 12)',
      foregroundColor: 'rgb(255, 255, 255)',
      labelColor: 'rgb(212, 163, 115)', // Tono Champaña
      logoText: 'Café Canelo',
      webServiceURL: WEB_SERVICE_URL,
      authenticationToken: `${AUTH_TOKEN_SECRET}_${pass.pass_serial_number}`,
    }
  );

  pkPass.type = 'storeCard';

  // Campos visibles de la tarjeta
  pkPass.primaryFields.push({
    key: 'stamps',
    label: 'SELLOS ACUMULADOS',
    value: `${pass.current_stamps} / 10`,
    // changeMessage dispara el banner en la pantalla de bloqueo de iOS cuando cambia el valor
    changeMessage: customAlertMessage || '¡Tu tarjeta Café Canelo se actualizó a %@ sellos!',
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

  pkPass.backFields.push(
    {
      key: 'terms',
      label: 'Beneficio de Fidelidad',
      value: 'Acumula 10 sellos en nuestra sede de Chapinero (Calle 85 # 11-53, Bogotá) y reclama 1 café de especialidad de cortesía.',
    }
  );

  // Código QR para escanear en /#/scan
  pkPass.setBarcodes({
    format: 'PKBarcodeFormatQR',
    message: pass.pass_serial_number,
    messageEncoding: 'iso-8859-1',
    altText: pass.pass_serial_number,
  });

  // Geocerca GPS (Calle 85 # 11-53, Chapinero, Bogotá - Radio nativo ~100m en storeCard)
  pkPass.setLocations({
    latitude: 4.6682,
    longitude: -74.0538,
    relevantText: '¡Estás en Café Canelo! Pasa por tu café y acumula sellos.',
  });

  return pkPass.getAsBuffer();
}

/**
 * Envía una notificación silenciosa por HTTP/2 a APNs para que el iPhone descargue el pase actualizado.
 */
export async function sendApplePushNotification(pushToken: string): Promise<void> {
  const certs = getAppleCertificates();

  if (!certs.signerCert || certs.signerCert.length < 50) {
    console.log(`[Apple Push Simulación]: Enviando push APNs silencioso al token: ${pushToken}`);
    return;
  }

  const apnsHost =
    process.env.NODE_ENV === 'production'
      ? 'https://api.push.apple.com'
      : 'https://api.sandbox.push.apple.com';

  return new Promise((resolve, reject) => {
    const client = http2.connect(apnsHost, {
      cert: certs.signerCert,
      key: certs.signerKey,
      passphrase: certs.signerKeyPassphrase,
    });

    client.on('error', (err) => {
      client.close();
      reject(err);
    });

    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${pushToken}`,
      'apns-topic': PASS_TYPE_ID,
      'apns-push-type': 'background',
      'apns-priority': '5',
    });

    req.setEncoding('utf8');
    let responseBody = '';

    req.on('data', (chunk) => {
      responseBody += chunk;
    });

    req.on('end', () => {
      client.close();
      resolve();
    });

    // Apple PassKit requiere un payload JSON vacío "{}"
    req.write(JSON.stringify({}));
    req.end();
  });
}
