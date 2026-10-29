/**
 * The web app, served by the server itself when its build is there (`UNLEASE_WEB_DIR`, set in the
 * image): one address for the app and its API, so nothing needs CORS. A file by its path; any
 * other address outside `/api` gets the app's page, whose own router reads it. Hashed assets are
 * cached for good, the page and the service worker never. The headers are the ones a static host
 * would send (`web/notes/public/_headers`), so the app is as safe served here as anywhere else.
 */
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, posix, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import type { Context, MiddlewareHandler } from 'hono';

/** As `web/notes/public/_headers`: the API may be another origin (chosen in the app), so `connect-src` allows any https one. */
const HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data: https:; media-src 'self' blob: https:; frame-src blob: https://www.youtube-nocookie.com https://player.vimeo.com https://www.dailymotion.com; font-src 'self'; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
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

/** Their names change with their content (Vite's hashes, the fonts' versions). */
const IMMUTABLE = /^\/(?:assets|fonts)\//;

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

/** The middleware serving the app from `dir`, or null when there is no build there (the server then answers the API alone). */
export function webApp(dir: string | null): MiddlewareHandler | null {
  if (!dir) return null;
  const root = resolve(dir);
  const index = join(root, 'index.html');
  if (!existsSync(index)) return null;
  const page = readFileSync(index);
  return async (c, next) => {
    const path = c.req.path;
    if ((c.req.method !== 'GET' && c.req.method !== 'HEAD') || path === '/api' || path.startsWith('/api/')) return next();
    for (const [name, value] of Object.entries(HEADERS)) c.header(name, value);
    const file = path === '/' ? null : fileUnder(root, path);
    if (file) {
      const info = await stat(file).catch(() => null);
      if (info?.isFile()) return send(c, file, info.size, IMMUTABLE.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache');
      // A file that is not there (an old asset after an update) is not the app's page.
      if (extname(path)) return c.text('Not found', 404);
    }
    c.header('Cache-Control', 'no-cache');
    if (c.req.method === 'HEAD') return c.body(null, 200, { 'Content-Type': TYPES['.html']!, 'Content-Length': String(page.length) });
    return c.body(page, 200, { 'Content-Type': TYPES['.html']! });
  };
}
