// Vesmír na dosah – offline režim.
// • Stránka a obsah (content/*.json) sa berú najprv z internetu, aby sa zmeny prejavili hneď.
// • Obrázky, modely, písma, skripty a video sa po prvom načítaní berú z pamäte okuliarov.
//   Na pozadí sa raz overí, či sa súbor na serveri nezmenil; ak áno, stiahne sa nová verzia (použije sa pri ďalšom otvorení).
// Názov pamäte musí byť rovnaký ako CACHE v src/core/app.ts.
const CACHE = 'vesmir-na-dosah-v2';
const checked = new Set();

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './index.html', './manifest.json']))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))); self.clients.claim(); });

const stamp = r => r.headers.get('last-modified') || (r.headers.get('etag') || '').replace(/^W\//, '').replace(/-gzip/, '');
const put = (key, r) => { if (r.status === 200) { const c = r.clone(); caches.open(CACHE).then(x => x.put(key, c)).catch(() => {}); } return r; };
// súbory zostavenej appky majú v názve odtlačok obsahu (index-AbC123xy.js) – nikdy sa nemenia
const hashed = url => /\/js\/[^/]+-[\w-]{8}\.\w+$/.test(url);

/** Raz za spustenie overí, či sa súbor na serveri nezmenil. */
async function refresh(url, hit) {
  if (checked.has(url) || hashed(url)) return;
  checked.add(url);
  try {
    const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (head.ok && stamp(head) && stamp(head) !== stamp(hit)) put(url, await fetch(url, { cache: 'reload' }));
  } catch { /* bez internetu ostáva uložená verzia */ }
}
/** Video si prehliadač pýta po častiach (Range) – z uloženého súboru mu ich vyrežeme. */
async function ranged(e, req) {
  const hit = await caches.match(req.url);
  if (!hit) {
    if (!checked.has(req.url)) { checked.add(req.url); e.waitUntil(fetch(req.url).then(r => put(req.url, r)).catch(() => {})); }   // celé video sa uloží na pozadí
    return fetch(req);
  }
  e.waitUntil(refresh(req.url, hit));
  const buf = await hit.arrayBuffer(), m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '') || [];
  let s = m[1] ? +m[1] : 0, end = m[2] ? Math.min(+m[2], buf.byteLength - 1) : buf.byteLength - 1;
  if (!m[1] && m[2]) { s = Math.max(0, buf.byteLength - +m[2]); end = buf.byteLength - 1; }
  if (s > end) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + buf.byteLength } });
  return new Response(buf.slice(s, end + 1), { status: 206, headers: { 'Content-Range': `bytes ${s}-${end}/${buf.byteLength}`, 'Content-Length': String(end - s + 1), 'Accept-Ranges': 'bytes', 'Content-Type': hit.headers.get('Content-Type') || 'video/mp4' } });
}

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url); if (u.origin !== location.origin) return;
  if (req.cache === 'reload' || req.cache === 'no-store') return;   // výslovné stiahnutie novej verzie (tlačidlo Pripraviť offline)
  if (req.headers.has('range')) { e.respondWith(ranged(e, req)); return; }
  const page = req.mode === 'navigate' || req.destination === 'document';
  if (page || /\/content\/.*\.json$/.test(u.pathname)) {
    e.respondWith(fetch(req).then(r => put(req, r)).catch(() => caches.match(req).then(h => h || (page ? caches.match('./index.html') : Response.error()))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {
    if (hit) { e.waitUntil(refresh(req.url, hit)); return hit; }
    return fetch(req).then(r => put(req, r));
  }));
});
