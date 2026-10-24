// Service Worker oficial de Fidelizia / Café Canelo PWA & Push Notifications
const CACHE_NAME = 'canelo-loyalty-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Escuchar notificaciones Push enviadas desde el servidor / Dashboard
self.addEventListener('push', (event) => {
  let data = {
    title: '☕ Café Canelo · Club de Lealtad',
    body: '¡Tienes una nueva actualización en tu tarjeta de lealtad!',
    icon: '/passes/icon.png',
    badge: '/passes/icon.png',
    data: { url: '/' }
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/passes/icon.png',
    badge: data.badge || '/passes/icon.png',
    vibrate: [200, 100, 200],
    tag: 'canelo-notification',
    renotify: true,
    data: data.data || { url: '/' },
    actions: [
      { action: 'open_pass', title: 'Ver Mi Tarjeta 💳' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Al tocar la notificación en la pantalla de bloqueo o barra del teléfono
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
