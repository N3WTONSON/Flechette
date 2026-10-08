// Service worker minimal : l'application s'installe et les pages s'ouvrent même avec un Wi-Fi faible.
// Les données (Supabase) passent toujours par le réseau.
const CACHE = 'vb-flechettes-v4';
const ASSETS = ['./', 'index.html', 'staff.html', 'bar.html', 'gerer.html', 'comptoir.html', 'suivi.html', 'style.css', 'config.js', 'icon.svg', 'manifest.webmanifest',
  'js/public.js', 'js/staff.js', 'js/engine.js', 'js/util.js', 'js/sb.js', 'js/views.js', 'js/games.js', 'js/art.js'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // réseau d'abord, cache en secours
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
