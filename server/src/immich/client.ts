/**
 * Immich through an API key (`x-api-key`), as the Administration links it: its albums, an album's
 * photos and the latest ones (`POST /api/search/metadata`, which every Immich since 1.11x answers;
 * an album's own `assets` are gone from its answer in 2.x), a search by what a photo shows
 * (`/api/search/smart`, when its machine learning runs), its people, and their pictures. Immich
 * mostly lives on the local network: it is called with a plain fetch, never the guarded one that
 * reads links, and never follows a redirect (the key would go along).
 */
import { IMMICH_PAGE, parseImmichAlbum, parseImmichAsset, parseImmichPerson, type ImmichAlbum, type ImmichAsset, type ImmichPerson, type ImmichSize } from '@unlease/core/sync/immich';

export class ImmichError extends Error {
  constructor(
    /** The HTTP status; 0 when Immich could not be reached, -1 when the answer was not Immich's. */
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const NOT_IMMICH = -1;
const TIMEOUT_MS = 15_000;
/** The people asked at once (Immich pages them since 1.10x). */
const PEOPLE_PAGE = 500;
/** And at most this many pages of them. */
const PEOPLE_PAGES = 10;

/** What went wrong, in the apps' words (English keys). */
export function immichProblem(error: unknown): string {
  if (!(error instanceof ImmichError) || error.status === 0) return 'Immich unreachable';
  if (error.status === NOT_IMMICH || error.status === 404) return 'This address does not answer like an Immich server';
  if (error.status >= 300 && error.status < 400) return 'This address redirects elsewhere: give the one Immich answers on';
  if (error.status === 401) return 'API key refused by Immich';
  if (error.status === 403) return 'This API key lacks a permission: give it album.read, asset.read, asset.view and person.read';
  return 'Immich answered with an error';
}

/** A picture's bytes, as Immich sent them. */
export interface ImmichPicture {
  readonly body: ReadableStream<Uint8Array>;
  readonly type: string;
  readonly length: string | null;
}

export class ImmichClient {
  private readonly base: string;

  constructor(
    url: string,
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.base = url.replace(/\/+$/, '');
  }

  private async call(path: string, init: RequestInit = {}, signal?: AbortSignal, keyed = true): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.base}/api/${path}`, {
        ...init,
        headers: { accept: 'application/json', ...(keyed ? { 'x-api-key': this.apiKey } : {}), ...(init.headers as Record<string, string> | undefined) },
        redirect: 'manual',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ImmichError(0, 'unreachable');
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ImmichError(response.status, `status ${response.status}`);
    }
    return response;
  }

  private async json(path: string, init: RequestInit = {}, signal?: AbortSignal, keyed = true): Promise<unknown> {
    const response = await this.call(path, init, signal, keyed);
    try {
      return await response.json();
    } catch {
      throw new ImmichError(NOT_IMMICH, 'not json');
    }
  }

  private post(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    return this.json(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, signal);
  }

  /**
   * Proves the address is Immich's (`/api/server/ping` answers anyone « pong »), then that the key
   * opens what the apps read: the albums and the people.
   */
  async check(): Promise<void> {
    const ping = (await this.json('server/ping', {}, undefined, false)) as { res?: unknown } | null;
    if (ping?.res !== 'pong') throw new ImmichError(NOT_IMMICH, 'not immich');
    await this.json('albums');
    await this.json(`people?size=1&withHidden=false`);
  }

  /** The albums the key's owner has, and those shared with them, the latest changed first. */
  async albums(signal?: AbortSignal): Promise<ImmichAlbum[]> {
    const raw = await this.json('albums', {}, signal);
    if (!Array.isArray(raw)) throw new ImmichError(NOT_IMMICH, 'not a list');
    const albums = raw.flatMap(entry => parseImmichAlbum(entry) ?? []);
    const changed = new Map(raw.map(entry => [(entry as { id?: unknown }).id, Date.parse(String((entry as { updatedAt?: unknown }).updatedAt ?? ''))]));
    return albums.sort((a, b) => (changed.get(b.id) || 0) - (changed.get(a.id) || 0));
  }

  async album(id: string, signal?: AbortSignal): Promise<ImmichAlbum> {
    const album = parseImmichAlbum(await this.json(`albums/${encodeURIComponent(id)}?withoutAssets=true`, {}, signal));
    if (!album) throw new ImmichError(NOT_IMMICH, 'not an album');
    return album;
  }

  /** A page of photos, the latest first: an album's, or the whole library's; videos included. */
  async assets(options: { readonly albumId?: string; readonly page?: number; readonly size?: number }, signal?: AbortSignal): Promise<{ assets: ImmichAsset[]; next: number | null }> {
    const page = Math.max(1, options.page ?? 1);
    const body = {
      page,
      size: Math.min(250, Math.max(1, options.size ?? IMMICH_PAGE)),
      order: 'desc',
      withExif: true,
      ...(options.albumId ? { albumIds: [options.albumId] } : { visibility: 'timeline' }),
    };
    return this.searched(await this.post('search/metadata', body, signal), page);
  }

  /** Photos showing what `query` says (Immich's smart search, which needs its machine learning). */
  async search(query: string, page = 1, signal?: AbortSignal): Promise<{ assets: ImmichAsset[]; next: number | null }> {
    return this.searched(await this.post('search/smart', { query, page, size: IMMICH_PAGE, withExif: true }, signal), page);
  }

  private searched(raw: unknown, page: number): { assets: ImmichAsset[]; next: number | null } {
    const found = (raw as { assets?: { items?: unknown; nextPage?: unknown } } | null)?.assets;
    if (!found || !Array.isArray(found.items)) throw new ImmichError(NOT_IMMICH, 'not a search');
    const assets = found.items.filter(entry => (entry as { isTrashed?: unknown }).isTrashed !== true).flatMap(entry => parseImmichAsset(entry) ?? []);
    const next = found.nextPage === null || found.nextPage === undefined ? null : Number(found.nextPage);
    return { assets, next: next !== null && Number.isFinite(next) && next > page ? next : null };
  }

  /** The people Immich recognised and shows (not hidden), named or not. */
  async people(signal?: AbortSignal): Promise<ImmichPerson[]> {
    const out: ImmichPerson[] = [];
    for (let page = 1; page <= PEOPLE_PAGES; page += 1) {
      const raw = (await this.json(`people?withHidden=false&size=${PEOPLE_PAGE}&page=${page}`, {}, signal)) as { people?: unknown; hasNextPage?: unknown } | null;
      if (!raw || !Array.isArray(raw.people)) throw new ImmichError(NOT_IMMICH, 'not people');
      for (const entry of raw.people) {
        if ((entry as { isHidden?: unknown }).isHidden === true) continue;
        const person = parseImmichPerson(entry);
        if (person) out.push(person);
      }
      if (raw.hasNextPage !== true) break;
    }
    return out;
  }

  /** A photo's picture at a size (a video's still frame), or a person's face. */
  async picture(kind: 'asset' | 'person', id: string, size: ImmichSize, signal?: AbortSignal): Promise<ImmichPicture> {
    const path = kind === 'asset' ? `assets/${encodeURIComponent(id)}/thumbnail?size=${size}` : `people/${encodeURIComponent(id)}/thumbnail`;
    const response = await this.call(path, { headers: { accept: 'image/*' } }, signal);
    const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    if (!response.body || !/^image\/(?:jpeg|png|webp|avif)$/.test(type)) {
      await response.body?.cancel();
      throw new ImmichError(NOT_IMMICH, 'not a picture');
    }
    return { body: response.body, type, length: response.headers.get('content-length') };
  }
}
