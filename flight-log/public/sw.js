// Flight Log service worker — offline support and faster repeat visits.
// App files are cached as they're used; pages load from the network first so a new
// deploy is picked up immediately, falling back to the cache when offline.
const VERSION = '__BUILD__';
const APP = `fl-app-${VERSION}`;
const DATA = 'fl-data-v1';
const PHOTOS = 'fl-photos-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './favicon.svg'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('fl-app-') && k !== APP) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // aviation photography: cache first, keep the most recent 60
  if (url.hostname === 'images.unsplash.com') {
    e.respondWith((async () => {
      const c = await caches.open(PHOTOS);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trim(PHOTOS, 60); }
        return res;
      } catch { return hit || Response.error(); }
    })());
    return;
  }
  if (url.origin !== self.location.origin) return;

  // pages: network first
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { caches.open(APP).then((c) => c.put('./index.html', res.clone())); return res; }).catch(async () => (await caches.match('./index.html')) || Response.error()));
    return;
  }
  // airport / airline data: stale while revalidate
  if (url.pathname.includes('/data/')) {
    e.respondWith((async () => {
      const c = await caches.open(DATA);
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })());
    return;
  }
  // hashed build assets and icons: cache first
  e.respondWith((async () => {
    const c = await caches.open(APP);
    const hit = await c.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) c.put(req, res.clone());
    return res;
  })());
});
