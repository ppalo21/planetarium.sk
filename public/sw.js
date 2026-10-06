// Vesmír na dosah – offline režim.
// Stránka a obsah (content/*.json) sa berú najprv z internetu, aby sa zmeny prejavili hneď;
// obrázky, modely, písma a skripty sa po prvom načítaní berú z pamäte okuliarov.
const CACHE = 'vesmir-na-dosah-v2';
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './index.html', './manifest.json']))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const fresh = req.mode === 'navigate' || req.destination === 'document' || /\/content\/.*\.json$/.test(new URL(req.url).pathname);
  const put = r => { if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); } return r; };
  if (fresh) { e.respondWith(fetch(req).then(put).catch(() => caches.match(req).then(h => h || caches.match('./index.html')))); return; }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(put)));
});
