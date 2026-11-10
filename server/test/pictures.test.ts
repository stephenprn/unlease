import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatHlc } from '@unlease/core/sync/hlc';
import { processLinkImage } from '../src/blobs/images';
import { shedPictureCopies } from '../src/apps/notes/analysis/distinctPictures';
import { keepImages } from '../src/reading/keep-images';
import { likenessOf, pictureKeys, sameLikeness, type Likeness } from '../src/reading/likeness';
import { createTestServer, FakeFetcher, linkFields, rec, T0, type TestServer } from './helpers';

/** A photo, 3:2: a sky, a sun, hills and a house; `other` paints another picture of the same make. */
function photo(other = false): Buffer {
  const svg = other
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="1000">
        <rect width="1500" height="1000" fill="#f4efe6"/>
        <rect x="150" y="120" width="520" height="760" rx="40" fill="#1f3b73"/>
        <circle cx="1100" cy="620" r="260" fill="#c0392b"/>
        <path d="M700 100 L1400 100 L1050 380 Z" fill="#2e8b57"/>
      </svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="1000">
        <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d6fc4"/><stop offset="1" stop-color="#f2c38b"/></linearGradient></defs>
        <rect width="1500" height="1000" fill="url(#sky)"/>
        <circle cx="1150" cy="230" r="110" fill="#ffe066"/>
        <path d="M0 720 L380 390 L760 660 L1060 430 L1500 740 L1500 1000 L0 1000 Z" fill="#2f5d3a"/>
        <rect x="240" y="600" width="230" height="190" fill="#8b3a2b"/>
        <path d="M220 600 L355 500 L490 600 Z" fill="#5a1f16"/>
      </svg>`;
  return Buffer.from(svg);
}

/** The photo as a page serves it: cut (`left, top, width, height` of the 1500 x 1000 original), at a size, as JPEG. */
async function served(options: { crop?: [number, number, number, number]; width: number; quality?: number; other?: boolean; bars?: number }): Promise<Buffer> {
  const [left, top, width, height] = options.crop ?? [0, 0, 1500, 1000];
  let image = sharp(await sharp(photo(options.other)).png().toBuffer()).extract({ left, top, width, height }).resize({ width: options.width });
  if (options.bars) image = sharp(await image.png().toBuffer()).extend({ top: options.bars, bottom: options.bars, background: '#000000' });
  return image.jpeg({ quality: options.quality ?? 85 }).toBuffer();
}

async function likeness(bytes: Buffer): Promise<Likeness> {
  const kept = await processLinkImage(bytes);
  return (await likenessOf(kept!.data))!;
}

describe('one picture, however a page serves it', () => {
  it('knows a picture resized, re-encoded, letterboxed or cut to another proportion', async () => {
    const original = await likeness(await served({ width: 1500 }));
    const wide = await likeness(await served({ crop: [0, 78, 1500, 844], width: 1200 }));
    const copies = [
      await served({ width: 480, quality: 40 }),
      // YouTube's 4:3 thumbnail: the 16:9 frame with black bars.
      await served({ crop: [0, 78, 1500, 844], width: 480, bars: 45 }),
      // Square and 4:3 crops from its centre.
      await served({ crop: [250, 0, 1000, 1000], width: 800 }),
      await served({ crop: [83, 0, 1333, 1000], width: 900 }),
    ];
    expect(sameLikeness(original, await likeness(copies[0]!))).toBe(true);
    expect(sameLikeness(wide, await likeness(copies[1]!))).toBe(true);
    expect(sameLikeness(original, await likeness(copies[2]!))).toBe(true);
    expect(sameLikeness(original, await likeness(copies[3]!))).toBe(true);
    // Two 16:9 crops of one photo, its top and its centre.
    const top = await likeness(await served({ crop: [0, 0, 1500, 844], width: 1200 }));
    expect(sameLikeness(top, wide)).toBe(true);
  });

  it('tells two pictures apart, and a picture from its mirror', async () => {
    const original = await likeness(await served({ width: 1200 }));
    expect(sameLikeness(original, await likeness(await served({ width: 1200, other: true })))).toBe(false);
    const mirrored = await sharp(await served({ width: 1200 })).flop().jpeg().toBuffer();
    expect(sameLikeness(original, await likeness(mirrored))).toBe(false);
  });

  it('names one file at several sizes, never two files of a common name', () => {
    const shares = (a: string, b: string): boolean => pictureKeys(a).some(key => pictureKeys(b).includes(key));
    const franceinfo = (path: string) => `https://www.franceinfo.fr/pictures/${path}/2026/11/03/6ae9eff3d693e355452870.jpg`;
    expect(shares(franceinfo('6uKl/0x0:6000x3375/1500x843'), franceinfo('0gfG/1200x1200'))).toBe(true);
    expect(shares('https://example.org/wp-content/uploads/2026/11/livret-a-plafond-2026-1200x630.jpg', 'https://example.org/wp-content/uploads/2026/11/livret-a-plafond-2026.jpg')).toBe(true);
    expect(shares('https://cdn.example.org/files/veste-face.jpg?width=600', 'https://cdn.example.org/files/veste-face.jpg?width=1200')).toBe(true);
    expect(shares('https://cdn.example.org/p/4512/image.jpg', 'https://cdn.example.org/p/4513/image.jpg')).toBe(false);
    expect(shares('https://cdn.example.org/files/veste-4512-face.jpg', 'https://cdn.example.org/files/veste-4512-dos.jpg')).toBe(false);
  });
});

let server: TestServer;
beforeEach(() => {
  server = createTestServer();
});
afterEach(() => server.close());

const JPEG = { 'content-type': 'image/jpeg' };
const signal = new AbortController().signal;

describe('the pictures a link keeps', () => {
  it('keeps YouTube’s frame once, the larger one without its bars', async () => {
    const thumbnail = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
    const frame = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg';
    const fetcher = new FakeFetcher({
      [thumbnail]: { headers: JPEG, body: await served({ crop: [0, 78, 1500, 844], width: 480, bars: 45, quality: 60 }) },
      [frame]: { headers: JPEG, body: await served({ crop: [0, 78, 1500, 844], width: 1280 }) },
    });
    const kept = await keepImages({ candidates: [thumbnail, frame], first: 0, referer: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', fetcher, blobs: server.blobs, signal });
    expect(kept.urls).toEqual([frame]);
    expect(server.blobs.get(kept.ids[0]!)).toMatchObject({ width: 1200, height: 675 });
  });

  it('downloads one file once at whatever size the page names it, and keeps every other picture', async () => {
    const franceinfo = (path: string) => `https://www.franceinfo.fr/pictures/${path}/2026/11/03/6ae9eff3d693e355452870.jpg`;
    const og = franceinfo('6uKl/0x0:6000x3375/1500x843');
    const other = 'https://www.franceinfo.fr/pictures/a1b2/1200x900/2026/11/03/7bf0a114e8c4f2d6631981.jpg';
    const fetcher = new FakeFetcher({
      [og]: { headers: JPEG, body: await served({ crop: [0, 0, 1500, 844], width: 1500 }) },
      [other]: { headers: JPEG, body: await served({ width: 1200, other: true }) },
    });
    const candidates = [og, franceinfo('WtQ2/0x0:6000x3375/908x510'), franceinfo('dZ-_/1200x675'), franceinfo('0gfG/1200x1200'), other];
    const kept = await keepImages({ candidates, first: 0, referer: 'https://www.franceinfo.fr/economie/livret-a.html', fetcher, blobs: server.blobs, signal });
    expect(fetcher.urls()).toEqual([og, other]);
    expect(kept.urls).toEqual([og, other]);
  });
});

describe('links saved before', () => {
  async function keep(id: string, bytes: Buffer): Promise<string> {
    const image = (await processLinkImage(bytes))!;
    await server.blobs.save(
      { id, mime: 'image/webp', width: image.width, height: image.height, bytes: image.data.length, displayMime: 'image/webp', displayBytes: image.data.length, source: 'link' },
      { display: image.data, original: null },
    );
    return id;
  }

  it('shed the copies they keep, once, the larger copy in the first one’s place', async () => {
    const small = await keep('pic-small', await served({ width: 600 }));
    const large = await keep('pic-large', await served({ width: 1500, quality: 70 }));
    const other = await keep('pic-other', await served({ width: 1000, other: true }));
    const lone = await keep('pic-lone', await served({ width: 900 }));
    server.sync.push([
      rec('link', 'l1', { noteId: 'inbox', url: 'https://example.org/a', status: 'ready', imageIds: [small, other, large], createdAt: T0, deletedAt: null }, T0),
      rec('link', 'l2', { noteId: 'inbox', url: 'https://example.org/b', status: 'ready', imageIds: [lone], createdAt: T0, deletedAt: null }, T0),
    ]);
    const before = server.records.maxSeq();
    const options = { db: server.db, records: server.records, blobs: server.blobs, sync: server.sync, signal };
    expect(await shedPictureCopies(options)).toBe(1);
    expect(linkFields(server, 'l1').imageIds).toEqual([large, other]);
    expect(linkFields(server, 'l2').imageIds).toEqual([lone]);
    expect(server.records.maxSeq()).toBe(before + 1);
    expect(server.records.get('link', 'l1')!.clocks.imageIds! > formatHlc(T0, 0, 'phone1')).toBe(true);

    // Done once: a link saved later with copies (another server's backup) is left to its next reading.
    server.sync.push([rec('link', 'l3', { noteId: 'inbox', url: 'https://example.org/c', status: 'ready', imageIds: [small, large], createdAt: T0, deletedAt: null }, T0)]);
    expect(await shedPictureCopies(options)).toBe(0);
    expect(linkFields(server, 'l3').imageIds).toEqual([small, large]);
  });
});
