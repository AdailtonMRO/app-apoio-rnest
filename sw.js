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
