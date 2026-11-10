// Service Worker: hält die App offline verfügbar. Bei Änderungen an den Dateien VERSION erhöhen.
const VERSION = 'ks-2.2.0';
// Cross-Origin-Isolation: erlaubt dem Browser, beim Freistellen mehrere Prozessorkerne zu nutzen.
// GitHub Pages kann diese Header nicht selbst senden, daher setzt sie der Service Worker.
const COI_HEADERS = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };
function withCoi(res) {
  if (!res || res.status === 0 || res.type === 'opaqueredirect') return res;
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(COI_HEADERS)) h.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
// Bibliothek + KI-Modell zum Freistellen: eigener Cache, bleibt bei App-Updates erhalten
const ML_CACHE = 'ks-ml-1';
const ML_HOSTS = ['cdn.jsdelivr.net', 'staticimgly.com'];
const ASSETS = ['./', './index.html', './kategorien.js', './optionen.js', './app.js', './style.css', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== ML_CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'GET' && ML_HOSTS.includes(url.hostname)) {
    // Versionierte Dateien ändern sich nie: Cache zuerst
    e.respondWith(caches.open(ML_CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // Dropbox/Graph nie cachen

  if (req.mode === 'navigate') {
    // Netzwerk zuerst (wichtig für die Rückkehr von der Anmeldung), offline aus dem Cache
    e.respondWith(fetch(req).then(withCoi).catch(() => caches.match('./index.html', { ignoreSearch: true }).then(withCoi)));
    return;
  }
  // Stale-while-revalidate für App-Dateien
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => cached);
    return cached || net;
  }));
});
