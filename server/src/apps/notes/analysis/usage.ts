/**
 * Carnet's rows in the suite's spending (`claude/usage.ts`): a link read (`read`, kept 30 days as a
 * cache of readings by normalized address, language and the template version it was read with), a
 * sorting call (`sort`), each link module's task, which also names its cache, and « Essayer » on a
 * template (`template`).
 */
import type { Locale } from '@unlease/core/i18n';
import type { LinkAttribute, LinkKind } from '@unlease/notes/models/entities';
import type { CallEntry, UsageStore } from '../../../claude/usage';

/** A link read by Claude: the only task `/api/usage` counts as an analysis. */
export const READ_TASK = 'read';
export const SORT_TASK = 'sort';

/** What a module did for a link: its task in the table, and the key of its cache. */
export type ModuleTask = 'coupons' | 'cheaper' | 'secondhand' | 'recipe' | 'ratings' | 'recap' | 'coverage' | 'ask' | 'template';

/** A finished analysis, kept so the same URL saved again costs nothing. */
export interface CachedAnalysis {
  readonly title: string;
  readonly summary: string;
  readonly kind: LinkKind;
  readonly price: number | null;
  readonly currency: string | null;
  readonly attributes: readonly LinkAttribute[];
  readonly siteName: string;
  readonly imageUrl: string | null;
  /** Source URLs of the kept images, in `imageIds` order. */
  readonly imageUrls: readonly string[];
  readonly imageIds: readonly string[];
  /** The list Claude chose (absent from results kept before it was), found by id, else by name, when the cache is reused. */
  readonly listId?: string | null;
  readonly listTitle: string | null;
  /** The language it was written in (French for results kept before it was recorded). */
  readonly lang?: Locale;
  /** The template version its facts were read with (`readingSignature`): « preset » for results kept before templates. */
  readonly readWith?: string;
}

/** A link read: what it cost, how it ended, and the reading kept for the cache. */
export interface AnalysisEntry extends CallEntry {
  readonly linkId: string;
  readonly url: string;
  readonly cached: boolean;
  readonly result: CachedAnalysis | null;
}

/**
 * The latest reading of this address in this language: one in another language is not reused, nor
 * one `fits` refuses (read with another template than the link would be read with now).
 */
export function cachedReading(usage: UsageStore, url: string, notBefore: number, lang: Locale, fits: (reading: CachedAnalysis) => boolean = () => true): CachedAnalysis | null {
  return usage.results<CachedAnalysis>(READ_TASK, url, notBefore, 10).find(result => (result.lang ?? 'fr') === lang && fits(result)) ?? null;
}

/** True when this link was read well before: a new `pending` is a request for a fresh read. */
export const analysedBefore = (usage: UsageStore, linkId: string): boolean => usage.succeededFor(READ_TASK, linkId);
