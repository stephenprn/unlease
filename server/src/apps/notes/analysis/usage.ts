/**
 * The `analyses` table: one row per analysis run (and per sorting call and
 * module's search), with what it cost. It backs the monthly budget,
 * `GET /api/usage`, the 30-day cache of readings by normalized URL and the
 * modules' caches (promo codes and offers a few hours, ingredients a month).
 */
import type { Locale } from '@unlease/core/i18n';
import type { StatementSync } from 'node:sqlite';
import type { LinkAttribute, LinkKind } from '@unlease/notes/models/entities';
import type { Database } from '../../../db/database';
import type { TokenCounts } from './pricing';

export interface CallUsage extends TokenCounts {
  /** The model that answered (a refusal fallback may differ from the configured one). */
  readonly model: string;
  readonly costUsd: number;
}

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
}

export interface AnalysisEntry {
  readonly linkId: string;
  readonly url: string;
  readonly usage: CallUsage | null;
  readonly ok: boolean;
  readonly cached: boolean;
  readonly error: string | null;
  readonly durationMs: number;
  readonly result: CachedAnalysis | null;
}

/** A sorting call: what it cost, and how it ended. */
export interface SortEntry {
  readonly usage: CallUsage | null;
  readonly ok: boolean;
  readonly error: string | null;
  readonly durationMs: number;
}

/** What a module did for a link: its task in the table, and the key of its cache. */
export type ModuleTask = 'coupons' | 'cheaper' | 'secondhand' | 'recipe' | 'ratings' | 'recap' | 'coverage' | 'ask' | 'pages';

export type AnalysisTask = 'read' | 'sort' | ModuleTask;

/** What a module found for an address, kept so asking again soon costs nothing. */
export type Kept<T> = T & { readonly lang: Locale };

/** A module's run: what it cost, how it ended, and what it found. */
export interface ModuleEntry extends SortEntry {
  readonly linkId: string;
  readonly url: string;
  readonly result: object | null;
}

export interface UsageTotals {
  readonly analyses: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

export function monthStart(now: number): number {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

export class UsageStore {
  private readonly insert: StatementSync;
  private readonly sum: StatementSync;
  private readonly cost: StatementSync;
  private readonly latest: StatementSync;
  private readonly succeeded: StatementSync;
  private readonly kept: StatementSync;

  constructor(
    db: Database,
    private readonly now: () => number = Date.now,
  ) {
    this.insert = db.prepare(
      `INSERT INTO analyses (task, link_id, url, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
         cost_usd, ok, cached, error, duration_ms, created_at, result)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    // An analysis is a link read by Claude: cache hits and refusals before any call cost nothing and are not counted, sorting calls cost but read no link.
    this.sum = db.prepare(
      `SELECT count(CASE WHEN task = 'read' THEN model END) AS analyses,
         coalesce(sum(input_tokens + cache_read_tokens + cache_write_tokens), 0) AS inputTokens,
         coalesce(sum(output_tokens), 0) AS outputTokens,
         coalesce(sum(cost_usd), 0) AS costUsd
       FROM analyses WHERE created_at >= ?`,
    );
    this.cost = db.prepare('SELECT coalesce(sum(cost_usd), 0) AS cost FROM analyses WHERE created_at >= ?');
    this.latest = db.prepare(
      `SELECT result FROM analyses WHERE task = 'read' AND url = ? AND ok = 1 AND result IS NOT NULL AND created_at >= ?
       ORDER BY created_at DESC LIMIT 10`,
    );
    this.succeeded = db.prepare("SELECT 1 AS yes FROM analyses WHERE task = 'read' AND link_id = ? AND ok = 1 LIMIT 1");
    this.kept = db.prepare(
      `SELECT result FROM analyses WHERE task = ? AND url = ? AND ok = 1 AND result IS NOT NULL AND created_at >= ?
       ORDER BY created_at DESC LIMIT 5`,
    );
  }

  /** True when this link was analysed successfully before: a new `pending` is a request for a fresh read. */
  analysedBefore(linkId: string): boolean {
    return this.succeeded.get(linkId) !== undefined;
  }

  record(entry: AnalysisEntry): void {
    this.write('read', entry.linkId, entry.url, entry, entry.cached, entry.result);
  }

  recordSort(entry: SortEntry): void {
    this.write('sort', '', '', entry, false, null);
  }

  recordModule(task: ModuleTask, entry: ModuleEntry): void {
    this.write(task, entry.linkId, entry.url, entry, false, entry.result);
  }

  private write(task: AnalysisTask, linkId: string, url: string, entry: SortEntry, cached: boolean, result: object | null): void {
    const usage = entry.usage;
    this.insert.run(
      task,
      linkId,
      url,
      usage?.model ?? null,
      usage?.inputTokens ?? 0,
      usage?.outputTokens ?? 0,
      usage?.cacheReadTokens ?? 0,
      usage?.cacheWriteTokens ?? 0,
      usage?.costUsd ?? 0,
      entry.ok ? 1 : 0,
      cached ? 1 : 0,
      entry.error,
      Math.max(0, Math.round(entry.durationMs)),
      this.now(),
      result ? JSON.stringify(result) : null,
    );
  }

  costSince(since: number): number {
    return Number((this.cost.get(since) as { cost: number }).cost);
  }

  totals(since: number): UsageTotals {
    const row = this.sum.get(since) as { analyses: number; inputTokens: number; outputTokens: number; costUsd: number };
    return {
      analyses: Number(row.analyses),
      inputTokens: Number(row.inputTokens),
      outputTokens: Number(row.outputTokens),
      costUsd: Math.round(Number(row.costUsd) * 10_000) / 10_000,
    };
  }

  /** What a module last found for this address since `notBefore`, in this language (any, for null). */
  keptFor<T>(task: ModuleTask, url: string, notBefore: number, lang: Locale | null): Kept<T> | null {
    for (const row of this.kept.all(task, url, notBefore) as { result: string }[]) {
      try {
        const result = JSON.parse(row.result) as Kept<T>;
        if (lang === null || result.lang === lang) return result;
      } catch {
        // A row that does not parse is skipped.
      }
    }
    return null;
  }

  /** The latest reading of this address in this language: one in another language is not reused. */
  cached(url: string, notBefore: number, lang: Locale): CachedAnalysis | null {
    for (const row of this.latest.all(url, notBefore) as { result: string }[]) {
      try {
        const result = JSON.parse(row.result) as CachedAnalysis;
        if ((result.lang ?? 'fr') === lang) return result;
      } catch {
        // A row that does not parse is skipped.
      }
    }
    return null;
  }
}
