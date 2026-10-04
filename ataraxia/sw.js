// Service worker propio: su alcance es esta carpeta, así no se mezcla con el
// de la otra app que vive en la raíz del mismo sitio.
const CACHE = 'ataraxia-v2';

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
  './js/filosofos.js',
  './js/postura.js',
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
        .filter((k) => k.startsWith('ataraxia-') && k !== CACHE)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Red primero para tener siempre la última versión; caché como respaldo offline.
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
