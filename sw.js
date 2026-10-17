// Keeps the trip page and the map library available without phone reception.
// Map tiles are cached by the page itself (see cachedFetch in index.html).
const CACHE = "trip-shell-v1";
const SHELL = [
  "./",
  "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js",
  "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"
];

function cacheShell() {
  return caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))));
}

self.addEventListener("install", (e) => {
  e.waitUntil(cacheShell());
  self.skipWaiting();
});

self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("message", (e) => {
  if (e.data === "cache-shell") e.waitUntil(cacheShell());
});

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

  // The map library: cache first
  if (url.host === "unpkg.com") {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((r) => {
            const copy = r.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return r;
          })
      )
    );
  }
});
