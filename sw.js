// Service Worker: hält die App offline verfügbar. Bei Änderungen an den Dateien VERSION erhöhen.
const VERSION = 'ks-1.2.0';
const ASSETS = ['./', './index.html', './kategorien.js', './app.js', './style.css', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // Microsoft/Graph nie cachen

  if (req.mode === 'navigate') {
    // Netzwerk zuerst (wichtig für die Rückkehr von der Anmeldung), offline aus dem Cache
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }
  // Stale-while-revalidate für App-Dateien
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => cached);
    return cached || net;
  }));
});
