import { afterEach, describe, expect, it } from 'vitest';
import { AUTH, createTestServer, jpeg, type TestServer } from './helpers';

const KEY = 'immich-key-1234567890abcd';
const ALBUM = '0a1b2c3d-1111-4222-8333-444455556666';
const PHOTO = '0a1b2c3d-aaaa-4bbb-8ccc-ddddeeeeffff';
const VIDEO = '0a1b2c3d-aaaa-4bbb-8ccc-ddddeeee0000';
const PERSON = '0a1b2c3d-9999-4888-8777-666655554444';

interface Asked {
  readonly url: string;
  readonly method: string;
  readonly key: string | null;
  readonly body: unknown;
}

/** An Immich as its OpenAPI describes it: what the server sends it is kept in `asked`. */
function fakeImmich(options: { key?: string; face?: Buffer; noPeople?: boolean } = {}) {
  const asked: Asked[] = [];
  const key = options.key ?? KEY;
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    asked.push({ url: url.toString(), method: init?.method ?? 'GET', key: headers.get('x-api-key'), body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.pathname === '/api/server/ping') return json({ res: 'pong' });
    if (headers.get('x-api-key') !== key) return json({ message: 'Invalid API key' }, 401);
    if (url.pathname === '/api/albums') {
      return json([
        { id: ALBUM, albumName: 'Lisbonne', assetCount: 42, albumThumbnailAssetId: PHOTO, startDate: '2026-07-14T09:00:00.000Z', endDate: '2026-07-21T18:00:00.000Z', updatedAt: '2026-07-22T00:00:00.000Z' },
        { id: '0a1b2c3d-1111-4222-8333-000000000000', albumName: 'Vieux', assetCount: 0, albumThumbnailAssetId: null, updatedAt: '2020-01-01T00:00:00.000Z' },
      ]);
    }
    if (url.pathname === `/api/albums/${ALBUM}`) return json({ id: ALBUM, albumName: 'Lisbonne', assetCount: 42, albumThumbnailAssetId: PHOTO });
    if (url.pathname === '/api/search/metadata' || url.pathname === '/api/search/smart') {
      return json({
        albums: { items: [], total: 0, count: 0, facets: [] },
        assets: {
          items: [
            { id: PHOTO, type: 'IMAGE', localDateTime: '2026-07-14T10:30:00.000Z', originalFileName: 'IMG_0001.jpg', width: 4032, height: 3024 },
            { id: VIDEO, type: 'VIDEO', fileCreatedAt: '2026-07-15T10:30:00.000Z', originalFileName: 'VID.mp4', exifInfo: { exifImageWidth: 1920, exifImageHeight: 1080 } },
            { id: '0a1b2c3d-aaaa-4bbb-8ccc-dddd00000000', type: 'IMAGE', isTrashed: true },
          ],
          total: 3,
          count: 3,
          facets: [],
          nextPage: '2',
        },
      });
    }
    if (url.pathname === '/api/people') {
      if (options.noPeople) return json({ message: 'Missing permission: person.read' }, 403);
      return json({ people: [{ id: PERSON, name: 'Léa Martin', isHidden: false }, { id: '0a1b2c3d-9999-4888-8777-000000000000', name: '', isHidden: false }, { id: '0a1b2c3d-9999-4888-8777-111111111111', name: 'Caché', isHidden: true }], total: 3, hidden: 1, hasNextPage: false });
    }
    if (url.pathname === `/api/assets/${PHOTO}/thumbnail`) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/webp' } });
    if (url.pathname === `/api/people/${PERSON}/thumbnail`) return new Response(new Uint8Array(options.face ?? Buffer.from([0xff, 0xd8])), { headers: { 'content-type': 'image/jpeg' } });
    return json({ message: 'Not found' }, 404);
  };
  return { fetcher, asked };
}

const put = (server: TestServer, body: unknown) => server.app.request('/api/settings', { method: 'PUT', headers: { ...AUTH, 'content-type': 'application/json' }, body: JSON.stringify(body) });

let server: TestServer | null = null;
afterEach(() => {
  server?.close();
  server = null;
});

describe('Immich', () => {
  it('is tried before it is kept, and its key never comes back', async () => {
    const immich = fakeImmich();
    server = createTestServer({ immichFetch: immich.fetcher });
    expect(((await (await server.app.request('/api/settings', { headers: AUTH })).json()) as { immich: unknown }).immich).toEqual({ url: '', keyHint: null });
    const refused = await put(server, { immich: { url: 'https://photos.example.org', apiKey: 'wrong-key-0000000000' } });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: 'API key refused by Immich' });
    expect((await put(server, { immich: { url: 'https://photos.example.org' } })).status).toBe(400);
    const kept = await put(server, { immich: { url: 'https://photos.example.org/', apiKey: KEY } });
    expect(kept.status).toBe(200);
    const view = (await kept.json()) as { immich: unknown };
    expect(view.immich).toEqual({ url: 'https://photos.example.org', keyHint: '…abcd' });
    expect(JSON.stringify(view)).not.toContain(KEY);
    // The ping goes without the key; the rest with it.
    expect(immich.asked.find(entry => entry.url.endsWith('/api/server/ping'))?.key).toBeNull();
    expect((await put(server, { immich: null })).status).toBe(200);
    expect(server.settings.immich()).toBeNull();
  });

  it('says what is missing from a key', async () => {
    server = createTestServer({ immichFetch: fakeImmich({ noPeople: true }).fetcher });
    const refused = await put(server, { immich: { url: 'https://photos.example.org', apiKey: KEY } });
    expect(await refused.json()).toEqual({ error: 'This API key lacks a permission: give it album.read, asset.read, asset.view and person.read' });
    server.close();
    server = createTestServer();
    const unreachable = await put(server, { immich: { url: 'http://192.168.1.20:2283', apiKey: KEY } });
    expect(unreachable.status).toBe(502);
    expect(await unreachable.json()).toEqual({ error: 'Immich unreachable' });
  });

  it('passes albums, photos, people and pictures on, behind the token', async () => {
    const immich = fakeImmich();
    server = createTestServer({ immichFetch: immich.fetcher });
    expect((await server.app.request('/api/immich/albums', { headers: AUTH })).status).toBe(409);
    server.settings.updateImmich({ url: 'https://photos.example.org', apiKey: KEY });
    expect((await server.app.request('/api/immich/albums')).status).toBe(401);

    const albums = (await (await server.app.request('/api/immich/albums', { headers: AUTH })).json()) as { albums: { name: string }[] };
    expect(albums.albums.map(album => album.name)).toEqual(['Lisbonne', 'Vieux']);
    expect(albums.albums[0]).toEqual({ id: ALBUM, name: 'Lisbonne', count: 42, coverId: PHOTO, start: '2026-07-14', end: '2026-07-21' });

    const album = (await (await server.app.request(`/api/immich/albums/${ALBUM}`, { headers: AUTH })).json()) as { album: { name: string }; assets: { id: string; video: boolean; width: number }[] };
    expect(album.album.name).toBe('Lisbonne');
    // The bin's photos are left out; a video says so; sizes from the asset or its EXIF.
    expect(album.assets.map(asset => [asset.id, asset.video, asset.width])).toEqual([
      [PHOTO, false, 4032],
      [VIDEO, true, 1920],
    ]);
    expect(immich.asked.find(entry => entry.url.endsWith('/api/search/metadata'))?.body).toMatchObject({ albumIds: [ALBUM], order: 'desc' });

    const latest = (await (await server.app.request('/api/immich/assets?page=1', { headers: AUTH })).json()) as { next: number | null };
    expect(latest.next).toBe(2);
    await server.app.request('/api/immich/assets?q=plage%20au%20soleil', { headers: AUTH });
    expect(immich.asked.at(-1)).toMatchObject({ method: 'POST', body: { query: 'plage au soleil', page: 1 } });

    const people = (await (await server.app.request('/api/immich/people', { headers: AUTH })).json()) as { people: { name: string }[] };
    expect(people.people.map(person => person.name)).toEqual(['Léa Martin', '']);

    const picture = await server.app.request(`/api/immich/assets/${PHOTO}/preview`, { headers: AUTH });
    expect(picture.status).toBe(200);
    expect(picture.headers.get('content-type')).toBe('image/webp');
    expect(picture.headers.get('cache-control')).toContain('private');
    expect(new Uint8Array(await picture.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(immich.asked.at(-1)?.url).toBe(`https://photos.example.org/api/assets/${PHOTO}/thumbnail?size=preview`);
    expect((await server.app.request(`/api/immich/assets/${PHOTO}/original`, { headers: AUTH })).status).toBe(400);
    expect((await server.app.request(`/api/immich/assets/${PERSON}/thumbnail`, { headers: AUTH })).status).toBe(404);
    expect((await server.app.request('/api/immich/assets/..%2F..%2Fusers/thumbnail', { headers: AUTH })).status).toBe(400);
    expect(immich.asked.every(entry => entry.url.startsWith('https://photos.example.org/api/'))).toBe(true);
  });

  it('keeps a person’s face as a blob of the server’s own', async () => {
    server = createTestServer({ immichFetch: fakeImmich({ face: await jpeg(300, 300) }).fetcher });
    server.settings.updateImmich({ url: 'https://photos.example.org', apiKey: KEY });
    const response = await server.app.request(`/api/immich/people/${PERSON}/photo`, { method: 'POST', headers: AUTH });
    expect(response.status).toBe(200);
    const photo = (await response.json()) as { id: string; mime: string; width: number };
    expect(photo).toMatchObject({ mime: 'image/jpeg', width: 300 });
    const blob = await server.app.request(`/api/blobs/${photo.id}`, { headers: AUTH });
    expect(blob.status).toBe(200);
  });
});
