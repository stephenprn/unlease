/**
 * An app's offline shell (each web app has its own, at `/notes/sw.js`, `/pages/sw.js`, its scope
 * its own path, `/notes` itself included): the app opens without a network, then works from IndexedDB as always.
 * The page: network first, the last copy when offline (every place of the app is the same page). Hashed
 * assets and fonts: from the cache once fetched, since their names change with their content.
 * Never another origin, nor another app's path: the server is one, and its answers are not for keeping.
 */
/** The app's path (`/notes`), and its folder (`/notes/`): its page is kept under the folder's address. */
const HOME = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const SCOPE = `${HOME}/`;
const SHELL = `shell-v3:${SCOPE}`;
const ESCAPED = SCOPE.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
const KEPT = new RegExp('^' + ESCAPED + '(?:(?:assets|fonts)/|[^/]*\\.(?:svg|png|webmanifest)$)');
/** Drawn by the styles or the browser, never named in the page. */
const EXTRAS = ['grain.png', 'ground-grain.png', 'favicon.svg', 'icon.svg', 'manifest.webmanifest'].map(name => `${SCOPE}${name}`);

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      const page = await fetch(SCOPE, { cache: 'no-cache' });
      if (!page.ok) return;
      // The scripts and styles the page names, so the first offline start has them all.
      const html = await page.clone().text();
      const assets = [...html.matchAll(/(?:src|href)="([^"]+\/(?:assets|fonts)\/[^"]+)"/g)].map(match => match[1]).filter(path => path.startsWith(SCOPE));
      await cache.put(SCOPE, page);
      await cache.addAll(assets);
      await Promise.allSettled(EXTRAS.map(path => cache.add(path)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      // This app's older shells only: the other app's worker keeps its own.
      for (const key of await caches.keys()) if (key !== SHELL && key.endsWith(`:${SCOPE}`)) await caches.delete(key);
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
  if (url.origin !== self.location.origin || (url.pathname !== HOME && !url.pathname.startsWith(SCOPE))) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // A redirect (an old address sent to its place) is not this app's page.
          if (!response.redirected) keep(SCOPE, response);
          return response;
        })
        .catch(async () => (await caches.match(SCOPE, { ignoreVary: true })) ?? Response.error()),
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

// ── reminders pushed by the server (Agenda's: `/api/calendar/push`) ──────────

/**
 * A push carries `{ title, body, path, tag }`: shown as a notification, its tap opening `path` in this
 * app. It stays on screen until it is dismissed or tapped (a computer's browser otherwise lets it fade
 * in seconds, unseen by someone away from the keyboard); the same reminder pushed twice (the server
 * restarted) replaces the first, quietly.
 */
self.addEventListener('push', event => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : '' };
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'Rappel';
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    tag: typeof data.tag === 'string' ? data.tag : undefined,
    requireInteraction: true,
    icon: `${SCOPE}icon.svg`,
    data: { path: typeof data.path === 'string' && data.path.startsWith('/') ? data.path : HOME },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  // The path is the server's (`/agenda/event/…`); the suite may be served under a base (the scope's path before the app's own).
  const path = event.notification.data?.path ?? HOME;
  const appPath = `/${HOME.split('/').pop()}`;
  const base = HOME.slice(0, HOME.length - appPath.length);
  const target = new URL(`${base}${path}`, self.location.origin).href;
  event.waitUntil(
    (async () => {
      for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
        if (client.url.startsWith(`${self.location.origin}${HOME}`) && 'focus' in client) {
          await client.navigate(target).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});

