// Service worker propio: su alcance es esta carpeta, así no se mezcla con los
// de las otras apps que viven en el mismo sitio.
const CACHE = 'clima-v2';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles.css',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './js/app.js',
  './js/logica.js',
  './js/pronostico.js',
  './js/nativo.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith('clima-') && k !== CACHE)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Red primero para tener siempre la última versión; caché como respaldo
// offline. El pronóstico (otro origen) no pasa por acá: lo guarda la app.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html'))),
  );
});
