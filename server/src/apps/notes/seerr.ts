/**
 * Seerr (Jellyseerr, Overseerr: the requests app of a Plex or Jellyfin server), as the
 * Administration links it: `/api/v1/status` answers anyone and proves the address is Seerr's; with
 * the API key (`X-Api-Key`), `/api/v1/search` finds a film or a series by its title (TMDB's ids),
 * and whether the media server has it. Seerr often lives on the local network: it is called with a
 * plain fetch, never the guarded one that reads links, and never follows a redirect (the key would
 * go along).
 */
import type { LinkBrief } from '@unlease/notes/sync/brief';
import type { SeerrResponse, SeerrStatus } from '@unlease/notes/sync/seerr';
import { seerrPageUrl, seerrQuery, seerrSearchUrl } from '@unlease/notes/services/modules';
import { foldText } from '@unlease/core/services/search';

export class SeerrError extends Error {
  constructor(
    /** The HTTP status; 0 when Seerr could not be reached, -1 when the answer was not Seerr's. */
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const NOT_SEERR = -1;
const TIMEOUT_MS = 10_000;

/** What went wrong, in the apps' words. */
export function seerrProblem(error: unknown): string {
  if (!(error instanceof SeerrError) || error.status === 0) return 'Seerr injoignable';
  if (error.status === NOT_SEERR || error.status === 404) return 'Cette adresse ne répond pas comme un serveur Seerr';
  if (error.status >= 300 && error.status < 400) return 'Cette adresse renvoie ailleurs : donnez celle où Seerr répond';
  if (error.status === 401 || error.status === 403) return 'Clé API refusée par Seerr';
  return 'Seerr a répondu par une erreur';
}

/** Seerr's media states: 5 there, 4 partly, 3 being added, 2 asked for, anything else not there. */
function statusOf(value: unknown): SeerrStatus {
  switch (value) {
    case 5:
      return 'available';
    case 4:
      return 'partial';
    case 3:
      return 'processing';
    case 2:
      return 'requested';
    default:
      return 'missing';
  }
}

export class SeerrClient {
  private readonly base: string;

  constructor(
    url: string,
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.base = url.replace(/\/+$/, '');
  }

  /** `keyed: false` for what anyone may ask: the key goes only to an address already known to be Seerr. */
  private async get(path: string, signal?: AbortSignal, keyed = true): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.base}/api/v1/${path}`, {
        headers: { accept: 'application/json', ...(keyed && this.apiKey ? { 'x-api-key': this.apiKey } : {}) },
        redirect: 'manual',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new SeerrError(0, 'unreachable');
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new SeerrError(response.status, `status ${response.status}`);
    }
    try {
      return await response.json();
    } catch {
      throw new SeerrError(NOT_SEERR, 'not json');
    }
  }

  /** Answers without a key, and is asked without it: throws unless the address is Seerr's. */
  async status(): Promise<void> {
    const body = await this.get('status', undefined, false);
    if (typeof body !== 'object' || body === null || typeof (body as { version?: unknown }).version !== 'string') throw new SeerrError(NOT_SEERR, 'not seerr');
  }

  /** Throws unless the key opens Seerr. */
  async me(): Promise<void> {
    await this.get('auth/me');
  }

  async search(query: string, signal?: AbortSignal): Promise<unknown[]> {
    const body = await this.get(`search?query=${seerrQuery(query)}&page=1`, signal);
    const results = typeof body === 'object' && body !== null ? (body as { results?: unknown }).results : null;
    return Array.isArray(results) ? results : [];
  }
}

/** A film's or a series' year among the reading's facts ("Année : 2021", "Year : 2021"); null when none says. */
export function workYear(facts: readonly string[]): string | null {
  for (const fact of facts) {
    const [label = '', value = ''] = fact.split(' : ');
    if (!/^(annee|year|sortie|release|date|premiere diffusion|first aired)/.test(foldText(label))) continue;
    const year = /\b(18|19|20)\d{2}\b/.exec(value)?.[0];
    if (year) return year;
  }
  return null;
}

interface Result {
  readonly id: number;
  readonly mediaType: 'movie' | 'tv';
  readonly title: string;
  readonly year: string;
  readonly status: SeerrStatus;
}

function resultOf(value: unknown): Result | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if ((raw.mediaType !== 'movie' && raw.mediaType !== 'tv') || !Number.isInteger(raw.id)) return null;
  const title = raw.mediaType === 'movie' ? raw.title : raw.name;
  const date = raw.mediaType === 'movie' ? raw.releaseDate : raw.firstAirDate;
  const info = typeof raw.mediaInfo === 'object' && raw.mediaInfo !== null ? (raw.mediaInfo as { status?: unknown }) : null;
  return { id: raw.id as number, mediaType: raw.mediaType, title: typeof title === 'string' ? title : '', year: typeof date === 'string' ? date.slice(0, 4) : '', status: statusOf(info?.status) };
}

/** The best of Seerr's results for a link: its kind, its year when the reading knows it, else Seerr's first. */
export function pickResult(results: readonly unknown[], link: Pick<LinkBrief, 'kind' | 'facts'>): Result | null {
  const kind = link.kind === 'series' ? 'tv' : 'movie';
  const candidates = results.map(resultOf).filter((result): result is Result => result !== null && result.mediaType === kind);
  const year = workYear(link.facts);
  return (year ? candidates.find(result => result.year === year) : undefined) ?? candidates[0] ?? null;
}

/** The link in Seerr: its page and state when the key lets the server search, else Seerr's search for it. */
export async function findInSeerr(config: { readonly url: string; readonly apiKey: string }, link: LinkBrief, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<SeerrResponse> {
  const search = seerrSearchUrl(config.url, link) ?? config.url;
  if (!config.apiKey || !link.title) return { url: search, status: null, title: '' };
  const found = pickResult(await new SeerrClient(config.url, config.apiKey, fetcher).search(link.title, signal), link);
  if (!found) return { url: search, status: null, title: '' };
  return { url: seerrPageUrl(config.url, found.mediaType, found.id), status: found.status, title: found.year ? `${found.title} (${found.year})` : found.title };
}
