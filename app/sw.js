/* ============================================================================
   Lists — service worker

   BUMP THIS ON EVERY DEPLOY. A stale service worker is the single most likely
   thing to waste an afternoon: the version string is what forces the new shell
   to install and the old caches to be thrown away.
   ============================================================================ */
const VERSION = 'v1';

const SHELL_CACHE = `lists-shell-${VERSION}`;
const FONT_CACHE  = `lists-fonts-${VERSION}`;

const SHELL = [
  '/app/',
  '/app/index.html',
  '/app/app.css',
  '/app/app.js',
  '/app/vendor/idb.js',
  '/app/manifest.json',
  '/app/icons/icon-192.png',
  '/app/icons/icon-512.png'
];

const isFont = url =>
  url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Precaching is best effort. If waitUntil rejects the worker goes redundant
    // and we end up with NO service worker - worse than an uncached shell, and
    // it would take push down with it. CacheStorage can fail for real reasons:
    // private browsing, storage pressure, a locked profile.
    try {
      const cache = await caches.open(SHELL_CACHE);
      // addAll is all-or-nothing; one 404 would leave the app with no shell
      await Promise.all(SHELL.map(async path => {
        try { await cache.add(new Request(path, { cache: 'reload' })); }
        catch (err) { console.warn('[sw] could not precache', path, err); }
      }));
    } catch (err) {
      console.warn('[sw] cache storage unavailable, running without a shell', err);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const keep  = new Set([SHELL_CACHE, FONT_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.map(n => keep.has(n) ? null : caches.delete(n)));
    } catch (err) {
      console.warn('[sw] could not sweep old caches', err);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // navigations: serve the cached shell first so a cold offline start works
  if (req.mode === 'navigate' && url.origin === location.origin) {
    event.respondWith((async () => {
      const cached = await safeMatch('/app/index.html');
      if (cached) {
        refresh(req, SHELL_CACHE);   // freshen in the background
        return cached;
      }
      try { return await fetch(req); }
      catch { return new Response('Offline', { status: 503, statusText: 'Offline' }); }
    })());
    return;
  }

  // Google Fonts: cache-first, so the type survives offline
  if (isFont(url)) {
    event.respondWith((async () => {
      const hit = await safeMatch(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') safePut(FONT_CACHE, req, res.clone());
        return res;
      } catch {
        return Response.error();
      }
    })());
    return;
  }

  // our own assets: cache-first with a background refresh
  if (url.origin === location.origin && url.pathname.startsWith('/app/')) {
    event.respondWith((async () => {
      const cached = await safeMatch(req);
      if (cached) { refresh(req, SHELL_CACHE); return cached; }
      try {
        const res = await fetch(req);
        if (res.ok) safePut(SHELL_CACHE, req, res.clone());
        return res;
      } catch {
        return Response.error();
      }
    })());
  }
});

function refresh(request, cacheName){
  fetch(request)
    .then(res => { if (res && res.ok) safePut(cacheName, request, res.clone()); })
    .catch(() => { /* offline: the cached copy stands */ });
}

/* CacheStorage can throw outright; a failed cache read must degrade to a
   network fetch, never to a broken page. */
async function safeMatch(request){
  try { return await caches.match(request); }
  catch (err){ console.warn('[sw] cache match failed', err); return undefined; }
}

async function safePut(cacheName, request, response){
  try { (await caches.open(cacheName)).put(request, response); }
  catch (err){ console.warn('[sw] cache put failed', err); }
}
