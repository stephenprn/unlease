/**
 * `/api/immich/…`: Immich for every app, behind the server's token like the rest of the API, while
 * the Administration has it linked (409 otherwise). Its pictures pass through the server, so no
 * device holds Immich's key or needs to reach it; a person's face can become one of the server's own
 * blobs (`POST /api/immich/people/:id/photo`), which a contact then wears as any photo, offline too.
 */
import type { Context, Hono } from 'hono';
import { createId } from '@unlease/core/services/ids';
import { IMMICH_PATH, IMMICH_PAGE, isImmichId, type ImmichSize } from '@unlease/core/sync/immich';
import type { Env } from '../apps/types';
import { processUpload, UnsupportedImageError } from '../blobs/images';
import type { BlobStore } from '../blobs/store';
import type { SettingsStore } from '../settings/store';
import { ImmichClient, ImmichError, immichProblem } from './client';

export interface ImmichRouteDeps {
  readonly settings: SettingsStore;
  readonly blobs: BlobStore;
  /** How Immich is reached: tests stand in for it. */
  readonly fetcher?: typeof fetch;
  readonly now?: () => number;
  /** A drive to wake once a new blob is saved. */
  readonly kick?: () => void;
}

/** The largest face kept as a contact's photo. */
const FACE_LIMIT = 10 * 1024 * 1024;

const noStore = { 'Cache-Control': 'no-store' };

export function immichRoutes(app: Hono<Env>, deps: ImmichRouteDeps): void {
  const { settings, blobs } = deps;
  const fetcher = deps.fetcher ?? fetch;
  const now = deps.now ?? Date.now;

  const client = (): ImmichClient | null => {
    const config = settings.immich();
    return config ? new ImmichClient(config.url, config.apiKey, fetcher) : null;
  };
  const unlinked = (c: Context<Env>) => c.json({ error: 'Immich is not linked: add it in Administration.' }, 409);
  const failed = (c: Context<Env>, error: unknown) => {
    if (error instanceof ImmichError && (error.status === 404 || error.status === 400)) return c.json({ error: 'Not found in Immich' }, 404);
    return c.json({ error: immichProblem(error) }, 502);
  };
  const pageOf = (value: string | undefined): number => {
    const page = Number(value ?? 1);
    return Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1;
  };

  app.get(`${IMMICH_PATH}/albums`, async c => {
    const immich = client();
    if (!immich) return unlinked(c);
    try {
      return c.json({ albums: await immich.albums(c.req.raw.signal) }, 200, noStore);
    } catch (error) {
      return failed(c, error);
    }
  });

  app.get(`${IMMICH_PATH}/albums/:id`, async c => {
    const id = c.req.param('id');
    if (!isImmichId(id)) return c.json({ error: 'Invalid request' }, 400);
    const immich = client();
    if (!immich) return unlinked(c);
    const size = Math.min(IMMICH_PAGE, Math.max(1, Number(c.req.query('size')) || IMMICH_PAGE));
    try {
      const [album, found] = await Promise.all([immich.album(id, c.req.raw.signal), immich.assets({ albumId: id, size }, c.req.raw.signal)]);
      return c.json({ album, assets: found.assets }, 200, noStore);
    } catch (error) {
      return failed(c, error);
    }
  });

  // The latest photos, or those that show what `q` says.
  app.get(`${IMMICH_PATH}/assets`, async c => {
    const immich = client();
    if (!immich) return unlinked(c);
    const page = pageOf(c.req.query('page'));
    const query = (c.req.query('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    try {
      return c.json(query ? await immich.search(query, page, c.req.raw.signal) : await immich.assets({ page }, c.req.raw.signal), 200, noStore);
    } catch (error) {
      return failed(c, error);
    }
  });

  app.get(`${IMMICH_PATH}/people`, async c => {
    const immich = client();
    if (!immich) return unlinked(c);
    try {
      return c.json({ people: await immich.people(c.req.raw.signal) }, 200, noStore);
    } catch (error) {
      return failed(c, error);
    }
  });

  const picture = async (c: Context<Env>, kind: 'asset' | 'person', id: string, size: ImmichSize, maxAge: number) => {
    if (!isImmichId(id)) return c.json({ error: 'Invalid request' }, 400);
    const immich = client();
    if (!immich) return unlinked(c);
    try {
      const found = await immich.picture(kind, id, size, c.req.raw.signal);
      return c.body(found.body, 200, {
        'Content-Type': found.type,
        ...(found.length ? { 'Content-Length': found.length } : {}),
        'Cache-Control': `private, max-age=${maxAge}`,
        'Content-Security-Policy': "default-src 'none'; sandbox",
      });
    } catch (error) {
      return failed(c, error);
    }
  };

  app.get(`${IMMICH_PATH}/assets/:id/:size`, c => {
    const size = c.req.param('size');
    if (size !== 'thumbnail' && size !== 'preview') return c.json({ error: 'Invalid request' }, 400);
    // A photo's pictures change only when it is edited in Immich: a day is fresh enough.
    return picture(c, 'asset', c.req.param('id'), size, 86_400);
  });

  app.get(`${IMMICH_PATH}/people/:id/thumbnail`, c => picture(c, 'person', c.req.param('id'), 'thumbnail', 3_600));

  // A person's face kept by the server as a picture of its own: the contact that takes it holds it whatever becomes of Immich.
  app.post(`${IMMICH_PATH}/people/:id/photo`, async c => {
    const id = c.req.param('id');
    if (!isImmichId(id)) return c.json({ error: 'Invalid request' }, 400);
    const immich = client();
    if (!immich) return unlinked(c);
    let data: Buffer;
    try {
      const found = await immich.picture('person', id, 'thumbnail', c.req.raw.signal);
      const bytes = await new Response(found.body).arrayBuffer();
      if (bytes.byteLength === 0 || bytes.byteLength > FACE_LIMIT) return c.json({ error: 'Immich answered with an error' }, 502);
      data = Buffer.from(bytes);
    } catch (error) {
      return failed(c, error);
    }
    let processed;
    try {
      processed = await processUpload(data);
    } catch (error) {
      if (error instanceof UnsupportedImageError) return c.json({ error: 'Immich answered with an error' }, 502);
      throw error;
    }
    const blobId = createId(now());
    const info = await blobs.save(
      {
        id: blobId,
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
    deps.kick?.();
    return c.json({ id: info.id, mime: info.mime, width: info.width, height: info.height }, 200, noStore);
  });
}
