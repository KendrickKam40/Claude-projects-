// Keeps the trip page, the bundled map library and the fonts available without phone reception.
// Map tiles are cached by the page itself (see cachedFetch in index.html).
const CACHE = "trip-shell-v2";
const OLD = ["trip-shell-v1", "trip-map-v1"];
const VENDOR = "vendor/maplibre-gl-6.11.2/";
const SHELL = [
  "./",
  VENDOR + "maplibre-gl.mjs",
  VENDOR + "maplibre-gl-shared.mjs",
  VENDOR + "maplibre-gl-worker.mjs",
  VENDOR + "maplibre-gl.css"
];

function cacheShell() {
  return caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))));
}

self.addEventListener("install", (e) => {
  e.waitUntil(cacheShell());
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(Promise.all(OLD.map((k) => caches.delete(k))).then(() => self.clients.claim()));
});

self.addEventListener("message", (e) => {
  if (e.data === "cache-shell") e.waitUntil(cacheShell());
});

function cacheFirst(req) {
  return caches.match(req).then(
    (hit) =>
      hit ||
      fetch(req).then((r) => {
        if (r.ok || r.type === "opaque") {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return r;
      })
  );
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // The page: network first so updates arrive, saved copy when offline
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put("./", copy));
          return r;
        })
        .catch(() => caches.match("./"))
    );
    return;
  }

  // Bundled map library and fonts: cache first
  const sameOriginVendor = url.origin === self.location.origin && url.pathname.includes("/vendor/");
  if (sameOriginVendor || url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com") {
    e.respondWith(cacheFirst(req));
  }
});
