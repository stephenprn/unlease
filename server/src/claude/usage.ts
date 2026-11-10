/**
 * What Claude has cost, for every app: the `analyses` table, one row per call (a task each app
 * names: Carnet's `read`, `sort` and its modules', Pages' `pages`), with what it cost and, when the
 * app keeps it, what it found. It backs the monthly budget, `GET /api/usage`, and the caches the
 * apps keep of earlier answers by task and address. A call in flight holds what it may cost against
 * the budget (`hold`) until its cost is recorded, so calls started together cannot all pass a
 * budget one of them could exhaust.
 */
import type { StatementSync } from 'node:sqlite';
import type { Locale } from '@unlease/core/i18n';
import type { Database } from '../db/database';
import type { TokenCounts } from './pricing';

export interface CallUsage extends TokenCounts {
  /** The model that answered (a refusal fallback may differ from the configured one). */
  readonly model: string;
  readonly costUsd: number;
}

/** One call: what it was about, what it cost, how it ended, and what it found (kept for the app's cache). */
export interface CallEntry {
  /** The record it was about (a link's id), or ''. */
  readonly linkId?: string;
  /** The address it read or asked about, or ''. */
  readonly url?: string;
  readonly usage: CallUsage | null;
  readonly ok: boolean;
  /** Answered from the app's cache: nothing was spent. */
  readonly cached?: boolean;
  readonly error: string | null;
  readonly durationMs: number;
  readonly result?: object | null;
}

/** What a call found for an address, kept so asking again soon costs nothing. */
export type Kept<T> = T & { readonly lang: Locale };

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

/** A hold a crash left behind stops weighing on the budget after this: longer than any call's deadline. */
const HOLD_LIMIT_MS = 15 * 60_000;

/**
 * One call to Claude against this month's budget, from before its first request until its cost is
 * recorded: each request it sends is held at its worst (`cover`, from the client), then at what it
 * cost (`settle`), and `release` lets it all go once the app has recorded the call, or when it ends
 * without a request.
 */
export class BudgetHold {
  private started = false;
  private known = 0;
  private pending = 0;
  private released = false;

  constructor(
    private readonly store: UsageStore,
    readonly budgetUsd: number,
    readonly openedAt: number,
  ) {}

  /** What it holds against the budget now. */
  get amount(): number {
    return this.released ? 0 : this.known + this.pending;
  }

  get open(): boolean {
    return !this.released;
  }

  /**
   * Before a request: holds `worstUsd` for it. The call's first request is refused (false, nothing
   * held) when what is spent and what the other calls in flight hold already reach the budget; the
   * requests after it (a paused tool loop resumed) are never cut off, as a call alone never was.
   */
  cover(worstUsd: number): boolean {
    if (this.released) return true;
    if (!this.started && this.store.committed(this) >= this.budgetUsd) return false;
    this.started = true;
    this.pending = Math.max(0, worstUsd);
    return true;
  }

  /** The request in flight ended, costing `costUsd`: held as such until the call is recorded. */
  settle(costUsd: number): void {
    if (this.released) return;
    this.known += Math.max(0, costUsd);
    this.pending = 0;
  }

  /** Once the call's cost is recorded (or it ended without one). Safe to call twice. */
  release(): void {
    if (this.released) return;
    this.released = true;
    this.store.forget(this);
  }
}

export interface UsageStoreOptions {
  /** The tasks `analyses` counts in `/api/usage` (Carnet's links read); every call counts in the costs. */
  readonly counted?: readonly string[];
}

export class UsageStore {
  private readonly insert: StatementSync;
  private readonly sum: StatementSync;
  private readonly cost: StatementSync;
  private readonly found: StatementSync;
  private readonly succeeded: StatementSync;
  private readonly counted: string;
  private readonly holds = new Set<BudgetHold>();

  constructor(
    db: Database,
    private readonly now: () => number = Date.now,
    options: UsageStoreOptions = {},
  ) {
    this.counted = JSON.stringify(options.counted ?? []);
    this.insert = db.prepare(
      `INSERT INTO analyses (task, link_id, url, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
         cost_usd, ok, cached, error, duration_ms, created_at, result)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    // Cache hits and refusals before any call cost nothing and are not counted.
    this.sum = db.prepare(
      `SELECT count(CASE WHEN task IN (SELECT value FROM json_each(?)) THEN model END) AS analyses,
         coalesce(sum(input_tokens + cache_read_tokens + cache_write_tokens), 0) AS inputTokens,
         coalesce(sum(output_tokens), 0) AS outputTokens,
         coalesce(sum(cost_usd), 0) AS costUsd
       FROM analyses WHERE created_at >= ?`,
    );
    this.cost = db.prepare('SELECT coalesce(sum(cost_usd), 0) AS cost FROM analyses WHERE created_at >= ?');
    this.found = db.prepare(
      `SELECT result FROM analyses WHERE task = ? AND url = ? AND ok = 1 AND result IS NOT NULL AND created_at >= ?
       ORDER BY created_at DESC LIMIT ?`,
    );
    this.succeeded = db.prepare('SELECT 1 AS yes FROM analyses WHERE task = ? AND link_id = ? AND ok = 1 LIMIT 1');
  }

  record(task: string, entry: CallEntry): void {
    const usage = entry.usage;
    this.insert.run(
      task,
      entry.linkId ?? '',
      entry.url ?? '',
      usage?.model ?? null,
      usage?.inputTokens ?? 0,
      usage?.outputTokens ?? 0,
      usage?.cacheReadTokens ?? 0,
      usage?.cacheWriteTokens ?? 0,
      usage?.costUsd ?? 0,
      entry.ok ? 1 : 0,
      entry.cached ? 1 : 0,
      entry.error,
      Math.max(0, Math.round(entry.durationMs)),
      this.now(),
      entry.result ? JSON.stringify(entry.result) : null,
    );
  }

  costSince(since: number): number {
    return Number((this.cost.get(since) as { cost: number }).cost);
  }

  /** What the calls in flight hold against the budget (but `except`'s). */
  held(except?: BudgetHold): number {
    const cutoff = this.now() - HOLD_LIMIT_MS;
    let total = 0;
    for (const hold of this.holds) {
      if (hold.openedAt < cutoff) {
        this.holds.delete(hold);
        continue;
      }
      if (hold !== except) total += hold.amount;
    }
    return total;
  }

  /** This month's spending, and what the calls in flight hold (but `except`'s). */
  committed(except?: BudgetHold): number {
    return this.costSince(monthStart(this.now())) + this.held(except);
  }

  /** Whether this month's spending, with what the calls in flight may still cost, reached `budgetUsd`. */
  spent(budgetUsd: number): boolean {
    return this.committed() >= budgetUsd;
  }

  /**
   * Opens a call against the budget: null when it is already reached (`spent`); otherwise a hold the
   * call's client covers each request with (`ClaudeClient.holding`), released once the call is recorded.
   */
  hold(budgetUsd: number): BudgetHold | null {
    if (this.spent(budgetUsd)) return null;
    const hold = new BudgetHold(this, budgetUsd, this.now());
    this.holds.add(hold);
    return hold;
  }

  /** @internal A hold released. */
  forget(hold: BudgetHold): void {
    this.holds.delete(hold);
  }

  totals(since: number): UsageTotals {
    const row = this.sum.get(this.counted, since) as { analyses: number; inputTokens: number; outputTokens: number; costUsd: number };
    return {
      analyses: Number(row.analyses),
      inputTokens: Number(row.inputTokens),
      outputTokens: Number(row.outputTokens),
      costUsd: Math.round(Number(row.costUsd) * 10_000) / 10_000,
    };
  }

  /** True when a call of `task` about this record ended well before. */
  succeededFor(task: string, linkId: string): boolean {
    return this.succeeded.get(task, linkId) !== undefined;
  }

  /** What calls of `task` found for this address since `notBefore`, newest first, at most `limit`. */
  results<T>(task: string, url: string, notBefore: number, limit: number): T[] {
    const out: T[] = [];
    for (const row of this.found.all(task, url, notBefore, limit) as { result: string }[]) {
      try {
        out.push(JSON.parse(row.result) as T);
      } catch {
        // A row that does not parse is skipped.
      }
    }
    return out;
  }

  /** What a call last found for this address since `notBefore`, in this language (any, for null). */
  keptFor<T>(task: string, url: string, notBefore: number, lang: Locale | null): Kept<T> | null {
    return this.results<Kept<T>>(task, url, notBefore, 5).find(result => lang === null || result.lang === lang) ?? null;
  }
}
