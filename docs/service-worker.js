// service-worker.js — RailCore CPKC Worker App v3.8
const CACHE_NAME = "railcore-cpkc-worker-v3.8";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles/style.css",
  "./app.js",
  "./data_loader.js",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.headers.get("accept")?.includes("text/html")) {
    // Network-first for HTML
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req))
    );
  } else {
    // Cache-first for assets
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
  }
});
