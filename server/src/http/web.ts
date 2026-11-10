/**
 * The web apps, served by the server itself when their build is there (`UNLEASE_WEB_DIR`, set in the
 * image): one address for the apps and their API, so nothing needs CORS. Each app is a web app of
 * its own, built into its folder (`notes/`, `pages/`) and served under its path (`/notes/…`,
 * `/pages/…`): a file by its path, any other address of the app its page, whose own router reads
 * it. `/` goes to the first app the server runs; an address of the single web app before the suite
 * had its own apps (`/note/<id>`, `/page/<id>`, `/settings`) goes to its place in its app. Hashed
 * assets are cached for good, the pages and the service workers never. The headers are the ones a
 * static host would send (`web/root/_headers`), so the apps are as safe served here as anywhere else.
 */
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, posix, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import type { Context, MiddlewareHandler } from 'hono';

/**
 * As `web/root/_headers` (a test keeps them alike): the API may be another origin (chosen in the
 * app), so `connect-src` allows any https one, but no plain-http or local one: the apps served here
 * reach their API as 'self', and Vite's dev server sends no policy.
 */
export const HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data: https:; media-src 'self' blob: https:; frame-src blob: https://www.youtube-nocookie.com https://player.vimeo.com https://www.dailymotion.com; font-src 'self'; connect-src 'self' https:; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  'Strict-Transport-Security': 'max-age=31536000',
};

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** The apps with a web app of their own, in the suite's order (their ids, as `appsOn` names them). */
export const WEB_APPS = ['notes', 'pages', 'contacts', 'calendar'] as const;

type WebApp = (typeof WEB_APPS)[number];

/** Each one's folder in the build and path on the server: its id, but Agenda's `agenda` (as the web build's `WEB_PATHS`). */
const PATHS: Readonly<Record<WebApp, string>> = { notes: 'notes', pages: 'pages', contacts: 'contacts', calendar: 'agenda' };

/** Their names change with their content (Vite's hashes, the fonts' versions). */
const IMMUTABLE = /^\/(?:notes|pages|contacts|agenda)\/(?:assets|fonts)\//;

/** The site's root holds one file: the worker that retires the single app's (`web/root/sw.js`). */
const ROOT_FILES: ReadonlySet<string> = new Set(['/sw.js']);

/** The file a request path names under `root`, or null when it is no plain path inside it. */
function fileUnder(root: string, path: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const normalized = posix.normalize(decoded);
  if (normalized.split('/').includes('..')) return null;
  const file = resolve(join(root, normalized));
  return file === root || file.startsWith(root + sep) ? file : null;
}

function send(c: Context, file: string, size: number, cache: string): Response {
  const headers = {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': String(size),
    'Cache-Control': cache,
  };
  if (c.req.method === 'HEAD') return c.body(null, 200, headers);
  return c.body(Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>, 200, headers);
}

/** The app an address belongs to (`/notes`, `/notes/…`). */
function appOf(path: string): WebApp | null {
  const match = /^\/([a-z]+)(?:\/|$)/.exec(path);
  return match ? (WEB_APPS.find(app => PATHS[app] === match[1]) ?? null) : null;
}

/** Where an address of the single web app the suite had before (v0.1) lives now: a page in Pages, anything else in Carnet. */
function movedTo(path: string): string {
  return path.startsWith('/page/') ? `/pages/${path.slice('/page/'.length)}` : `/notes${path}`;
}

/**
 * The middleware serving the apps from `dir` (`dir/notes/index.html`, `dir/pages/index.html`), or
 * null when there is no build there (the server then answers the API alone). `appsOn`: the apps the
 * server runs, in the suite's order, for where `/` goes.
 */
export function webApp(dir: string | null, appsOn: () => readonly string[] = () => WEB_APPS): MiddlewareHandler | null {
  if (!dir) return null;
  const root = resolve(dir);
  const pages = new Map<WebApp, Buffer>();
  for (const app of WEB_APPS) {
    const index = join(root, PATHS[app], 'index.html');
    if (existsSync(index)) pages.set(app, readFileSync(index));
  }
  if (pages.size === 0) return null;
  /** The first app on that has a page here, else the first that has one. */
  const home = (): WebApp => (WEB_APPS.find(app => pages.has(app) && appsOn().includes(app)) ?? [...pages.keys()][0]!);

  return async (c, next) => {
    const path = c.req.path;
    // The API, and Agenda's published calendar (`/ical/<secret>.ics`), are the server's own answers.
    if ((c.req.method !== 'GET' && c.req.method !== 'HEAD') || path === '/api' || path.startsWith('/api/') || path.startsWith('/ical/')) return next();
    for (const [name, value] of Object.entries(HEADERS)) c.header(name, value);
    const query = new URL(c.req.url).search;
    if (path === '/') return c.redirect(`/${PATHS[home()]}${query}`, 302);
    const app = appOf(path);
    if (!app) {
      if (ROOT_FILES.has(path)) {
        const file = join(root, path.slice(1));
        const info = await stat(file).catch(() => null);
        if (info?.isFile()) return send(c, file, info.size, 'no-cache');
      }
      // A file that is not there is no place to move to.
      if (extname(path)) return c.text('Not found', 404);
      return c.redirect(`${movedTo(path)}${query}`, 301);
    }
    const page = pages.get(app);
    // An app whose build is not here: nothing to serve (the API's own answer follows).
    if (!page) return next();
    const file = fileUnder(root, path);
    if (file && file !== join(root, PATHS[app])) {
      const info = await stat(file).catch(() => null);
      if (info?.isFile()) {
        // The app's worker holds its whole path, `/notes` included (`start.tsx` registers it so).
        if (path === `/${PATHS[app]}/sw.js`) c.header('Service-Worker-Allowed', `/${PATHS[app]}`);
        return send(c, file, info.size, IMMUTABLE.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache');
      }
      // A file that is not there (an old asset after an update) is not the app's page.
      if (extname(path)) return c.text('Not found', 404);
    }
    c.header('Cache-Control', 'no-cache');
    if (c.req.method === 'HEAD') return c.body(null, 200, { 'Content-Type': TYPES['.html']!, 'Content-Length': String(page.length) });
    return c.body(new Uint8Array(page), 200, { 'Content-Type': TYPES['.html']! });
  };
}
