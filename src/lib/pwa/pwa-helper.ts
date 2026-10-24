'use client';

// Utilidades para PWA, Notificaciones Push y Persistencia Permanente de Tarjeta
export interface PwaInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const STORAGE_ACTIVE_PASS_KEY = 'fidelizia_active_pass_serial';

// 1. Persistencia Local de la Tarjeta del Usuario
export function saveActivePassSerial(serial: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_ACTIVE_PASS_KEY, serial);
  } catch (err) {
    console.warn('Error saving active pass serial:', err);
  }
}

export function getActivePassSerial(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_ACTIVE_PASS_KEY);
  } catch (err) {
    console.warn('Error reading active pass serial:', err);
    return null;
  }
}

export function clearActivePassSerial(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_ACTIVE_PASS_KEY);
  } catch (err) {
    console.warn('Error clearing active pass serial:', err);
  }
}

// 2. Registro del Service Worker
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    return registration;
  } catch (error) {
    console.warn('Service Worker registration failed:', error);
    return null;
  }
}

// 3. Activación de Notificaciones Push Nativas y Notificación de Bienvenida
export async function requestPushPermissionAndSendWelcome(customerName: string): Promise<{
  granted: boolean;
  status: NotificationPermission;
}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { granted: false, status: 'denied' };
  }

  try {
    const permission = await Notification.requestPermission();

    if (permission === 'granted') {
      // Disparar notificación nativa inmediata en el celular / escritorio
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification(`☕ Café Canelo · ¡Hola, ${customerName}!`, {
          body: 'Tu tarjeta de lealtad está activa en tu teléfono. Te notificaremos cuando ganes sellos o promociones 2x1.',
          icon: '/passes/icon.png',
          badge: '/passes/icon.png',
          tag: 'welcome-notification',
          data: { url: window.location.origin },
        });
      } else {
        new Notification(`☕ Café Canelo · ¡Hola, ${customerName}!`, {
          body: 'Tu tarjeta de lealtad está activa en tu teléfono.',
          icon: '/passes/icon.png',
        });
      }

      return { granted: true, status: 'granted' };
    }

    return { granted: false, status: permission };
  } catch (error) {
    console.warn('Error requesting notification permission:', error);
    return { granted: false, status: 'denied' };
  }
}

// 4. Compartir Tarjeta / Guardar en WhatsApp
export function generateWhatsAppPassLink(merchantName: string, customerName: string, serial: string): string {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const passUrl = `${baseUrl}/?serial=${serial}`;

  const message = `☕ *Mi Tarjeta Digital de Lealtad · ${merchantName}*\n\n` +
    `👤 Titular: *${customerName}*\n` +
    `🎫 Serie: \`${serial}\`\n\n` +
    `📲 Guarda este enlace en tu chat personal o anclados para presentarla siempre en caja:\n` +
    `${passUrl}`;

  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
