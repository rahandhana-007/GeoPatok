/* Geopatok V3 - By AR — offline PWA + map tile cache */
const APP_CACHE = "geopatok-app-v4d";
const TILE_CACHE = "geopatok-tiles-v4";
const DATA_CACHE = "geopatok-data-v4";

const APP_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./sw.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/favicon-16.png",
  "./vendor/leaflet/leaflet.css",
  "./vendor/leaflet/leaflet.js",
  "./vendor/leaflet/images/layers.png",
  "./vendor/leaflet/images/layers-2x.png",
  "./vendor/leaflet/images/marker-icon.png",
  "./vendor/leaflet/images/marker-icon-2x.png",
  "./vendor/leaflet/images/marker-shadow.png",
  "./data/POLSH_BSRE_1119.geojson",
];

function isTileRequest(url) {
  const h = url.hostname;
  const p = url.pathname;
  if (h.includes("tile.openstreetmap.org") && /\.png$/i.test(p)) return true;
  if (h.includes("tile.opentopomap.org") && /\.png$/i.test(p)) return true;
  if (
    h.includes("arcgisonline.com") &&
    p.includes("/MapServer/tile/")
  )
    return true;
  if (h.includes("server.arcgisonline.com") && p.includes("/tile/")) return true;
  return false;
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(APP_ASSETS))
      .catch((err) => console.warn("[sw] prefetch shell", err))
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([APP_CACHE, TILE_CACHE, DATA_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (data.type === "CACHE_URLS") {
    const urls = Array.isArray(data.urls) ? data.urls : [];
    const cacheName = data.cache || TILE_CACHE;
    event.waitUntil(
      (async () => {
        const cache = await caches.open(cacheName);
        let ok = 0;
        let fail = 0;
        for (const u of urls) {
          try {
            const res = await fetch(u, { mode: "cors", credentials: "omit" });
            if (res && res.ok) {
              await cache.put(u, res.clone());
              ok++;
            } else fail++;
          } catch (_) {
            fail++;
          }
          if (event.source) {
            event.source.postMessage({
              type: "CACHE_PROGRESS",
              ok,
              fail,
              total: urls.length,
            });
          }
        }
        if (event.source) {
          event.source.postMessage({
            type: "CACHE_DONE",
            ok,
            fail,
            total: urls.length,
          });
        }
      })()
    );
  }
  if (data.type === "CLEAR_TILE_CACHE") {
    event.waitUntil(caches.delete(TILE_CACHE).then(() => caches.open(TILE_CACHE)));
  }
  if (data.type === "GET_CACHE_STATS") {
    event.waitUntil(
      (async () => {
        const stats = {};
        for (const name of [APP_CACHE, TILE_CACHE, DATA_CACHE]) {
          try {
            const c = await caches.open(name);
            const keys = await c.keys();
            stats[name] = keys.length;
          } catch (_) {
            stats[name] = 0;
          }
        }
        if (event.source) {
          event.source.postMessage({ type: "CACHE_STATS", stats });
        }
      })()
    );
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }

  // Map tiles — cache-first (offline map packs)
  if (isTileRequest(url)) {
    event.respondWith(tileCacheFirst(req));
    return;
  }

  // Same-origin app + data
  if (isSameOrigin(url)) {
    // GeoJSON / large data: cache-first after first load
    if (url.pathname.includes("/data/") || url.pathname.endsWith(".geojson")) {
      event.respondWith(dataCacheFirst(req));
      return;
    }
    // App shell: network-first with cache fallback
    event.respondWith(appNetworkFirst(req));
    return;
  }
});

async function tileCacheFirst(req) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(req, { ignoreSearch: false });
  if (cached) return cached;
  try {
    const fresh = await fetch(req, { mode: "cors", credentials: "omit" });
    if (fresh && fresh.ok) {
      cache.put(req, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (_) {
    // Transparent 1x1 png fallback so Leaflet doesn't spam errors forever
    return (
      cached ||
      new Response(
        Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W7ZUAAAAASUVORK5CYII="), (c) =>
          c.charCodeAt(0)
        ),
        { headers: { "Content-Type": "image/png", "X-Offline-Fallback": "1" } }
      )
    );
  }
}

async function dataCacheFirst(req) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(req);
  if (cached) {
    // revalidate in background
    fetch(req)
      .then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
      })
      .catch(() => {});
    return cached;
  }
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
    return fresh;
  } catch (_) {
    return cached || Response.error();
  }
}

async function appNetworkFirst(req) {
  const cache = await caches.open(APP_CACHE);
  try {
    const fresh = await fetch(req, { cache: "no-store" });
    if (fresh && fresh.ok) {
      cache.put(req, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (_) {
    const cached = await cache.match(req);
    if (cached) return cached;
    if (req.mode === "navigate") {
      return (
        (await cache.match("./index.html")) ||
        (await cache.match("/index.html")) ||
        Response.error()
      );
    }
    return Response.error();
  }
}
