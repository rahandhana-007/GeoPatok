/* Geopatok V3 - By AR — network-first app shell so deploys show up */
const CACHE = "geopatok-v3b";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  // Activate new SW immediately after install
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/**
 * App shell (html/js/css): network-first, fallback to cache.
 * Everything else: network, fallback to cache if offline.
 * Never prefer stale app.js over a fresh deploy.
 */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isAppShell =
    path.endsWith("/") ||
    path.endsWith("/index.html") ||
    path.endsWith("/app.js") ||
    path.endsWith("/styles.css") ||
    path.endsWith("/manifest.webmanifest") ||
    path.endsWith("/sw.js");

  if (isAppShell) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Large geojson / other assets: network with cache fallback
  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(req, { cache: "no-store" });
    // Cache successful same-origin responses
    if (fresh && fresh.ok) {
      cache.put(req, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (_) {
    const cached = await cache.match(req);
    if (cached) return cached;
    // try bare path variants
    if (req.mode === "navigate") {
      const fallback = await cache.match("./index.html");
      if (fallback) return fallback;
    }
    throw new Error("Offline and no cache");
  }
}
