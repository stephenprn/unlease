/**
 * The HTTP API: the platform's routes (sync, files, settings, the Administration) and each app's
 * own (`apps/`), answered only while that app is on (`ServerSettings.apps`: 404 otherwise). Everything is JSON except blob bytes, archives and calendars; everything needs the bearer
 * token except the health check, a download by ticket (the ticket is the key), an app's public
 * routes (Agenda's published calendar, its secret in its address) and CORS preflights,
 * which browsers send without it. With a web app's build at hand (`UNLEASE_WEB_DIR`), it also
 * serves the app outside `/api` (`http/web.ts`).
 */
import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { APPS } from '@unlease/core/apps';
import { isRestoreMode } from '@unlease/core/sync/admin';
import { API_VERSION, parseSyncRequest } from '@unlease/core/sync/protocol';
import { isValidId } from '@unlease/core/sync/schema';
import pkg from '../package.json' with { type: 'json' };
import type { Administration } from './admin';
import type { Env, ServerApp } from './apps/types';
import { archiveName, SNAPSHOT_NAME } from './backup/archive';
import { GLACIER_WAIT, isFrozen, s3Problem } from './backup/s3';
import { processUpload, UnsupportedImageError } from './blobs/images';
import type { BlobInfo, BlobStore } from './blobs/store';
import type { Config, ProxyHeader } from './config';
import { AuthGuard } from './http/auth';
import { webApp } from './http/web';
import { log } from './log';
import type { SettingsStore } from './settings/store';
import { applySettingsPatch, defaultChecks, type ListModels, type SettingsChecks } from './settings/update';
import type { SyncService } from './sync/service';

const MB = 1024 * 1024;
const JSON_LIMIT = 1 * MB;
/** Room for any one valid record with the bases of its typed text, however escaped: a device sends at least one per push. */
const SYNC_LIMIT = 4 * MB;
const UPLOAD_LIMIT = 25 * MB;
/** A page's video, PDF or file: Cloudflare refuses a larger request anyway (`MAX_FILE_BYTES` in core). */
const FILE_LIMIT = 100 * MB;
/** Types served as they were sent; anything else (HTML, SVG, scripts) goes out as bytes to save, never to render on the API's origin. */
const SERVED_AS_IS = /^(?:image\/(?:jpeg|png|webp|gif|avif|heic)|video\/[a-z0-9.+-]+|audio\/[a-z0-9.+-]+|application\/pdf|text\/plain)$/;
/** An archive to restore. Cloudflare's tunnel refuses a request over 100 MB anyway: a big one goes through the LAN or S3. */
const RESTORE_LIMIT = 2048 * MB;
/** A multipart archive (the phone's) is parsed in memory. */
const MULTIPART_RESTORE_LIMIT = 200 * MB;

export const VERSION: string = pkg.version;

export interface AppOptions {
  readonly config: Pick<Config, 'token' | 'corsOrigins'> & Partial<Pick<Config, 'webDir' | 'trustedProxyHeader'>>;
  readonly sync: SyncService;
  readonly blobs: BlobStore;
  readonly settings: SettingsStore;
  /** The apps this server can run (`apps/registry.ts`): their routes beside the platform's, each while it is on. */
  readonly apps?: readonly ServerApp[];
  /** Routes the apps share, served whatever is on (Claude's spending). */
  readonly routes?: (app: Hono<Env>) => void;
  /** How a new Claude key is checked before it is stored. */
  readonly listModels?: ListModels;
  /** How new keys, buckets and drives are tried before they are stored. */
  readonly checks?: Partial<SettingsChecks>;
  /** Backups, the drive, restores; without it the admin routes answer 501. */
  readonly admin?: Administration;
  readonly now?: () => number;
  /** True once the server is shutting down: requests are refused, and their connections closed. */
  readonly stopping?: () => boolean;
}

/** Longer than any address: a header's value is cut to this before it keys the brake. */
const MAX_ADDRESS = 64;

/**
 * The client's address, for the brake on wrong tokens: the connection's own, which nobody can forge,
 * unless `UNLEASE_TRUSTED_PROXY_HEADER` names the header the proxy in front sets to it (behind a
 * proxy the connection is the proxy's). Of `X-Forwarded-For`, the last entry: the one the nearest
 * proxy, the trusted one, appended; what comes before it is the client's to write.
 */
export function clientAddress(c: Context<Env>, trusted: ProxyHeader | null): string {
  if (trusted) {
    const raw = c.req.header(trusted);
    const value = (trusted === 'x-forwarded-for' ? raw?.split(',').at(-1) : raw)?.trim();
    if (value) return value.slice(0, MAX_ADDRESS);
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

const blobJson = (info: BlobInfo) => ({ id: info.id, mime: info.mime, width: info.width, height: info.height, bytes: info.bytes });

const tooLarge = (c: Context) => c.json({ error: 'body too large' }, 413);

export function createApp(options: AppOptions): Hono<Env> {
  const { config, sync, blobs, settings } = options;
  const checks: SettingsChecks = { ...defaultChecks, ...(options.listModels ? { listModels: options.listModels } : {}), ...options.checks };
  const admin = options.admin;
  const now = options.now ?? Date.now;
  const guard = new AuthGuard(config.token, { now, warn: log.warn });
  const clientIp = (c: Context<Env>) => clientAddress(c, config.trustedProxyHeader ?? null);
  const braked = (c: Context<Env>, ip: string) => {
    guard.recordLimited();
    return c.json({ error: 'too many failed attempts, try again later' }, 429, { 'Retry-After': String(guard.retryAfter(ip)) });
  };
  const app = new Hono<Env>();

  app.onError((error, c) => {
    log.error('request failed', { method: c.req.method, path: c.req.path, error });
    return c.json({ error: 'internal error' }, 500);
  });
  app.notFound(c => c.json({ error: 'not found' }, 404));

  app.use(
    '*',
    cors({
      origin: origin => (config.corsOrigins.includes(origin) ? origin : null),
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
      maxAge: 86_400,
    }),
  );

  // Shutting down: a quick refusal that closes the connection, so devices back off instead of asking again at once.
  app.use('*', async (c, next) => {
    if (options.stopping?.()) return c.json({ error: 'server stopping' }, 503, { Connection: 'close', 'Retry-After': '5' });
    return next();
  });

  // What a device learns before it has the token, and needs then: the protocol (a web app finds the
  // server serving it by it), the apps that are on, whether the server's first run is over (the
  // setup's steps) and whether Claude reads links. Not the release: the Administration says it.
  const enabledApps = () => {
    const enabled = settings.enabledApps();
    return (options.apps ?? []).map(one => one.id).filter(id => enabled.includes(id));
  };
  app.get('/api/health', c =>
    c.json({ ok: true, apiVersion: API_VERSION, apps: enabledApps(), setup: settings.setupDone(), analysis: settings.effective().apiKey !== null }),
  );

  // An archive by ticket: a plain link the browser downloads, so no bearer token. A live ticket always
  // opens; an unknown one counts as a wrong guess, and a braked address's guesses are answered 429.
  app.get('/api/downloads/:ticket', async c => {
    const target = admin?.ticket(c.req.param('ticket')) ?? null;
    if (!admin || !target) {
      const ip = clientIp(c);
      if (guard.isLimited(ip)) return braked(c, ip);
      guard.recordFailure({ ip, path: c.req.path.replace(/[^/]+$/, ':ticket') });
      return c.json({ error: 'Lien de téléchargement expiré' }, 404);
    }
    const headers = {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${target.name}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    if (target.kind === 'snapshot') {
      try {
        const { body, size } = await admin.backups.download(target.name, c.req.raw.signal);
        return c.body(body, 200, { ...headers, ...(size > 0 ? { 'Content-Length': String(size) } : {}) });
      } catch (error) {
        if (isFrozen(error)) return c.json({ error: GLACIER_WAIT }, 409);
        return c.json({ error: s3Problem(error) }, 502);
      }
    }
    const stream = new PassThrough();
    admin.backups.full(stream).catch(error => {
      log.error('full archive failed', { error });
      stream.destroy(error instanceof Error ? error : new Error(String(error)));
    });
    return c.body(Readable.toWeb(stream) as ReadableStream<Uint8Array>, 200, headers);
  });

  // What an app serves without the token, its own secret in the address (Agenda's published calendar), while it is on.
  for (const one of options.apps ?? []) {
    if (!one.publicRoutes) continue;
    const own = new Hono<Env>();
    one.publicRoutes(own);
    const gate: MiddlewareHandler<Env> = async (c, next) => (settings.enabledApps().includes(one.id) ? next() : c.json({ error: 'not found' }, 404));
    const paths = new Set<string>();
    for (const { method, path } of own.routes) {
      if (paths.has(`${method} ${path}`)) continue;
      paths.add(`${method} ${path}`);
      app.on(method, path, gate);
    }
    app.route('/', own);
  }

  // The web apps, before the token is asked for: their pages and files are public, their data is not.
  const web = webApp(config.webDir ?? null, () => settings.enabledApps());
  if (web) app.use('*', web);

  // The right token always passes; wrong ones are counted per client address, and a braked address's are answered 429.
  app.use('*', async (c, next) => {
    if (c.req.method === 'OPTIONS') return next();
    if (!guard.verify(c.req.header('authorization'))) {
      const ip = clientIp(c);
      if (guard.isLimited(ip)) return braked(c, ip);
      guard.recordFailure({ ip, path: c.req.path });
      return c.json({ error: 'unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer' });
    }
    c.header('X-Content-Type-Options', 'nosniff');
    return next();
  });

  app.post('/api/sync', bodyLimit({ maxSize: SYNC_LIMIT, onError: tooLarge }), async c => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'body must be JSON' }, 400);
    }
    let parsed: ReturnType<typeof parseSyncRequest>;
    try {
      parsed = parseSyncRequest(body);
    } catch {
      return c.json({ error: 'malformed records' }, 400);
    }
    if (!parsed.request) return c.json({ error: parsed.error ?? 'invalid request' }, 400);
    if (parsed.rejectedFields > 0) {
      log.warn('sync: fields refused by the schema', { node: parsed.request.node, fields: parsed.rejectedFields });
    }
    return c.json(await sync.exchange(parsed.request, c.req.raw.signal));
  });

  app.put('/api/blobs/:id', bodyLimit({ maxSize: UPLOAD_LIMIT, onError: tooLarge }), async c => {
    const id = c.req.param('id');
    if (!isValidId(id)) return c.json({ error: 'invalid blob id' }, 400);
    const existing = blobs.get(id);
    // Already here; one whose original was lost (a power cut, the drive) is taken again.
    if (existing && (await blobs.holdsKept(id))) return c.json(blobJson(existing));

    const type = (c.req.header('content-type') ?? '').toLowerCase();
    let data: Buffer;
    if (type.startsWith('multipart/form-data')) {
      let form: Awaited<ReturnType<typeof c.req.parseBody>>;
      try {
        form = await c.req.parseBody();
      } catch {
        return c.json({ error: 'malformed multipart body' }, 400);
      }
      const file = form.file;
      if (!(file instanceof File)) return c.json({ error: 'multipart body needs a "file" field' }, 400);
      data = Buffer.from(await file.arrayBuffer());
    } else if (type.startsWith('image/') || type.startsWith('application/octet-stream')) {
      data = Buffer.from(await c.req.arrayBuffer());
    } else {
      return c.json({ error: 'send the image bytes (Content-Type: image/*) or multipart/form-data with a "file" field' }, 415);
    }
    if (data.length === 0) return c.json({ error: 'empty body' }, 400);
    if (existing) await blobs.remove(id);

    let processed;
    try {
      processed = await processUpload(data);
    } catch (error) {
      if (error instanceof UnsupportedImageError) return c.json({ error: error.message }, 415);
      throw error;
    }
    const info = await blobs.save(
      {
        id,
        mime: processed.mime,
        width: processed.width,
        height: processed.height,
        bytes: data.length,
        displayMime: processed.display ? 'image/webp' : processed.mime,
        displayBytes: processed.display?.length ?? data.length,
        source: 'upload',
      },
      { display: processed.display, original: data },
    );
    admin?.drive.kick();
    return c.json(blobJson(info));
  });

  // A page's video, PDF or any file: kept as sent, nothing decoded or resized.
  app.put('/api/files/:id', bodyLimit({ maxSize: FILE_LIMIT, onError: tooLarge }), async c => {
    const id = c.req.param('id');
    if (!isValidId(id)) return c.json({ error: 'invalid blob id' }, 400);
    const existing = blobs.get(id);
    if (existing && (await blobs.holdsKept(id))) return c.json(blobJson(existing));
    const type = (c.req.header('content-type') ?? '').toLowerCase();
    let data: Buffer;
    let declared: string;
    if (type.startsWith('multipart/form-data')) {
      let form: Awaited<ReturnType<typeof c.req.parseBody>>;
      try {
        form = await c.req.parseBody();
      } catch {
        return c.json({ error: 'malformed multipart body' }, 400);
      }
      const file = form.file;
      if (!(file instanceof File)) return c.json({ error: 'multipart body needs a "file" field' }, 400);
      data = Buffer.from(await file.arrayBuffer());
      declared = file.type.toLowerCase();
    } else {
      data = Buffer.from(await c.req.arrayBuffer());
      declared = type.split(';')[0]!.trim();
    }
    if (data.length === 0) return c.json({ error: 'empty body' }, 400);
    if (existing) await blobs.remove(id);
    const mime = SERVED_AS_IS.test(declared) ? declared : 'application/octet-stream';
    const info = await blobs.save(
      { id, mime, width: 0, height: 0, bytes: data.length, displayMime: mime, displayBytes: data.length, source: 'upload' },
      { display: null, original: data },
    );
    admin?.drive.kick();
    return c.json(blobJson(info));
  });

  app.get('/api/blobs/:id', async c => {
    const id = c.req.param('id');
    const variant = c.req.query('variant') ?? 'display';
    if (variant !== 'display' && variant !== 'original') return c.json({ error: 'variant must be display or original' }, 400);
    const file = isValidId(id) ? await blobs.open(id, variant) : null;
    if (!file) return c.json({ error: 'not found' }, 404);
    const etag = `"${id}.${file.variant === 'display' ? 'd' : 'o'}.${file.size}"`;
    const headers = {
      'Cache-Control': 'private, max-age=31536000, immutable',
      ETag: etag,
      'Content-Type': file.mime,
      'Content-Security-Policy': "default-src 'none'; sandbox",
    };
    const ifNoneMatch = c.req.header('if-none-match');
    if (ifNoneMatch && ifNoneMatch.split(',').some(tag => tag.trim().replace(/^W\//, '') === etag)) {
      return c.body(null, 304, headers);
    }
    const bytes = await file.read(c.req.raw.signal);
    return c.body(bytes.body, 200, { ...headers, 'Content-Length': String(bytes.size) });
  });

  // Each app's own routes, behind the same token, while it is on: a gate goes before each of its routes.
  for (const one of options.apps ?? []) {
    if (!one.routes) continue;
    const own = new Hono<Env>();
    one.routes(own);
    const off = `${APPS[one.id].name} n’est pas activé sur ce serveur`;
    const gate: MiddlewareHandler<Env> = async (c, next) => (settings.enabledApps().includes(one.id) ? next() : c.json({ error: off }, 404));
    const paths = new Set<string>();
    for (const { method, path } of own.routes) {
      if (paths.has(`${method} ${path}`)) continue;
      paths.add(`${method} ${path}`);
      app.on(method, path, gate);
    }
    app.route('/', own);
  }
  options.routes?.(app);

  const noStore = { 'Cache-Control': 'no-store' };
  app.get('/api/settings', c => c.json(settings.view(), 200, noStore));

  app.put('/api/settings', bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }), async c => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Requête invalide' }, 400);
    }
    const outcome = await applySettingsPatch(settings, body, checks);
    if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
    // Field names only: keys and secrets are never logged.
    log.info('settings changed', { fields: Object.keys(body as object).filter(name => ['apps', 'setupDone', 'anthropicApiKey', 'model', 'budgetUsd', 'pages', 'calendar', 'backup', 'drive', 'seerr'].includes(name)) });
    // A drive just set, or being turned off: its first pass now.
    if ('drive' in (body as object)) void admin?.drive.run();
    return c.json(settings.view(), 200, noStore);
  });

  const noAdmin = (c: Context) => c.json({ error: 'L’administration n’est pas disponible sur ce serveur' }, 501);

  app.get('/api/admin', c => (admin ? c.json(admin.status(), 200, noStore) : noAdmin(c)));

  app.get('/api/admin/backups', async c => {
    if (!admin) return noAdmin(c);
    if (!settings.backup()) return c.json({ error: 'Sauvegarde S3 non configurée' }, 409);
    try {
      return c.json({ snapshots: await admin.backups.list() }, 200, noStore);
    } catch (error) {
      return c.json({ error: s3Problem(error) }, 502);
    }
  });

  app.post('/api/admin/backups', c => {
    if (!admin) return noAdmin(c);
    if (!settings.backup()) return c.json({ error: 'Sauvegarde S3 non configurée' }, 409);
    if (!admin.backups.hasData()) return c.json({ error: 'Le serveur est vide : rien à sauvegarder pour l’instant' }, 409);
    if (admin.restore.running) return c.json({ error: 'Une restauration est en cours : la sauvegarde attendra' }, 409);
    void admin.backups.run('manual');
    return c.json(admin.status(), 202, noStore);
  });

  app.post('/api/admin/drive/sync', c => {
    if (!admin) return noAdmin(c);
    if (!settings.drive()) return c.json({ error: 'Seafile n’est pas relié' }, 409);
    void admin.drive.run();
    return c.json(admin.status(), 202, noStore);
  });

  // A snapshot from S3 (JSON `{ snapshot }`), or an archive: its bytes as the body (web) or a multipart `file` (phone).
  app.post('/api/admin/restore', bodyLimit({ maxSize: RESTORE_LIMIT, onError: tooLarge }), async c => {
    if (!admin) return noAdmin(c);
    const busy = () => c.json({ error: 'Une restauration est déjà en cours' }, 409);
    if (admin.restore.running) return busy();
    const mode = c.req.query('mode') ?? 'merge';
    if (!isRestoreMode(mode)) return c.json({ error: 'Mode de restauration inconnu' }, 400);
    const type = (c.req.header('content-type') ?? '').toLowerCase();
    if (type.startsWith('application/json')) {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: 'Requête invalide' }, 400);
      }
      const name = (body as { snapshot?: unknown } | null)?.snapshot;
      if (typeof name !== 'string' || !SNAPSHOT_NAME.test(name)) return c.json({ error: 'Sauvegarde inconnue' }, 400);
      if (!settings.backup()) return c.json({ error: 'Sauvegarde S3 non configurée' }, 409);
      if (!admin.restore.start({ kind: 's3', name }, mode)) return busy();
      return c.json(admin.status(), 202, noStore);
    }
    const path = join(admin.tmpDir, `upload-${randomBytes(6).toString('hex')}.tar.gz`);
    let name = 'archive.tar.gz';
    try {
      if (type.startsWith('multipart/form-data')) {
        // Parsed in memory: a big archive goes as the raw body (the web) or through S3.
        if (Number(c.req.header('content-length') ?? 0) > MULTIPART_RESTORE_LIMIT) return c.json({ error: 'Archive trop grosse pour être envoyée d’ici : restaurez-la depuis le web ou depuis S3' }, 413);
        const form = await c.req.parseBody();
        const file = form.file;
        if (!(file instanceof File)) return c.json({ error: 'multipart body needs a "file" field' }, 400);
        name = file.name || name;
        await pipeline(Readable.fromWeb(file.stream()), createWriteStream(path));
      } else if (c.req.raw.body) {
        await pipeline(Readable.fromWeb(c.req.raw.body), createWriteStream(path));
      }
      const size = (await stat(path).catch(() => null))?.size ?? 0;
      if (size === 0) {
        await rm(path, { force: true });
        return c.json({ error: 'Archive vide' }, 400);
      }
    } catch (error) {
      await rm(path, { force: true });
      throw error;
    }
    if (!admin.restore.start({ kind: 'file', path, name }, mode)) {
      await rm(path, { force: true });
      return busy();
    }
    return c.json(admin.status(), 202, noStore);
  });

  app.post('/api/admin/downloads', bodyLimit({ maxSize: JSON_LIMIT, onError: tooLarge }), async c => {
    if (!admin) return noAdmin(c);
    let body: { full?: unknown; snapshot?: unknown } | null;
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ error: 'Requête invalide' }, 400);
    }
    if (body?.full === true) {
      const name = archiveName(now(), true);
      return c.json({ url: `/api/downloads/${admin.issueTicket({ kind: 'full', name })}`, name }, 200, noStore);
    }
    const snapshot = body?.snapshot;
    if (typeof snapshot !== 'string' || !SNAPSHOT_NAME.test(snapshot)) return c.json({ error: 'Sauvegarde inconnue' }, 400);
    if (!settings.backup()) return c.json({ error: 'Sauvegarde S3 non configurée' }, 409);
    // One asleep in cold storage (Glacier) is asked out, and downloaded hours later.
    try {
      if (!(await admin.backups.readyToDownload(snapshot))) return c.json({ error: GLACIER_WAIT }, 409, noStore);
    } catch (error) {
      return c.json({ error: s3Problem(error) }, 502);
    }
    return c.json({ url: `/api/downloads/${admin.issueTicket({ kind: 'snapshot', name: snapshot })}`, name: snapshot }, 200, noStore);
  });

  return app;
}
