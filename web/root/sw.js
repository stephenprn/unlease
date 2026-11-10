/**
 * Retires the service worker of the web app as it was before each app had its own (one worker for
 * the whole site, at `/sw.js`): it empties that worker's caches, unregisters itself and reloads
 * the pages it held, which then load from the network under their app's own worker
 * (`/notes/sw.js`, `/pages/sw.js`). A browser checks for this file on its own, so nothing else
 * has to happen for it to run.
 */
self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (/^shell-v\d+$/.test(key)) await caches.delete(key);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: 'window' })) void client.navigate(client.url);
    })(),
  );
});
