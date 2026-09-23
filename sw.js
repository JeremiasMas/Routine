// Service worker: la app funciona sin conexión.
const CACHE = 'rutina-rpg-v1';

// Sin estos la app no funciona offline: si alguno falla, la instalación falla.
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/state.js',
  './js/derive.js',
  './js/hazanas.js',
  './js/xp.js',
  './js/body.js',
  './js/strength.js',
  './js/seed.js',
  './js/steps-import.js',
  './js/zip.js',
  './js/pedometer.js',
  './js/native.js',
  './js/merge.js',
  './js/pausas.js',
  './js/progresion.js',
  './js/resumen.js',
  './js/csv.js',
  './js/backup.js',
  './js/theme.js',
  './js/analisis.js',
  './js/config.js',
  './js/copys.js',
  './js/utils.js',
  './js/ui/components.js',
  './js/ui/feedback.js',
  './js/ui/sheet.js',
  './js/ui/logger.js',
  './js/ui/walk.js',
  './js/views/today.js',
  './js/views/activity.js',
  './js/views/stats.js',
  './js/views/analisis.js',
  './js/views/awards.js',
  './js/views/settings.js',
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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
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
