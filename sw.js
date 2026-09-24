// Service worker: deixa o Metas abrir offline. Firebase e /api nunca entram no cache.

// O build troca __BUILD_ID__ por um id novo a cada deploy.
const CACHE_NAME = 'metas-__BUILD_ID__';
const CDNS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(['./', './index.html']).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro (sempre a versão nova); o cache só responde quando estiver offline.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const mesmoSite = url.origin === self.location.origin && !url.pathname.startsWith('/api/');
  if (!mesmoSite && !CDNS.includes(url.hostname)) return;
  event.respondWith(
    fetch(event.request)
      .then((resposta) => {
        if (resposta.ok || resposta.type === 'opaque') {
          const copia = resposta.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        }
        return resposta;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match('./index.html')))
  );
});
