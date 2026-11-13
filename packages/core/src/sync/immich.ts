/**
 * Immich, the photo library a person may run beside the suite, as the server reaches it for the apps
 * (`/api/immich/…`): its albums, the photos of one album, the latest photos or a search, its
 * recognised people, and their pictures through the server (`thumbnail`, `preview`), so the API key
 * never leaves it. The Administration links it (`ServerSettings.immich`); a Pages block shows an
 * album or photos (`pages/models/blocks`: `immich`), a contact may take a person's face as its photo
 * (`POST /api/immich/people/:id/photo`: the server keeps the picture as one of its own blobs).
 */
import { foldText } from '../services/search';

export const IMMICH_PATH = '/api/immich';

/** The pictures the server passes on: a small square-ish one for grids, a larger one to look at. */
export const IMMICH_SIZES = ['thumbnail', 'preview'] as const;
export type ImmichSize = (typeof IMMICH_SIZES)[number];

/** Photos fetched at once (a page of the library, an album's first). */
export const IMMICH_PAGE = 60;

/** The most photos one block keeps when picked one by one. */
export const IMMICH_BLOCK_ASSETS = 60;

/** An album shows this many of its photos in a page, then « +N ». */
export const IMMICH_ALBUM_SHOWN = 12;

/** Immich's ids are UUIDs. */
const ID = /^[0-9a-fA-F-]{8,64}$/;

export function isImmichId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

export interface ImmichAlbum {
  readonly id: string;
  readonly name: string;
  readonly count: number;
  /** The photo Immich shows on it, null for an empty album. */
  readonly coverId: string | null;
  /** Its first and last photos' days (`2026-07-14`), when it has some. */
  readonly start: string | null;
  readonly end: string | null;
}

export interface ImmichAsset {
  readonly id: string;
  readonly video: boolean;
  /** When it was taken (ms), as Immich read it. */
  readonly takenAt: number | null;
  /** Its size in pixels, 0 when unknown. */
  readonly width: number;
  readonly height: number;
  readonly name: string;
}

export interface ImmichPerson {
  readonly id: string;
  /** '' for a face Immich has not been told the name of. */
  readonly name: string;
}

export interface ImmichAlbumsResponse {
  readonly albums: readonly ImmichAlbum[];
}

export interface ImmichAssetsResponse {
  readonly assets: readonly ImmichAsset[];
  /** The next page to ask, null at the end. */
  readonly next: number | null;
}

export interface ImmichAlbumResponse {
  readonly album: ImmichAlbum;
  readonly assets: readonly ImmichAsset[];
}

export interface ImmichPeopleResponse {
  readonly people: readonly ImmichPerson[];
}

/** What `POST /api/immich/people/:id/photo` answers: the blob the server made of the face. */
export interface ImmichPhotoResponse {
  readonly id: string;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
}

const text = (value: unknown, max = 500): string => (typeof value === 'string' ? value.slice(0, max) : '');
const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
const day = (value: unknown): string | null => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null);
const moment = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** An album as Immich writes it (`AlbumResponseDto`), or as the server passes it on; null when it is not one. */
export function parseImmichAlbum(value: unknown): ImmichAlbum | null {
  if (!isObject(value) || !isImmichId(value.id)) return null;
  const cover = value.coverId ?? value.albumThumbnailAssetId;
  return {
    id: value.id,
    name: text(value.name ?? value.albumName, 300),
    count: count(value.count ?? value.assetCount),
    coverId: isImmichId(cover) ? cover : null,
    start: day(value.start ?? value.startDate),
    end: day(value.end ?? value.endDate),
  };
}

/** A photo or a video as Immich writes it (`AssetResponseDto`: its size on the asset since 2.x, in its EXIF before), or as the server passes it on. */
export function parseImmichAsset(value: unknown): ImmichAsset | null {
  if (!isObject(value) || !isImmichId(value.id)) return null;
  const exif = isObject(value.exifInfo) ? value.exifInfo : {};
  const takenAt = typeof value.takenAt === 'number' ? value.takenAt : moment(value.localDateTime ?? value.fileCreatedAt);
  return {
    id: value.id,
    video: value.video === true || value.type === 'VIDEO',
    takenAt: takenAt !== null && Number.isFinite(takenAt) ? takenAt : null,
    width: count(value.width ?? exif.exifImageWidth),
    height: count(value.height ?? exif.exifImageHeight),
    name: text(value.name ?? value.originalFileName, 255),
  };
}

export function parseImmichPerson(value: unknown): ImmichPerson | null {
  if (!isObject(value) || !isImmichId(value.id)) return null;
  return { id: value.id, name: text(value.name, 200).trim() };
}

const list = <T>(value: unknown, parse: (entry: unknown) => T | null): T[] => (Array.isArray(value) ? value.flatMap(entry => parse(entry) ?? []) : []);

export function parseImmichAlbums(body: unknown): ImmichAlbumsResponse {
  return { albums: list(isObject(body) ? body.albums : null, parseImmichAlbum) };
}

export function parseImmichAssets(body: unknown): ImmichAssetsResponse {
  const raw = isObject(body) ? body : {};
  return { assets: list(raw.assets, parseImmichAsset), next: typeof raw.next === 'number' && raw.next > 0 ? raw.next : null };
}

export function parseImmichAlbumResponse(body: unknown): ImmichAlbumResponse | null {
  if (!isObject(body)) return null;
  const album = parseImmichAlbum(body.album);
  return album ? { album, assets: list(body.assets, parseImmichAsset) } : null;
}

export function parseImmichPeople(body: unknown): ImmichPeopleResponse {
  return { people: list(isObject(body) ? body.people : null, parseImmichPerson) };
}

export function parseImmichPhoto(body: unknown): ImmichPhotoResponse | null {
  if (!isObject(body) || typeof body.id !== 'string' || !body.id) return null;
  return { id: body.id, mime: text(body.mime, 100) || 'image/jpeg', width: count(body.width), height: count(body.height) };
}

/** The server's address of a picture: `/api/immich/assets/<id>/thumbnail`, `/api/immich/people/<id>/thumbnail`. */
export function immichPicturePath(kind: 'asset' | 'person', id: string, size: ImmichSize = 'thumbnail'): string {
  return kind === 'asset' ? `${IMMICH_PATH}/assets/${encodeURIComponent(id)}/${size}` : `${IMMICH_PATH}/people/${encodeURIComponent(id)}/thumbnail`;
}

/** Where a photo or an album opens in Immich's own web app. */
export function immichPlace(base: string, kind: 'asset' | 'album', id: string): string {
  const root = base.replace(/\/+$/, '');
  return kind === 'album' ? `${root}/albums/${encodeURIComponent(id)}` : `${root}/photos/${encodeURIComponent(id)}`;
}

/**
 * The people a contact's photo is picked among, the ones matching `query` (or the contact's name
 * while nothing is typed) first, by how well they match, then the other named ones; faces without a
 * name come last, and only while nothing is typed.
 */
export function orderImmichPeople(people: readonly ImmichPerson[], query: string, contactName = ''): ImmichPerson[] {
  const typed = foldText(query).trim();
  const wanted = typed || foldText(contactName).trim();
  const words = wanted.split(/\s+/).filter(Boolean);
  const score = (person: ImmichPerson): number => {
    if (words.length === 0 || !person.name) return 0;
    const name = foldText(person.name);
    if (name === wanted) return 3;
    const parts = name.split(/\s+/);
    if (words.every(word => parts.some(part => part.startsWith(word)))) return 2;
    return words.some(word => parts.some(part => part.startsWith(word))) ? 1 : 0;
  };
  const scored = people.map((person, index) => ({ person, index, score: score(person) }));
  const kept = typed ? scored.filter(entry => entry.score > 0) : scored;
  return kept
    .sort((a, b) => b.score - a.score || (a.person.name ? 0 : 1) - (b.person.name ? 0 : 1) || a.person.name.localeCompare(b.person.name) || a.index - b.index)
    .map(entry => entry.person);
}
