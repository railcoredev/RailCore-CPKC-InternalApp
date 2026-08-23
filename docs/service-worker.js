// service-worker.js — RailCore CPKC Worker App v4.0
// RELEASE RULE: bump this with EVERY release, same as the ?v= stamps in
// index.html. The manifest is precached, so a stale CACHE_NAME serves a
// stale manifest forever -- live 2026-08-19: phones held the v4101
// manifest (broken icon paths) through six releases, so installs fell
// back to the generic letter shortcut.
const CACHE_NAME = "railcore-cpkc-worker-v4129";

// Only files that actually exist: addAll() rejects the whole install if any
// asset 404s (this is what silently broke v38 updates — it listed four
// data/*.json files that were never published).
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles/style.css",
  "./app.js",
  "./data_loader.js",
  "./manifest.webmanifest",
  "./data/railcore_snapshot.json"
];

// INSTALL — cache everything
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
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
    ).then(() => self.clients.claim())
  );
});

// FETCH — network first for HTML and live data JSON, cache first otherwise
self.addEventListener("fetch", event => {
  const req = event.request;
  // NEVER intercept cross-origin requests: cache-first was serving 2h-old
  // GitHub API responses (watchdog health, RSA status, the private pay
  // feed) -- live 2026-08-19: "Watchdog silent 120m" on a phone while
  // health.json was 1 minute fresh. Live status must hit the network.
  if (new URL(req.url).origin !== self.location.origin) return;
  const isHtml = req.headers.get("accept")?.includes("text/html");
  // Live feeds (lineups every ~5 min) must always try the network so the
  // app shows the freshest picture, falling back to cache when offline.
  const isLiveData = req.url.includes("/data/");

  if (isHtml || isLiveData) {
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
