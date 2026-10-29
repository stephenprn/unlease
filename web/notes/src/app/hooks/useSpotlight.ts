/**
 * The spotlight's index and what it finds. Every page, note, collection and link of the library is
 * a document (`notes/services/spotlight`), indexed again when the library or the language changes,
 * a document whose words did not change keeping its entry, so typing only searches. Filters narrow
 * what a query finds (the type, labels, when it last changed); with no query they list what they
 * keep, newest first.
 */
import { getLocale, type Locale } from '@unlease/core/i18n';
import { buildIndex, isEmptyQuery, parseQuery, search, type Matcher, type SearchDoc, type SearchHit, type SearchIndex } from '@unlease/core/services/searchIndex';
import { SPOT_TYPES, spotlightDocs, type SpotMeta, type SpotType } from '@unlease/notes/services/spotlight';

import type { LibraryState } from '../store/library';
import { targetTitle } from './usePages';

let cached: { readonly state: LibraryState; readonly locale: Locale; readonly index: SearchIndex<SpotMeta> } | null = null;

/** The library's index, built again only after it changed (or the language did: kinds are named in it). */
export function spotlightIndex(state: LibraryState): SearchIndex<SpotMeta> {
  const locale = getLocale();
  if (cached && cached.state === state && cached.locale === locale) return cached.index;
  const docs = spotlightDocs(state, target => targetTitle(state, target) ?? '');
  const index = buildIndex(docs, cached?.locale === locale ? cached.index : null);
  cached = { state, locale, index };
  return index;
}

export type SpotScope = 'all' | SpotType;

export const SPOT_SCOPES: readonly SpotScope[] = ['all', ...SPOT_TYPES];

/** When it last changed: any time, today, this week, this month, this year. */
export const SPOT_SINCE = ['day', 'week', 'month', 'year'] as const;

export type SpotSince = (typeof SPOT_SINCE)[number];

export interface SpotFilters {
  readonly scope: SpotScope;
  /** A note must wear every one. */
  readonly labelIds: readonly string[];
  readonly since: SpotSince | null;
  /** Newest first instead of best first. */
  readonly byDate: boolean;
}

export interface SpotResults {
  /** What the scope keeps: titles, then content, then partial hits; or, with no query, everything the filters keep. */
  readonly hits: readonly SearchHit<SpotMeta>[];
  /** How many each scope would show. */
  readonly counts: Readonly<Record<SpotScope, number>>;
  readonly matcher: Matcher;
  /** Nothing matched as typed: these allow a typo. */
  readonly typos: boolean;
  /** No query: a listing of what the filters keep. */
  readonly browsing: boolean;
  /** Nothing in the scope and filters, this many with none of them; null when there is nothing to widen. */
  readonly everywhere: number | null;
}

const DAY = 86_400_000;

/** The first moment a filter keeps. */
export function sinceTime(since: SpotSince, now: number): number {
  switch (since) {
    case 'day': {
      const midnight = new Date(now);
      midnight.setHours(0, 0, 0, 0);
      return midnight.getTime();
    }
    case 'week':
      return now - 7 * DAY;
    case 'month':
      return now - 30 * DAY;
    case 'year':
      return now - 365 * DAY;
  }
}

function countByScope(hits: readonly { readonly doc: SearchDoc<SpotMeta> }[]): Record<SpotScope, number> {
  const counts: Record<SpotScope, number> = { all: hits.length, page: 0, note: 0, collection: 0, link: 0 };
  for (const hit of hits) counts[hit.doc.meta.type] += 1;
  return counts;
}

/** What the spotlight shows for a query and filters; `boost` lifts what the person opened lately or picked before. */
export function runSpotlight(index: SearchIndex<SpotMeta>, text: string, filters: SpotFilters, boost: (key: string) => number, now: number): SpotResults {
  const query = parseQuery(text);
  const from = filters.since ? sinceTime(filters.since, now) : null;
  const refined = filters.labelIds.length > 0 || from !== null;
  const keeps = (doc: SearchDoc<SpotMeta>): boolean => (from === null || doc.editedAt >= from) && filters.labelIds.every(id => doc.meta.labelIds.includes(id));
  const inScope = (doc: SearchDoc<SpotMeta>): boolean => filters.scope === 'all' || doc.meta.type === filters.scope;
  if (isEmptyQuery(query)) {
    const kept = index.docs.filter(keeps).map((doc): SearchHit<SpotMeta> => ({ doc, tier: 'content', score: 0, missing: [] }));
    const hits = kept.filter(hit => inScope(hit.doc)).sort((a, b) => b.doc.editedAt - a.doc.editedAt);
    return { hits, counts: countByScope(kept), matcher: new Map(), typos: false, browsing: true, everywhere: null };
  }
  const found = search(index, query, { filter: keeps, boost: doc => boost(doc.key), byDate: filters.byDate, now });
  const hits = found.hits.filter(hit => inScope(hit.doc));
  let everywhere: number | null = null;
  if (hits.length === 0 && (refined || filters.scope !== 'all')) {
    const wide = refined ? search(index, query, { now }).hits.length : found.hits.length;
    everywhere = wide > 0 ? wide : null;
  }
  return { hits, counts: countByScope(found.hits), matcher: found.matcher, typos: found.typos, browsing: false, everywhere };
}
