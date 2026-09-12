// Brain – Service Worker: macht die App offline-fähig.
// Bei jeder Veröffentlichung VERSION erhöhen, damit Geräte die neue Fassung laden.
const VERSION = 'brain-v20';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  // cache: 'reload' umgeht den HTTP-Cache, damit wirklich die neue Fassung gespeichert wird.
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache:'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  // Seitenaufruf: online frisch laden (max. 3 s), sonst aus dem Cache.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        const res = await fetch(req.url, { signal: ctrl.signal, credentials: 'same-origin', cache: 'no-cache' });
        clearTimeout(timer);
        if (res.ok) (await caches.open(VERSION)).put('./index.html', res.clone());
        return res;
      } catch {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Übrige Dateien: zuerst Cache, dann Netz.
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
