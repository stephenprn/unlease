import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AUTH, createTestServer, jpeg, type TestServer } from './helpers';

let server: TestServer;
beforeEach(() => {
  server = createTestServer();
});
afterEach(() => server.close());

const put = (id: string, body: NonNullable<RequestInit['body']>, headers: Record<string, string> = {}) =>
  server.app.request(`/api/blobs/${id}`, { method: 'PUT', headers: { ...AUTH, ...headers }, body });

const get = (id: string, query = '', headers: Record<string, string> = {}) =>
  server.app.request(`/api/blobs/${id}${query}`, { headers: { ...AUTH, ...headers } });

describe('uploading a photo', () => {
  it('accepts raw image bytes and keeps the original plus a WebP display copy', async () => {
    const photo = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#3a6ea5' } }).png().toBuffer();
    const response = await put('photo-001', photo, { 'Content-Type': 'image/png' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'photo-001', mime: 'image/png', width: 2400, height: 1200, bytes: photo.length });

    const display = await get('photo-001');
    expect(display.status).toBe(200);
    expect(display.headers.get('content-type')).toBe('image/webp');
    expect(display.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    const displayed = await sharp(Buffer.from(await display.arrayBuffer())).metadata();
    expect([displayed.format, displayed.width, displayed.height]).toEqual(['webp', 1600, 800]);

    const original = await get('photo-001', '?variant=original');
    expect(original.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await original.arrayBuffer()).equals(photo)).toBe(true);
    expect(original.headers.get('etag')).not.toBe(display.headers.get('etag'));
  });

  it('accepts multipart/form-data with a "file" field, as React Native sends it', async () => {
    const photo = await jpeg(640, 480);
    const form = new FormData();
    form.append('file', new Blob([photo], { type: 'image/jpeg' }), 'IMG_2041.jpg');
    const response = await put('photo-002', form);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'photo-002', mime: 'image/jpeg', width: 640, height: 480, bytes: photo.length });

    const empty = new FormData();
    empty.append('other', 'x');
    expect((await put('photo-003', empty)).status).toBe(400);
  });

  it('applies the EXIF orientation to the size it reports and to the display copy', async () => {
    const sideways = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#a0522d' } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const response = await put('photo-rot', sideways, { 'Content-Type': 'image/jpeg' });
    expect(await response.json()).toMatchObject({ width: 600, height: 800 });
    const displayed = await sharp(Buffer.from(await (await get('photo-rot')).arrayBuffer())).metadata();
    expect([displayed.width, displayed.height]).toEqual([600, 800]);
  });

  it('is idempotent for the same id', async () => {
    const photo = await jpeg(300, 200);
    const first = await (await put('photo-004', photo, { 'Content-Type': 'image/jpeg' })).json();
    const second = await put('photo-004', await jpeg(10, 10), { 'Content-Type': 'image/jpeg' });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(first);
    expect(server.db.prepare('SELECT count(*) AS n FROM blobs').get()).toEqual({ n: 1 });
  });

  it('refuses bad ids, empty bodies, other types and anything that is not a raster image', async () => {
    const photo = await jpeg(50, 50);
    expect((await put('bad id!', photo, { 'Content-Type': 'image/jpeg' })).status).toBe(400);
    expect((await put('x'.repeat(65), photo, { 'Content-Type': 'image/jpeg' })).status).toBe(400);
    expect((await put('empty', new Uint8Array(0), { 'Content-Type': 'image/jpeg' })).status).toBe(400);
    expect((await put('text', 'hello', { 'Content-Type': 'text/plain' })).status).toBe(415);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    expect((await put('svg', svg, { 'Content-Type': 'image/svg+xml' })).status).toBe(415);
    expect((await put('fake', Buffer.from('not really a png'), { 'Content-Type': 'image/png' })).status).toBe(415);
    expect(server.db.prepare('SELECT count(*) AS n FROM blobs').get()).toEqual({ n: 0 });
  });

  it('stores files under a hashed shard, never half-written', async () => {
    await put('photo-005', await jpeg(100, 100), { 'Content-Type': 'image/jpeg' });
    const display = server.blobs.path('photo-005', 'display');
    expect(display).toMatch(/blobs\/[0-9a-f]{2}\/photo-005$/);
    expect(existsSync(display)).toBe(true);
    expect(existsSync(server.blobs.path('photo-005', 'original'))).toBe(true);
  });
});

describe('downloading', () => {
  it('answers 304 to a matching If-None-Match and 404 to an unknown id', async () => {
    await put('photo-006', await jpeg(100, 80), { 'Content-Type': 'image/jpeg' });
    const first = await get('photo-006');
    const etag = first.headers.get('etag')!;
    const again = await get('photo-006', '', { 'If-None-Match': etag });
    expect(again.status).toBe(304);
    expect(again.headers.get('etag')).toBe(etag);
    expect((await get('nothing-here')).status).toBe(404);
    expect((await get('photo-006', '?variant=thumbnail')).status).toBe(400);
  });

  it('serves the display copy for "original" when only that exists (link images)', async () => {
    const webp = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#222' } }).webp().toBuffer();
    await server.blobs.save(
      { id: 'linkimg', mime: 'image/webp', width: 300, height: 300, bytes: webp.length, displayMime: 'image/webp', displayBytes: webp.length, source: 'link' },
      { display: webp, original: null },
    );
    const response = await get('linkimg', '?variant=original');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
  });
});

describe('a page’s files', () => {
  const putFile = (id: string, body: NonNullable<RequestInit['body']>, headers: Record<string, string> = {}) =>
    server.app.request(`/api/files/${id}`, { method: 'PUT', headers: { ...AUTH, ...headers }, body });

  it('keeps a PDF or a video as sent, and serves it back whole', async () => {
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
    const form = new FormData();
    form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'devis.pdf');
    const response = await putFile('file-001', form);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'file-001', mime: 'application/pdf', width: 0, height: 0, bytes: pdf.length });
    for (const variant of ['', '?variant=original']) {
      const served = await get('file-001', variant);
      expect(served.headers.get('content-type')).toBe('application/pdf');
      expect(served.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
      expect(Buffer.from(await served.arrayBuffer()).equals(pdf)).toBe(true);
    }
    const video = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]);
    expect(await (await putFile('file-002', video, { 'Content-Type': 'video/mp4' })).json()).toMatchObject({ mime: 'video/mp4', bytes: 8 });
  });

  it('never serves what a browser would run: an HTML or SVG file goes out as bytes', async () => {
    const page = '<html><script>alert(1)</script></html>';
    expect(await (await putFile('file-003', page, { 'Content-Type': 'text/html' })).json()).toMatchObject({ mime: 'application/octet-stream' });
    expect((await get('file-003')).headers.get('content-type')).toBe('application/octet-stream');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    expect(await (await putFile('file-004', svg, { 'Content-Type': 'image/svg+xml' })).json()).toMatchObject({ mime: 'application/octet-stream' });
  });

  it('refuses a bad id or an empty body, and answers the same file twice alike', async () => {
    expect((await putFile('bad id!', 'x', { 'Content-Type': 'text/plain' })).status).toBe(400);
    expect((await putFile('empty', new Uint8Array(0), { 'Content-Type': 'text/plain' })).status).toBe(400);
    const first = await (await putFile('file-005', 'bonjour', { 'Content-Type': 'text/plain' })).json();
    expect(await (await putFile('file-005', 'autre chose', { 'Content-Type': 'text/plain' })).json()).toEqual(first);
  });
});
