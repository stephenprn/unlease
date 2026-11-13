/**
 * The demo's Immich (`/api/immich/…`): a small library of drawn photos, two albums and three faces,
 * answered as the server passes Immich on. A person's face kept for a contact is one of the demo's
 * uploads, as the server keeps it as a blob. Development only.
 */
import { createId } from '@unlease/core/services/ids';
import { IMMICH_PATH, type ImmichAlbum, type ImmichAsset, type ImmichPerson } from '@unlease/core/sync/immich';

import { demoImage } from './demoImages';

const day = (offset: number): number => Date.now() - offset * 86_400_000;
const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Each photo is a demo drawing. */
const PHOTOS: readonly { readonly asset: ImmichAsset; readonly drawing: string }[] = [
  { asset: { id: uuid(1), video: false, takenAt: day(2), width: 400, height: 500, name: 'IMG_2041.jpg' }, drawing: 'lake' },
  { asset: { id: uuid(2), video: false, takenAt: day(2), width: 400, height: 500, name: 'IMG_2042.jpg' }, drawing: 'balcony' },
  { asset: { id: uuid(3), video: false, takenAt: day(3), width: 400, height: 500, name: 'IMG_2038.jpg' }, drawing: 'plate' },
  { asset: { id: uuid(4), video: true, takenAt: day(3), width: 400, height: 500, name: 'VID_2039.mp4' }, drawing: 'mezze' },
  { asset: { id: uuid(5), video: false, takenAt: day(9), width: 400, height: 500, name: 'IMG_1980.jpg' }, drawing: 'lamp' },
  { asset: { id: uuid(6), video: false, takenAt: day(16), width: 400, height: 400, name: 'IMG_1901.jpg' }, drawing: 'portrait' },
];

const ALBUMS: readonly { readonly album: ImmichAlbum; readonly assets: readonly string[] }[] = [
  { album: { id: uuid(101), name: 'Lisbon', count: 4, coverId: uuid(1), start: null, end: null }, assets: [uuid(1), uuid(2), uuid(3), uuid(4)] },
  { album: { id: uuid(102), name: 'Home', count: 2, coverId: uuid(5), start: null, end: null }, assets: [uuid(5), uuid(6)] },
];

const PEOPLE: readonly { readonly person: ImmichPerson; readonly drawing: string }[] = [
  { person: { id: uuid(201), name: 'Léa Martin' }, drawing: 'portrait' },
  { person: { id: uuid(202), name: 'Tom Garnier' }, drawing: 'portrait2' },
  { person: { id: uuid(203), name: '' }, drawing: 'portrait3' },
];

const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

/** Answers an Immich route, or null for another address. `linked`: the Administration has it. */
export function immichRoute(url: URL, method: string, linked: boolean, keep: (id: string, blob: Blob) => void): Response | null {
  if (!url.pathname.startsWith(`${IMMICH_PATH}/`)) return null;
  if (!linked) return json({ error: 'Immich is not linked: add it in Administration.' }, 409);
  const path = url.pathname.slice(IMMICH_PATH.length);
  if (path === '/albums' && method === 'GET') return json({ albums: ALBUMS.map(entry => entry.album) });
  const album = /^\/albums\/([^/]+)$/.exec(path);
  if (album && method === 'GET') {
    const found = ALBUMS.find(entry => entry.album.id === album[1]);
    if (!found) return json({ error: 'Not found in Immich' }, 404);
    return json({ album: found.album, assets: found.assets.flatMap(id => PHOTOS.find(photo => photo.asset.id === id)?.asset ?? []) });
  }
  if (path === '/assets' && method === 'GET') {
    const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    // The demo's « smart » search: a few words name its drawings.
    const words: Record<string, readonly string[]> = { lake: ['lake', 'lac', 'mountain', 'montagne', 'water', 'eau'], balcony: ['balcony', 'balcon', 'flower', 'fleur'], plate: ['food', 'plat', 'dinner', 'dîner'], mezze: ['food', 'mezze'], lamp: ['lamp', 'lampe'], portrait: ['face', 'visage', 'person', 'personne'] };
    const assets = PHOTOS.filter(photo => !query || (words[photo.drawing] ?? []).some(word => word.startsWith(query) || query.includes(word))).map(photo => photo.asset);
    return json({ assets, next: null });
  }
  if (path === '/people' && method === 'GET') return json({ people: PEOPLE.map(entry => entry.person) });
  const picture = /^\/(assets|people)\/([^/]+)\/(thumbnail|preview|photo)$/.exec(path);
  if (picture) {
    const drawing = picture[1] === 'assets' ? PHOTOS.find(photo => photo.asset.id === picture[2])?.drawing : PEOPLE.find(entry => entry.person.id === picture[2])?.drawing;
    const image = drawing ? demoImage(`demo-${drawing}`) : null;
    if (!image) return json({ error: 'Not found in Immich' }, 404);
    if (picture[3] === 'photo') {
      if (method !== 'POST' || picture[1] !== 'people') return json({ error: 'not found' }, 404);
      const id = createId(Date.now());
      keep(id, image);
      return json({ id, mime: image.type, width: 400, height: 400 });
    }
    return new Response(image, { headers: { 'Content-Type': image.type } });
  }
  return json({ error: 'not found' }, 404);
}
