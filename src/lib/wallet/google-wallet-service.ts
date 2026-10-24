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

const RAW_KEY = process.env.GOOGLE_PRIVATE_KEY || '';
const PRIVATE_KEY = RAW_KEY.replace(/\\n/g, '\n');

const CLASS_SUFFIX = 'canelo_loyalty_v1';
const CLASS_ID = `${ISSUER_ID}.${CLASS_SUFFIX}`;

let cachedAuth: GoogleAuth | null = null;

function getGoogleAuth(): GoogleAuth {
  if (!cachedAuth) {
    if (!PRIVATE_KEY || PRIVATE_KEY.length < 50) {
      console.warn('[Google Wallet] GOOGLE_PRIVATE_KEY no configurada. Las firmas locales operarán en modo degradado.');
    }
    cachedAuth = new GoogleAuth({
      credentials: {
        client_email: SERVICE_ACCOUNT_EMAIL,
        private_key: PRIVATE_KEY,
      },
      scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
    });
  }
  return cachedAuth;
}

/**
 * Asegura que la clase LoyaltyClass exista en Google Wallet antes de emitir pases.
 */
export async function ensureGoogleLoyaltyClass(): Promise<void> {
  if (!PRIVATE_KEY || PRIVATE_KEY.length < 50) return;

  const auth = getGoogleAuth();
  const client = await auth.getClient();
  const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${CLASS_ID}`;

  const store = getStore();
  const merchant = store.merchant;
  const isSingleCard = merchant.loyalty_program_mode === 'single_card';
  const hexBg = isSingleCard 
    ? (merchant.card_gradient?.from || merchant.brand_color || '#140f0c')
    : '#140f0c';

  const heroImageUrl = 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=1032&auto=format&fit=crop&q=80';

  const classPayload = {
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
        url: `${url}?updateMask=heroImage,hexBackgroundColor,programLogo,issuerName,programName`,
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
  const hexBg = isSingleCard 
    ? (merchant.card_gradient?.from || merchant.brand_color || '#140f0c')
    : '#140f0c';

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

  const heroImageUrl = 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=1032&auto=format&fit=crop&q=80';

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
        defaultValue: { language: 'es-CO', value: `${merchant.name || 'Café Canelo'} Banner` },
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

  // Fallback amigable para demo local si no hay certificados
  if (!PRIVATE_KEY || PRIVATE_KEY.length < 50) {
    const dummyJwt = Buffer.from(JSON.stringify(claims)).toString('base64');
    return `https://pay.google.com/gp/v/save/${dummyJwt}`;
  }

  const token = jwt.sign(claims, PRIVATE_KEY, { algorithm: 'RS256' });
  return `https://pay.google.com/gp/v/save/${token}`;
}

/**
 * Hace el PATCH a Google Wallet API para actualizar los sellos y disparar notificación push nativa.
 */
export async function updateGooglePassStamps(
  serialNumber: string,
  newStamps: number,
  message: string
): Promise<void> {
  if (!PRIVATE_KEY || PRIVATE_KEY.length < 50) {
    console.log(`[Google Wallet Simulación]: Actualizando sellos de ${serialNumber} a ${newStamps}. Push: "${message}"`);
    return;
  }

  const store = getStore();
  const totalStamps = store.merchant.stamps_needed || 8;
  const isRewardReady = newStamps >= totalStamps;
  const filledIcons = '⭐'.repeat(Math.min(newStamps, totalStamps));
  const emptyIcons = '⚪'.repeat(Math.max(0, totalStamps - newStamps));
  const stampsVisual = `${filledIcons}${emptyIcons}`;

  const auth = getGoogleAuth();
  const client = await auth.getClient();
  const objectId = `${ISSUER_ID}.${serialNumber}`;
  const url = `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${objectId}?updateMask=loyaltyPoints,secondaryLoyaltyPoints,messages,heroImage`;

  const heroImageUrl = 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=1032&auto=format&fit=crop&q=80';

  const patchPayload = {
    heroImage: {
      sourceUri: {
        uri: heroImageUrl,
      },
      contentDescription: {
        defaultValue: { language: 'es-CO', value: `${store.merchant.name || 'Café Canelo'} Banner` },
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

  try {
    await client.request({
      url,
      method: 'PATCH',
      data: patchPayload,
    });
    console.log(`[Google Wallet Sync OK]: Pase ${serialNumber} actualizado a ${newStamps} sellos. Push emitido: "${message}"`);
  } catch (err) {
    console.warn('[Google Wallet PATCH Error]:', err);
  }
}

/**
 * Emite una campaña de notificación masiva o por segmento a los pases activos de Google Wallet.
 */
export async function broadcastGoogleWalletNotification(
  serials: string[],
  title: string,
  body: string
): Promise<{ successCount: number; failureCount: number }> {
  let successCount = 0;
  let failureCount = 0;

  for (const serial of serials) {
    try {
      const store = getStore();
      const pass = store.passes.find((p) => p.pass_serial_number === serial);
      const stamps = pass ? pass.current_stamps : 1;
      await updateGooglePassStamps(serial, stamps, `${title}: ${body}`);
      successCount++;
    } catch (e) {
      console.warn(`[Broadcast Error] Falló notificación para serial ${serial}:`, e);
      failureCount++;
    }
  }

  return { successCount, failureCount };
}
