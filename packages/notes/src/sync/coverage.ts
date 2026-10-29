/**
 * "Autres regards": Claude looking on the web for the same story in other outlets, with each one's
 * angle and what it adds or contradicts. `POST /api/coverage` a CoverageRequest -> CoverageResponse,
 * or 4xx/5xx { error } in French. Nothing is written; the server keeps an answer half a day.
 */
import { isLocale, type Locale } from '@unlease/core/i18n';
import { isoDay } from './coupons';
import { cleanText, parseLinkBrief, webAddress, type LinkBrief } from './brief';

export interface CoverageRequest {
  readonly link: LinkBrief;
  readonly lang: Locale;
  readonly fresh: boolean;
}

export interface CoverageOutlet {
  /** "Le Monde", "BBC News". */
  readonly outlet: string;
  readonly title: string;
  readonly url: string | null;
  /** The day it was published (`2026-10-21`), when the page says. */
  readonly date: string | null;
  /** How it tells the story, in a few words. */
  readonly angle: string;
  /** What it adds to the saved article, or contradicts in it; '' when nothing. */
  readonly adds: string;
}

export interface CoverageResponse {
  /** The story, in one sentence. */
  readonly story: string;
  readonly outlets: readonly CoverageOutlet[];
  /** Where they agree or not, in one or two sentences, or ''. */
  readonly note: string;
  readonly searchedAt: number;
}

export const COVERAGE_LIMITS = { outlets: 6, outlet: 80, title: 240, angle: 240, adds: 300, story: 300, note: 500 } as const;

export function parseCoverageRequest(body: unknown): CoverageRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as { link?: unknown; lang?: unknown; fresh?: unknown };
  const link = parseLinkBrief(raw.link);
  return link ? { link, lang: isLocale(raw.lang) ? raw.lang : 'fr', fresh: raw.fresh === true } : null;
}

export function parseCoverageLists(story: unknown, outlets: unknown, note: unknown): Omit<CoverageResponse, 'searchedAt'> {
  const kept: CoverageOutlet[] = [];
  for (const entry of Array.isArray(outlets) ? outlets : []) {
    const raw = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
    const outlet = cleanText(raw.outlet, COVERAGE_LIMITS.outlet);
    const angle = cleanText(raw.angle, COVERAGE_LIMITS.angle);
    if (!outlet || !angle) continue;
    kept.push({ outlet, title: cleanText(raw.title, COVERAGE_LIMITS.title), url: webAddress(raw.url), date: isoDay(raw.date), angle, adds: cleanText(raw.adds, COVERAGE_LIMITS.adds) });
    if (kept.length === COVERAGE_LIMITS.outlets) break;
  }
  return { story: cleanText(story, COVERAGE_LIMITS.story), outlets: kept, note: cleanText(note, COVERAGE_LIMITS.note) };
}

export function parseCoverageResponse(body: unknown): CoverageResponse | null {
  if (typeof body !== 'object' || body === null) return null;
  const raw = body as { story?: unknown; outlets?: unknown; note?: unknown; searchedAt?: unknown };
  if (!Array.isArray(raw.outlets) || typeof raw.searchedAt !== 'number') return null;
  return { ...parseCoverageLists(raw.story, raw.outlets, raw.note), searchedAt: raw.searchedAt };
}
