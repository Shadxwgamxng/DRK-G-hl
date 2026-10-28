/* KFZ-Warte – Service Worker
 * - App-Grundgerüst (JS/CSS/Icons) wird zwischengespeichert (cache-first).
 * - Ausgewählte, bereits geladene Seiten (Fahrzeug, Kontrolle, Mängelmeldung, Sync) werden für die
 *   Offline-Anzeige vorgehalten (network-first). Beim Abmelden wird dieser Cache gelöscht.
 * - API-Aufrufe und Dateien (Fotos/Dokumente) werden NIE im Cache abgelegt.
 */
const STATIC = "drk-static-v4";
const PAGES = "drk-pages";
const OFFLINE_URL = "/offline";
const PAGE_ALLOW = [/^\/$/, /^\/fahrzeuge(\/[^/]+)?$/, /^\/fahrzeuge\/[^/]+\/(kontrolle|material)$/, /^\/maengel\/neu$/, /^\/sync$/];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC).then((c) => c.addAll([OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png", "/brand/drk-goehl-logo.png"])).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("drk-static-") && k !== STATIC).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "clear-user-data") event.waitUntil(caches.delete(PAGES));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // niemals cachen

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const allowed = PAGE_ALLOW.some((r) => r.test(url.pathname));
          if (allowed && res.ok && !res.redirected && res.type === "basic") {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(url.pathname, { cacheName: PAGES })) || (await caches.match(OFFLINE_URL)) || Response.error()),
    );
  }
});
