// Service Worker — Bolão Copa 2026
// Recebe push notifications da API e abre o app na URL configurada quando clicado.

self.addEventListener('install', (event) => {
  // Activate immediately on first install so existing tabs pick it up.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Bolão Copa 2026', body: 'Atualização disponível' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Fallback to default when payload isn't JSON.
  }
  const options = {
    body: payload.body,
    icon: '/fifa-world-cup-2026.png',
    badge: '/fifa-world-cup-2026.png',
    tag: payload.tag || 'bolao-default',
    data: { url: payload.url || '/' },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab on the same origin if any; otherwise open new.
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl);
          return;
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
