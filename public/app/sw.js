/* ============================================================================
   Lists — service worker

   BUMP THIS ON EVERY DEPLOY. A stale service worker is the single most likely
   thing to waste an afternoon: the version string is what forces the new shell
   to install and the old caches to be thrown away.
   ============================================================================ */
const VERSION = 'v3';

const SHELL_CACHE = `lists-shell-${VERSION}`;
const FONT_CACHE  = `lists-fonts-${VERSION}`;

const SHELL = [
  /* NOT '/app/index.html' - Cloudflare's asset server 307s it to '/app/', and a
     cached redirected response cannot be returned for a navigation. */
  '/app/',
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

/* ============================================================================
   Push

   The app subscribes through THIS registration, so reminder pushes land here.

   EVERY push event has to end in a showNotification() call. A push that shows
   nothing counts against the origin and Chrome will eventually revoke the
   subscription - so a malformed or empty payload still gets a notification,
   just a generic one.
   ============================================================================ */
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let title = 'Reminder';
    let options = {
      body: 'You have something due.',
      icon: '/app/icons/icon-192.png',
      badge: '/app/icons/icon-192.png',
      tag: 'reminder',
      renotify: true,
      data: { url: '/app' }
    };

    try {
      const raw = event.data ? event.data.text() : '';
      if (raw){
        const payload = JSON.parse(raw);
        if (typeof payload.title === 'string' && payload.title.trim())
          title = payload.title.trim();
        if (typeof payload.body === 'string' && payload.body.trim())
          options.body = payload.body.trim();
        /* the note id, so a re-send replaces rather than stacks */
        if (typeof payload.tag === 'string' && payload.tag) options.tag = payload.tag;
        if (payload.url) options.data.url = payload.url;
      }
    } catch (err) {
      console.warn('[sw] push payload was not usable:', err);
    }

    try {
      await self.registration.showNotification(title, options);
    } catch (err) {
      console.warn('[sw] showNotification failed, retrying bare:', err);
      await self.registration.showNotification(title);
    }
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/app';

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows){
      if (new URL(client.url).pathname.startsWith('/app')){
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // navigations: serve the cached shell first so a cold offline start works
  if (req.mode === 'navigate' && url.origin === location.origin) {
    event.respondWith((async () => {
      const cached = await safeMatch('/app/');
      if (cached) {
        refresh(req, SHELL_CACHE);   // freshen in the background
        return stripRedirect(cached);
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
        if (res.ok && !res.redirected) safePut(SHELL_CACHE, req, res.clone());
        return res;
      } catch {
        return Response.error();
      }
    })());
  }
});

function refresh(request, cacheName){
  fetch(request)
    .then(res => { if (res && res.ok && !res.redirected) safePut(cacheName, request, res.clone()); })
    .catch(() => { /* offline: the cached copy stands */ });
}

/* Chrome rejects a navigation answered with a response whose `redirected` flag
   is set - "a response served by a service worker has redirections". Rebuilding
   the response drops the flag while keeping the body and headers. */
async function stripRedirect(res){
  if (!res || !res.redirected) return res;
  const body = await res.arrayBuffer();
  return new Response(body, {
    status: res.status, statusText: res.statusText, headers: res.headers
  });
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
