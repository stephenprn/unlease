/**
 * The offline shell: the app opens without a network, then works from IndexedDB as always.
 * The page: network first, the last copy when offline (every route is the same page). Hashed
 * assets and fonts: from the cache once fetched, since their names change with their content.
 * Never another origin: the server is one, and its answers are not for keeping.
 */
const SHELL = 'shell-v1';
const KEPT = /^\/(?:assets|fonts)\/|\.(?:svg|png|webmanifest)$/;
/** Drawn by the styles or the browser, never named in the page. */
const EXTRAS = ['/grain.png', '/favicon.svg', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      const page = await fetch('/', { cache: 'no-cache' });
      if (!page.ok) return;
      // The scripts and styles the page names, so the first offline start has them all.
      const html = await page.clone().text();
      const assets = [...html.matchAll(/(?:src|href)="(\/(?:assets|fonts)\/[^"]+)"/g)].map(match => match[1]);
      await cache.put('/', page);
      await cache.addAll(assets);
      await Promise.allSettled(EXTRAS.map(path => cache.add(path)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== SHELL) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

function keep(request, response) {
  if (!response.ok) return;
  const copy = response.clone();
  void caches.open(SHELL).then(cache => cache.put(request, copy));
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Served by the server itself, the API shares this origin: its answers (an archive by link) are never the app's page.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          keep('/', response);
          return response;
        })
        .catch(async () => (await caches.match('/', { ignoreVary: true })) ?? Response.error()),
    );
    return;
  }
  if (!KEPT.test(url.pathname)) return;
  // `ignoreVary`: the page asks for its scripts in CORS mode, the install did not; the bytes are the same.
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then(
      cached =>
        cached ??
        fetch(request).then(response => {
          keep(request, response);
          return response;
        }),
    ),
  );
});
