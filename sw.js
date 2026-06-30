// Service Worker Simplificado (Sem Cache Offline)
// Mantido apenas para cumprir a exigência dos navegadores para a instalação do PWA.

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Limpar qualquer cache antigo que tenha sido armazenado
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Manipulador de requisições vazio (pass-through)
// O navegador fará todas as requisições diretamente à rede/servidor.
self.addEventListener('fetch', (e) => {
  // Apenas passa direto, sem cache.
  return;
});

// Listener para receber notificações push em segundo plano
self.addEventListener('push', (e) => {
  let data = { title: 'Apoio RNEST 🚦', body: 'Uma nova vaga de apoio foi cadastrada no sistema!' };

  if (e.data) {
    try {
      data = e.data.json();
    } catch (err) {
      data = { title: 'Apoio RNEST 🚦', body: e.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: './index.html'
    }
  };

  e.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Ao clicar na notificação, abrir ou focar no aplicativo
self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  const urlToOpen = new URL(e.notification.data.url, self.location.origin).href;

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Se a aba já estiver aberta, foca nela
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Caso contrário, abre uma nova janela
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
