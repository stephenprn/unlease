/**
 * Claude sorting links that are already saved (`POST /api/sort`). The links go in batches, each
 * with every collection, numbered, so Claude answers only with numbers it was given; the moves
 * go back to the app, which writes them. Each call is billed to the month like a reading. After a
 * failed batch (or once the budget is spent) no new batch starts, and the moves of the batches
 * that answered still go back, marked incomplete: they were paid for.
 */
import { INBOX_ID } from '@unlease/notes/models/entities';
import type { SortLink, SortMove, SortRequest } from '@unlease/notes/sync/sorting';
import { log } from '../../../log';
import { ModelError, type SortAnswer } from './model';
import type { AnalysisContext } from './provider';
import { monthStart, type UsageStore } from './usage';

/** Links per call: an answer that comes back in seconds, and a short message. */
const BATCH = 60;
const CONCURRENCY = 3;

export type SortOutcome =
  | { readonly ok: true; readonly moves: readonly SortMove[]; readonly incomplete: string | null }
  | { readonly ok: false; readonly status: 409 | 502; readonly error: string };

const BUDGET_SPENT = 'Budget mensuel atteint';

export interface LinkSorterOptions {
  readonly usage: UsageStore;
  /** Read for every request, so a key, model or budget set from the apps applies at once. */
  readonly analysis: () => AnalysisContext;
  readonly now?: () => number;
}

/** Claude's numbers as moves: an unknown number, a second move of a link or a move where it already is, dropped. */
export function movesFrom(answer: SortAnswer['moves'], links: readonly SortLink[], request: SortRequest): SortMove[] {
  const moves: SortMove[] = [];
  const seen = new Set<string>();
  for (const { link, to } of answer) {
    const item = links[link - 1];
    const target = to === 0 ? (request.task === 'review' ? INBOX_ID : undefined) : request.targets[to - 1]?.id;
    if (!item || !target || target === request.from || seen.has(item.id)) continue;
    seen.add(item.id);
    moves.push({ link: item.id, to: target });
  }
  return moves;
}

async function inPool<T, R>(items: readonly T[], concurrency: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export class LinkSorter {
  private readonly now: () => number;

  constructor(private readonly options: LinkSorterOptions) {
    this.now = options.now ?? Date.now;
  }

  async sort(request: SortRequest, signal: AbortSignal): Promise<SortOutcome> {
    const { usage } = this.options;
    const { model, budgetUsd } = this.options.analysis();
    if (!model) return { ok: false, status: 409, error: 'Claude ne lit pas les liens : ajoutez une clé dans l’administration.' };
    const spent = () => usage.costSince(monthStart(this.now())) >= budgetUsd;
    if (spent()) return { ok: false, status: 409, error: BUDGET_SPENT };

    const from = request.from === null ? null : request.targets.findIndex(target => target.id === request.from);
    const batches: SortLink[][] = [];
    for (let start = 0; start < request.links.length; start += BATCH) batches.push(request.links.slice(start, start + BATCH));

    // The first reason to stop: no batch starts after it. Null in the results: a batch never sent.
    let stop: string | null = null;
    const results = await inPool(batches, CONCURRENCY, async (links): Promise<SortMove[] | string | null> => {
      if (stop !== null) return null;
      if (signal.aborted) return (stop = 'Claude a mis trop de temps');
      if (spent()) return (stop = BUDGET_SPENT);
      const started = this.now();
      try {
        const answer = await model.sort({ task: request.task, targets: request.targets, from, links }, signal);
        usage.recordSort({ usage: answer.usage, ok: true, error: null, durationMs: this.now() - started });
        return movesFrom(answer.moves, links, request);
      } catch (error) {
        if (signal.aborted) return (stop ??= 'Claude a mis trop de temps');
        if (!(error instanceof ModelError)) log.error('link sorting crashed', { error });
        const message = error instanceof ModelError ? error.message : 'Erreur du tri';
        usage.recordSort({ usage: error instanceof ModelError ? error.usage : null, ok: false, error: message, durationMs: this.now() - started });
        return (stop ??= message);
      }
    });

    const answered = results.filter((result): result is SortMove[] => Array.isArray(result));
    const failure = results.find((result): result is string => typeof result === 'string') ?? null;
    if (answered.length === 0) return { ok: false, status: failure === BUDGET_SPENT ? 409 : 502, error: failure ?? 'Erreur du tri' };
    const moves = answered.flat();
    log.info('links sorted', { task: request.task, links: request.links.length, moves: moves.length, ...(failure ? { incomplete: failure } : {}) });
    return { ok: true, moves, incomplete: answered.length < batches.length ? (failure ?? 'Erreur du tri') : null };
  }
}
