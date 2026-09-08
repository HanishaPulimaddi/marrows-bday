/* ============================================================================
   Push service worker (scope: /)

   No fetch handler on purpose - this worker exists only to receive pushes, and
   the app under /app/ has its own worker for offline.
   ============================================================================ */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

/* EVERY push event has to end in a showNotification() call. If a push arrives
   and nothing is shown, Chrome counts it against the origin and will eventually
   revoke the subscription - so a malformed or empty payload still gets a
   notification, just a generic one. */
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let title = 'Reminder';
    let options = {
      body: 'You have something to look at.',
      icon: '/app/icons/icon-192.png',
      badge: '/app/icons/icon-192.png',
      tag: 'pushtest',
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
        if (payload.url) options.data.url = payload.url;
      }
    } catch (err) {
      /* keep the fallback title and body; showing something beats showing nothing */
      console.warn('[sw] push payload was not usable:', err);
    }

    try {
      await self.registration.showNotification(title, options);
    } catch (err) {
      /* last resort: if the options were somehow rejected, show the barest thing */
      console.warn('[sw] showNotification failed, retrying bare:', err);
      await self.registration.showNotification('Reminder');
    }
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/app';

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of windows){
      if (new URL(client.url).pathname.startsWith('/app')){
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
