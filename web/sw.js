// Service worker : l'application s'installe, les pages s'ouvrent même avec un Wi-Fi faible,
// et les notifications (place libérée, match lancé) s'affichent même quand la page est fermée.
// Les données (Supabase) passent toujours par le réseau.
const CACHE = 'vb-flechettes-v10';
const ASSETS = ['./', 'index.html', 'staff.html', 'bar.html', 'gerer.html', 'comptoir.html', 'suivi.html', 'test.html', 'style.css', 'config.js', 'icon.svg', 'icon-192.png', 'manifest.webmanifest',
  'js/public.js', 'js/staff.js', 'js/engine.js', 'js/util.js', 'js/sb.js', 'js/views.js', 'js/games.js', 'js/art.js', 'js/assets.js', 'js/push.js', 'js/guide.js', 'js/tvbracket.js'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // réseau d'abord, cache en secours
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

// Notification reçue du serveur (fonction Supabase « push »)
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Concours de fléchettes', {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag, icon: 'icon-192.png',
    data: { url: new URL(d.url || './', self.registration.scope).href },
  }));
});
// Toucher la notification ouvre l'application sur le bon onglet
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const w = list.find((c) => c.url.startsWith(self.registration.scope));
    if (w) return w.navigate(url).then((c) => (c || w).focus()).catch(() => w.focus());
    return self.clients.openWindow(url);
  }));
});
