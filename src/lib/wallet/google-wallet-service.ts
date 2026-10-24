// src/lib/wallet/google-wallet-service.ts
import { GoogleAuth } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { Customer, WalletPass } from '@/types/domain';
import { getStore } from '@/lib/store/fidelizia-store';

// Sanitización de variables de entorno para evitar inyecciones o lecturas rotas
const ISSUER_ID = process.env.GOOGLE_ISSUER_ID || '3388000000023227346';
const SERVICE_ACCOUNT_EMAIL = 
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 
  'fidelizia-359@dynamind-509920.iam.gserviceaccount.com';

export function getGooglePrivateKey(): string {
  const raw = process.env.GOOGLE_PRIVATE_KEY || '';
  if (!raw) return '';
  let cleaned = raw.trim();
  // Quitar comillas envolventes si Vercel o el usuario las pegaron
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned.replace(/\\n/g, '\n');
}

export function getGoogleWalletDiagnostics() {
  const pk = getGooglePrivateKey();
  return {
    issuerId: process.env.GOOGLE_ISSUER_ID || ISSUER_ID,
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || SERVICE_ACCOUNT_EMAIL,
    hasPrivateKey: Boolean(pk && pk.length > 50),
    privateKeyLength: pk.length,
    privateKeyValidFormat: pk.includes('-----BEGIN PRIVATE KEY-----') && pk.includes('-----END PRIVATE KEY-----'),
  };
}

const CLASS_SUFFIX = 'canelo_loyalty_v1';
const CLASS_ID = `${ISSUER_ID}.${CLASS_SUFFIX}`;

let cachedAuth: GoogleAuth | null = null;

function getGoogleAuth(): GoogleAuth {
  const pk = getGooglePrivateKey();
  if (!cachedAuth) {
    if (!pk || pk.length < 50) {
      console.warn('[Google Wallet] GOOGLE_PRIVATE_KEY no configurada. Las firmas locales operarán en modo degradado.');
    }
    cachedAuth = new GoogleAuth({
      credentials: {
        client_email: SERVICE_ACCOUNT_EMAIL,
        private_key: pk,
      },
      scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
    });
  }
  return cachedAuth;
}

export const DEFAULT_HERO_IMAGE_URL =
  process.env.NEXT_PUBLIC_WALLET_HERO_IMAGE ||
  'https://tmsdbjrzaggegfxkxfqz.supabase.co/storage/v1/object/public/wallet-assets/hero_card_canelo.png';

export const DEFAULT_PROGRAM_LOGO_URL =
  process.env.NEXT_PUBLIC_LOGO_URL ||
  'https://tmsdbjrzaggegfxkxfqz.supabase.co/storage/v1/object/public/wallet-assets/logo_canelo.png';

export const DEFAULT_WALLET_HEX_BG = '#1c1007';

/**
 * Asegura que la clase LoyaltyClass exista en Google Wallet antes de emitir pases.
 */
export async function ensureGoogleLoyaltyClass(): Promise<void> {
  const privateKey = getGooglePrivateKey();
  if (!privateKey || privateKey.length < 50) return;

  const auth = getGoogleAuth();
  const client = await auth.getClient();
  const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${CLASS_ID}`;

  const store = getStore();
  const merchant = store.merchant;
  const hexBg = merchant.card_gradient?.from || merchant.brand_color || DEFAULT_WALLET_HEX_BG;

  const heroImageUrl = DEFAULT_HERO_IMAGE_URL;

  const classPayload = {
    id: CLASS_ID,
    issuerName: merchant.name || 'Café Canelo & Specialty Roasters',
    programName: 'Club Canelo - Fidelidad',
    programLogo: {
      sourceUri: {
        uri: DEFAULT_PROGRAM_LOGO_URL,
      },
      contentDescription: {
        defaultValue: { language: 'es-CO', value: `${merchant.name || 'Café Canelo'} Logo` },
      },
    },
    heroImage: {
      sourceUri: {
        uri: heroImageUrl,
      },
      contentDescription: {
        defaultValue: { language: 'es-CO', value: `${merchant.name || 'Café Canelo'} Tarjeta Oficial` },
      },
    },
    hexBackgroundColor: hexBg,
    reviewStatus: 'UNDER_REVIEW',
    locations: [
      {
        latitude: 4.6682,
        longitude: -74.0538,
      },
    ],
  };

  try {
    const existing = await client.request({ url, method: 'GET' });
    if (existing.status === 200) {
      await client.request({
        url: `${url}?updateMask=heroImage,hexBackgroundColor,programLogo,issuerName,programName,reviewStatus`,
        method: 'PATCH',
        data: classPayload,
      });
      console.log('[Google Wallet]: Clase LoyaltyClass actualizada con éxito en Google.');
    }
  } catch (err: unknown) {
    const errorObj = err as { response?: { status?: number } };
    if (errorObj.response && errorObj.response.status === 404) {
      await client.request({
        url: 'https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass',
        method: 'POST',
        data: classPayload,
      });
      console.log('[Google Wallet]: Clase LoyaltyClass creada con éxito en Google.');
    } else {
      console.warn('[Google Wallet]: Error al verificar/actualizar clase:', err);
    }
  }
}

/**
 * Actualiza en caliente el diseño visual (color de fondo hex, nombre, logo, hero) en la clase de Google Wallet.
 * Google Wallet propaga automáticamente los cambios a todas las tarjetas emitidas a los teléfonos de los clientes.
 */
export async function updateGoogleLoyaltyClassDesign(options?: {
  hexBackgroundColor?: string;
  issuerName?: string;
  programName?: string;
  heroImageUrl?: string;
}): Promise<{ success: boolean; hexBackgroundColor?: string }> {
  const privateKey = getGooglePrivateKey();
  if (!privateKey || privateKey.length < 50) {
    console.log('[Google Wallet Simulación]: Actualización de diseño en clase simulada.');
    return { success: true, hexBackgroundColor: options?.hexBackgroundColor };
  }

  const auth = getGoogleAuth();
  const client = await auth.getClient();
  const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${CLASS_ID}`;

  const store = getStore();
  const merchant = store.merchant;
  const hexBg = options?.hexBackgroundColor || merchant.card_gradient?.from || merchant.brand_color || DEFAULT_WALLET_HEX_BG;
  const issuerName = options?.issuerName || merchant.name || 'Café Canelo & Specialty Roasters';
  const programName = options?.programName || 'Club Canelo - Fidelidad';
  const heroImageUrl = options?.heroImageUrl || DEFAULT_HERO_IMAGE_URL;

  const patchPayload = {
    hexBackgroundColor: hexBg,
    reviewStatus: 'UNDER_REVIEW',
    issuerName,
    programName,
    heroImage: {
      sourceUri: { uri: heroImageUrl },
      contentDescription: {
        defaultValue: { language: 'es-CO', value: `${issuerName} Tarjeta Oficial` },
      },
    },
  };

  try {
    const response = await client.request({
      url: `${url}?updateMask=hexBackgroundColor,reviewStatus,issuerName,programName,heroImage`,
      method: 'PATCH',
      data: patchPayload,
    });
    console.log(`[Google Wallet Sync OK]: Clase ${CLASS_ID} actualizada en Google. Nuevo color: ${hexBg}`);
    return { success: true, hexBackgroundColor: hexBg };
  } catch (err) {
    console.warn('[Google Wallet Design Update Error]:', err);
    return { success: false, hexBackgroundColor: hexBg };
  }
}

/**
 * Crea el LoyaltyObject con el QR del serial, lo firma con RS256 y devuelve la URL de guardado.
 * Integra la arquitectura dual ('single_card' vs 'multi_tier') y la Escalera de Premios por Hitos.
 */
export async function generateGoogleWalletSaveUrl(
  customer: Customer,
  pass: WalletPass
): Promise<string> {
  const store = getStore();
  const merchant = store.merchant;
  const isSingleCard = merchant.loyalty_program_mode === 'single_card';
  const hexBg = merchant.card_gradient?.from || merchant.brand_color || DEFAULT_WALLET_HEX_BG;

  const objectId = `${ISSUER_ID}.${pass.pass_serial_number}`;

  const textModules = [
    {
      id: 'sede_bogota',
      header: 'Sede Chapinero (Bogotá)',
      body: `Calle 85 # 11-53. Meta: ${merchant.stamps_needed || 10} sellos para ${merchant.reward_description || 'Premio de Autor'}. Presenta este código en caja.`,
    },
  ];

  if (isSingleCard && merchant.reward_milestones && merchant.reward_milestones.length > 0) {
    const milestonesText = merchant.reward_milestones
      .map((m) => `• Sello #${m.stamp_number}: ${m.reward}`)
      .join('\n');
    textModules.push({
      id: 'escalera_premios',
      header: '🎁 Escalera de Premios por Hitos',
      body: milestonesText,
    });
  }

  const totalStamps = merchant.stamps_needed || 8;
  const currentStamps = pass.current_stamps || 0;
  const isRewardReady = currentStamps >= totalStamps;
  const filledIcons = '⭐'.repeat(Math.min(currentStamps, totalStamps));
  const emptyIcons = '⚪'.repeat(Math.max(0, totalStamps - currentStamps));
  const stampsVisual = `${filledIcons}${emptyIcons}`;

  const heroImageUrl = DEFAULT_HERO_IMAGE_URL;

  const loyaltyObject = {
    id: objectId,
    classId: CLASS_ID,
    state: pass.status === 'active' ? 'ACTIVE' : 'INACTIVE',
    accountId: pass.pass_serial_number,
    accountName: customer.full_name,
    heroImage: {
      sourceUri: {
        uri: heroImageUrl,
      },
      contentDescription: {
        defaultValue: { language: 'es-CO', value: `${merchant.name || 'Café Canelo'} Tarjeta Oficial` },
      },
    },
    loyaltyPoints: {
      label: isRewardReady ? '🎉 ¡PREMIO DESBLOQUEADO!' : `Progreso de Sellos (${currentStamps}/${totalStamps})`,
      balance: {
        string: isRewardReady ? `🏆 ${currentStamps}/${totalStamps} SELLOS COMPLETOS` : `${stampsVisual} (${currentStamps}/${totalStamps})`,
      },
    },
    secondaryLoyaltyPoints: {
      label: isRewardReady ? 'Premio en Caja' : 'Meta de Recompensa',
      balance: {
        string: isRewardReady 
          ? (merchant.reward_description || 'Premio de Autor Reclamable') 
          : `${totalStamps - currentStamps} sellos restantes para: ${merchant.reward_description || 'Premio'}`,
      },
    },
    barcode: {
      type: 'QR_CODE',
      value: pass.pass_serial_number,
      alternateText: pass.pass_serial_number,
    },
    locations: [
      {
        latitude: 4.6682,
        longitude: -74.0538,
      },
    ],
    textModulesData: textModules,
  };

  const loyaltyClass = {
    id: CLASS_ID,
    issuerName: merchant.name || 'Café Canelo & Specialty Roasters',
    programName: 'Club Canelo - Fidelidad',
    programLogo: {
      sourceUri: {
        uri: process.env.NEXT_PUBLIC_LOGO_URL || 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=500&auto=format&fit=crop&q=60',
      },
      contentDescription: {
        defaultValue: { language: 'es-CO', value: `${merchant.name || 'Café Canelo'} Logo` },
      },
    },
    heroImage: {
      sourceUri: {
        uri: heroImageUrl,
      },
      contentDescription: {
        defaultValue: { language: 'es-CO', value: `${merchant.name || 'Café Canelo'} Banner` },
      },
    },
    hexBackgroundColor: hexBg,
    reviewStatus: 'UNDER_REVIEW',
  };

  const currentOrigin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const origins = Array.from(new Set([
    'http://localhost:3000',
    'http://192.168.1.5:3000',
    'http://192.168.1.8:3000',
    'http://192.168.1.129:3000',
    'https://slimy-mangos-occur.loca.lt',
    currentOrigin,
  ])).filter(Boolean);

  const claims = {
    iss: SERVICE_ACCOUNT_EMAIL,
    aud: 'google',
    origins,
    typ: 'savetowallet',
    payload: {
      loyaltyClasses: [loyaltyClass],
      loyaltyObjects: [loyaltyObject],
    },
  };

  const privateKey = getGooglePrivateKey();

  // Fallback amigable para demo local si no hay certificados
  if (!privateKey || privateKey.length < 50) {
    const dummyJwt = Buffer.from(JSON.stringify(claims)).toString('base64');
    return `https://pay.google.com/gp/v/save/${dummyJwt}`;
  }

  const token = jwt.sign(claims, privateKey, { algorithm: 'RS256' });
  return `https://pay.google.com/gp/v/save/${token}`;
}

/**
 * Hace el PATCH a Google Wallet API para actualizar los sellos y disparar notificación push nativa.
 */
export async function updateGooglePassStamps(
  serialNumber: string,
  newStamps: number,
  message: string
): Promise<{ success: boolean; simulated?: boolean; error?: string }> {
  const privateKey = getGooglePrivateKey();
  if (!privateKey || privateKey.length < 50) {
    console.warn(`[Google Wallet Simulación]: GOOGLE_PRIVATE_KEY no configurada. Simulado para ${serialNumber}`);
    return {
      success: false,
      simulated: true,
      error: 'GOOGLE_PRIVATE_KEY no configurada en las variables de entorno de Vercel.',
    };
  }

  const store = getStore();
  const totalStamps = store.merchant.stamps_needed || 8;
  const isRewardReady = newStamps >= totalStamps;
  const filledIcons = '⭐'.repeat(Math.min(newStamps, totalStamps));
  const emptyIcons = '⚪'.repeat(Math.max(0, totalStamps - newStamps));
  const stampsVisual = `${filledIcons}${emptyIcons}`;

  try {
    const auth = getGoogleAuth();
    const client = await auth.getClient();
    const objectId = `${ISSUER_ID}.${serialNumber}`;
    const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${objectId}?updateMask=loyaltyPoints,secondaryLoyaltyPoints,messages,heroImage`;

    const heroImageUrl = DEFAULT_HERO_IMAGE_URL;

    const patchPayload = {
      heroImage: {
        sourceUri: {
          uri: heroImageUrl,
        },
        contentDescription: {
          defaultValue: { language: 'es-CO', value: `${store.merchant.name || 'Café Canelo'} Tarjeta Oficial` },
        },
      },
      loyaltyPoints: {
        label: isRewardReady ? '🎉 ¡PREMIO DESBLOQUEADO!' : `Progreso de Sellos (${newStamps}/${totalStamps})`,
        balance: {
          string: isRewardReady ? `🏆 ${newStamps}/${totalStamps} SELLOS COMPLETOS` : `${stampsVisual} (${newStamps}/${totalStamps})`,
        },
      },
      secondaryLoyaltyPoints: {
        label: isRewardReady ? 'Premio Reclamable' : 'Meta de Recompensa',
        balance: {
          string: isRewardReady 
            ? (store.merchant.reward_description || 'Premio de Autor Listo') 
            : `${totalStamps - newStamps} sellos para: ${store.merchant.reward_description || 'Premio'}`,
        },
      },
      messages: [
        {
          id: `msg-${Date.now()}`,
          header: isRewardReady ? '🎉 ¡PREMIO LISTO PARA RECLAMAR!' : (store.merchant.name || 'Café Canelo & Specialty Roasters'),
          body: message,
          messageType: 'TEXT_AND_NOTIFY', // Dispara notificación push en la pantalla de bloqueo de Android
        },
      ],
    };

    await client.request({
      url,
      method: 'PATCH',
      data: patchPayload,
    });
    console.log(`[Google Wallet Sync OK]: Pase ${serialNumber} actualizado a ${newStamps} sellos. Push emitido: "${message}"`);
    return { success: true };
  } catch (err: any) {
    const apiError = err?.response?.data?.error?.message || err?.message || 'Error desconocido';
    const status = err?.response?.status;
    console.warn(`[Google Wallet PATCH Error ${status}]:`, apiError);
    return {
      success: false,
      error: status === 404
        ? `El pase (${serialNumber}) aún no ha sido añadido a Google Wallet en el celular, o no existe en Google.`
        : `Google Wallet API (${status || 'Error'}): ${apiError}`,
    };
  }
}

/**
 * Emite una campaña de notificación masiva o por segmento a los pases activos de Google Wallet.
 */
export async function broadcastGoogleWalletNotification(
  serials: string[],
  title: string,
  body: string
): Promise<{ successCount: number; failureCount: number; errors: string[] }> {
  let successCount = 0;
  let failureCount = 0;
  const errors: string[] = [];

  for (const serial of serials) {
    try {
      const store = getStore();
      const pass = store.passes.find((p) => p.pass_serial_number === serial);
      const stamps = pass ? pass.current_stamps : 1;
      const res = await updateGooglePassStamps(serial, stamps, `${title}: ${body}`);
      if (res.success) {
        successCount++;
      } else {
        failureCount++;
        if (res.error) errors.push(res.error);
      }
    } catch (e: any) {
      failureCount++;
      errors.push(e?.message || 'Error en broadcast');
    }
  }

  return { successCount, failureCount, errors };
}
