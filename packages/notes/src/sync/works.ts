/**
 * Claude on films, series, books, music and games: a series' recap up to where the person stopped
 * (`POST /api/recap`), and a work's ratings on SensCritique, IMDb and Rotten Tomatoes
 * (`POST /api/ratings`). Each is a RequestX -> ResponseX, or 4xx/5xx { error } in French. Nothing is
 * written; the server keeps a recap a month and ratings a week, by address and language.
 */
import { isLocale, type Locale } from '@unlease/core/i18n';
import { amount, cleanText, parseLinkBrief, webAddress, type LinkBrief } from './brief';

export interface RecapRequest {
  readonly link: LinkBrief;
  /** The last season watched, from 1. */
  readonly season: number;
  /** The last episode watched in it; null: the whole season. */
  readonly episode: number | null;
  readonly lang: Locale;
  readonly fresh: boolean;
}

export interface RecapCharacter {
  readonly name: string;
  readonly note: string;
}

export interface RecapResponse {
  /** Paragraphs, separated by a blank line. */
  readonly recap: string;
  readonly characters: readonly RecapCharacter[];
  /** Where the recap stops, in one sentence: "Fin de la saison 2." */
  readonly stop: string;
  readonly searchedAt: number;
}

export interface RatingsRequest {
  readonly link: LinkBrief;
  readonly lang: Locale;
  readonly fresh: boolean;
}

export interface Rating {
  /** "SensCritique", "IMDb", "Rotten Tomatoes". */
  readonly source: string;
  /** Which of the site's scores: "Critiques", "Public", or ''. */
  readonly label: string;
  readonly value: number;
  /** What the value is out of: 10, 100. */
  readonly scale: number;
  /** How many voted, as the site says it ("12 k"), or ''. */
  readonly count: string;
  readonly url: string | null;
}

export interface RatingsResponse {
  /** The work the ratings are for, as found: "Dune (2021)". */
  readonly work: string;
  readonly ratings: readonly Rating[];
  readonly searchedAt: number;
}

export const WORK_LIMITS = { recap: 6000, stop: 300, characters: 8, character: 80, note: 240, ratings: 8, work: 200 } as const;

const seasonOf = (value: unknown): number | null => (Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 200 ? (value as number) : null);

export function parseRecapRequest(body: unknown): RecapRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as { link?: unknown; season?: unknown; episode?: unknown; lang?: unknown; fresh?: unknown };
  const link = parseLinkBrief(raw.link);
  const season = seasonOf(raw.season);
  if (!link || season === null) return null;
  return { link, season, episode: seasonOf(raw.episode), lang: isLocale(raw.lang) ? raw.lang : 'fr', fresh: raw.fresh === true };
}

/** A recap's paragraphs: kept whole, blank lines between them, within the limit. */
function paragraphs(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .split(/\n\s*\n/)
    .map(part => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, WORK_LIMITS.recap);
}

export function parseRecapLists(recap: unknown, characters: unknown, stop: unknown): Omit<RecapResponse, 'searchedAt'> {
  const people = (Array.isArray(characters) ? characters : [])
    .map(entry => {
      const raw = (typeof entry === 'object' && entry !== null ? entry : {}) as { name?: unknown; note?: unknown };
      return { name: cleanText(raw.name, WORK_LIMITS.character), note: cleanText(raw.note, WORK_LIMITS.note) };
    })
    .filter(person => person.name)
    .slice(0, WORK_LIMITS.characters);
  return { recap: paragraphs(recap), characters: people, stop: cleanText(stop, WORK_LIMITS.stop) };
}

export function parseRecapResponse(body: unknown): RecapResponse | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as { recap?: unknown; characters?: unknown; stop?: unknown; searchedAt?: unknown };
  const lists = parseRecapLists(raw.recap, raw.characters, raw.stop);
  if (!lists.recap || typeof raw.searchedAt !== 'number') return null;
  return { ...lists, searchedAt: raw.searchedAt };
}

export function parseRatingsRequest(body: unknown): RatingsRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as { link?: unknown; lang?: unknown; fresh?: unknown };
  const link = parseLinkBrief(raw.link);
  return link ? { link, lang: isLocale(raw.lang) ? raw.lang : 'fr', fresh: raw.fresh === true } : null;
}

/** A rating that holds together: a source, a value within its scale. */
export function parseRating(value: unknown): Rating | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const source = cleanText(raw.source, 60);
  const score = amount(raw.value);
  const scale = amount(raw.scale);
  if (!source || score === null || scale === null || scale === 0 || score > scale) return null;
  return { source, label: cleanText(raw.label, 40), value: Math.round(score * 10) / 10, scale, count: cleanText(raw.count, 40), url: webAddress(raw.url) };
}

export function parseRatingsLists(work: unknown, ratings: unknown): Omit<RatingsResponse, 'searchedAt'> {
  const kept = (Array.isArray(ratings) ? ratings : []).map(parseRating).filter((rating): rating is Rating => rating !== null).slice(0, WORK_LIMITS.ratings);
  return { work: cleanText(work, WORK_LIMITS.work), ratings: kept };
}

export function parseRatingsResponse(body: unknown): RatingsResponse | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as { work?: unknown; ratings?: unknown; searchedAt?: unknown };
  if (!Array.isArray(raw.ratings) || typeof raw.searchedAt !== 'number') return null;
  return { ...parseRatingsLists(raw.work, raw.ratings), searchedAt: raw.searchedAt };
}
