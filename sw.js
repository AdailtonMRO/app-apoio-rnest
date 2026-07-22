// Service Worker com Firebase Cloud Messaging (FCM)
// Importa os scripts de compatibilidade do Firebase para lidar com mensagens push em background.

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Inicializa o Firebase no contexto do Service Worker
firebase.initializeApp({
  apiKey: "AIzaSyDoogLg4L_etWVGWh7rmQuLqs30oTwG98E",
  authDomain: "app-apoio-rnest.firebaseapp.com",
  projectId: "app-apoio-rnest",
  storageBucket: "app-apoio-rnest.firebasestorage.app",
  messagingSenderId: "629818355014",
  appId: "1:629818355014:web:271e60b7ac59b70bc28947",
});

const messaging = firebase.messaging();

// -------------------------------------------------------
// Manipulador de mensagens FCM recebidas em segundo plano
// (app fechado ou em outra aba) - OBRIGATÓRIO para web push
// -------------------------------------------------------
messaging.onBackgroundMessage((payload) => {
  console.log('[sw.js] Mensagem FCM recebida em background:', payload);

  const title = payload.notification?.title || '🚦 Solicitação de Apoio 🚦';
  const body  = payload.notification?.body  || 'Uma nova vaga foi cadastrada no sistema!';
  const targetUrl = payload.fcmOptions?.link || payload.data?.url || payload.data?.link || '/?org=rnest_teu_ut';

  const options = {
    body,
    icon:    '/icon-192.png',
    badge:   '/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: targetUrl }
  };

  self.registration.showNotification(title, options);
});

// -------------------------------------------------------
// Ciclo de vida do Service Worker
// -------------------------------------------------------
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Pass-through: sem cache offline
self.addEventListener('fetch', () => { return; });

// -------------------------------------------------------
// Clique na notificação → abre/foca o PWA
// -------------------------------------------------------
self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  const urlToOpen = new URL(e.notification.data?.url || '/', self.location.origin).href;

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
