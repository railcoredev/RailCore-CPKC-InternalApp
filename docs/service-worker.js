// service-worker.js — RailCore CPKC Worker App v3.8
const CACHE_NAME = "railcore-cpkc-worker-v38";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles/style.css",
  "./app.js",
  "./data_loader.js",
  "./manifest.webmanifest",
  // Data snapshots (local offline bundles)
  "./data/subdivisions.json",
  "./data/sidings.json",
  "./data/crossings.json",
  "./data/yards.json"
];

// INSTALL — cache everything
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
});

// ACTIVATE — clean old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
});

// FETCH — network first for HTML, cache first for everything else
self.addEventListener("fetch", event => {
  const req = event.request;

  // HTML gets network-first so updates show up without reload hell
  if (req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req))
    );
  } else {
    // Everything else = cache first
    event.respondWith(
      caches.match(req).then(cached => {
        return (
          cached ||
          fetch(req).then(res => {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
            return res;
          })
        );
      })
    );
  }
});
