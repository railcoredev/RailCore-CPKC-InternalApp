const CACHE_NAME = 'railcore-crossing-worker-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './railcore-icon-192.png',
  './railcore-icon-512.png',
  './data_loader.js',
  './app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).catch(() =>
          cached || new Response('Offline', { status: 503, statusText: 'Offline' })
        )
      );
    })
  );
});
