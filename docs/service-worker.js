/* ============================================================
   RAILCORE WORKER APP v3.7 — SERVICE WORKER
   - 3 second update check
   - Cache everything in /docs/
   - Auto-refresh when a new version is detected
   ============================================================ */

const CACHE_NAME = "railcore-cpkc-worker-v3.8";
const APP_VERSION = "3.8";

// Files to cache (core assets)
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./data_loader.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-mask-192.png",
  "./icons/icon-mask-512.png"
];

/* Install */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

/* Activate: Remove old caches */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});

/* Fetch */
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).catch(() =>
          new Response("Offline — asset not cached.")
        )
      );
    })
  );
});

/* Auto-update check */
setTimeout(async () => {
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({ type: "CHECK_FOR_UPDATE", version: APP_VERSION });
  }
}, 3000);
