const CACHE_NAME = "itai-cache-v2";
/** Pages that may be served offline — must exist on this host (SPA routes). */
const OFFLINE_URLS = ["/", "/login", "/dashboard"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of OFFLINE_URLS) {
        try {
          await cache.add(url);
        } catch (e) {
          // Precache must not abort install: CDN errors, 404, 503 during deploy, etc.
          console.warn("[sw] precache skip", url, e);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Backend API runs under same origin (/api/*) — never cache or stale-match here.
  if (url.pathname.startsWith("/api")) {
    event.respondWith(fetch(req));
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).catch(() => caches.match("/login"));
    })
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const payload = event.data.json();
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Expovision AI Academy", {
      body: payload.body ?? "Новый день доступен",
      icon: "/icons/icon.svg"
    })
  );
});
