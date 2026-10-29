/**
 * The link modules' searches on the web (`POST /api/coupons`, `/api/offers`, `/api/ratings`,
 * `/api/recap`, `/api/coverage`): an answer is kept a while by task, address and language (a few
 * hours for prices, half a day for the news, a week for ratings, a month for a recap), so the same
 * link asked again, from any device, costs nothing, and a search already running for it is joined,
 * never started twice. A search outlives the request that started it (the sheet may be closed
 * meanwhile): it is billed either way, so its answer waits for the next ask. It stops at its
 * deadline, billed as far as it went.
 */
import type { Locale } from '@unlease/core/i18n';
import { normalizeUrl } from '@unlease/core/services/url';
import type { LinkBrief } from '@unlease/notes/sync/brief';
import type { CouponRequest, CouponResponse } from '@unlease/notes/sync/coupons';
import type { CoverageRequest, CoverageResponse } from '@unlease/notes/sync/coverage';
import type { OfferRequest, OfferResponse } from '@unlease/notes/sync/offers';
import type { RatingsRequest, RatingsResponse, RecapRequest, RecapResponse } from '@unlease/notes/sync/works';
import { CLAUDE_COST_PER_LINK, CLAUDE_COST_PER_WEB_SEARCH, isClaudeModel } from '@unlease/core/sync/settings';
import { log } from '../../../log';
import { ModelError, type LinkModel, type ModuleSearch } from './model';
import type { AnalysisContext } from './provider';
import { monthStart, type CallUsage, type Kept, type ModuleTask, type UsageStore } from './usage';

/** How long an answer is shown again without a new search: prices move within the day. */
export const SEARCH_KEEP_MS = 6 * 3_600_000;
const HOUR_MS = 3_600_000;
/** The other searches: the news within the day, ratings within the week, a recap stays true. */
const KEEP_MS = { coverage: 12 * HOUR_MS, ratings: 7 * 24 * HOUR_MS, recap: 30 * 24 * HOUR_MS } as const;
/** A search gives up before Cloudflare does (100 s), so the app hears why. */
const DEADLINE_MS = 90_000;

export const NO_KEY = 'Claude ne lit pas les liens : ajoutez une clé dans l’administration.';
export const BUDGET_SPENT = 'Budget mensuel atteint';

export type ModuleOutcome<T> = { readonly ok: true; readonly answer: T } | { readonly ok: false; readonly status: 409 | 502; readonly error: string };

export interface LinkSearchesOptions {
  readonly usage: UsageStore;
  /** Read for every search, so a key, model or budget set from the apps applies at once. */
  readonly analysis: () => AnalysisContext;
  readonly now?: () => number;
  /** Tests shorten it. */
  readonly deadlineMs?: number;
}

interface SearchAsk {
  readonly link: LinkBrief;
  readonly lang: Locale;
  readonly fresh: boolean;
}

type Found<T> = T & { readonly searchedAt: number };

/** How long an answer is kept, and what besides the address tells answers apart (the episode a recap stops at). */
interface Keeping {
  readonly ms: number;
  readonly variant?: string;
}

export const isoDay = (time: number): string => new Date(time).toISOString().slice(0, 10);

/**
 * A call cut off by the deadline has run searches nobody reported: counted at a whole search's estimate,
 * so the budget errs high; a call that only read a page (`reading`), at a reading's.
 */
export function withCutOffCall(spent: CallUsage | null, model: string, reading = false): CallUsage {
  const costs = reading ? CLAUDE_COST_PER_LINK : CLAUDE_COST_PER_WEB_SEARCH;
  const estimate = isClaudeModel(model) ? costs[model] : Math.max(...Object.values(costs));
  const base = spent ?? { model, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 };
  return { ...base, costUsd: base.costUsd + estimate };
}

/** A kept answer as it is sent: without the language it was kept under. */
function sent<T extends object>(kept: Kept<T>): T {
  const answer: Record<string, unknown> = { ...kept };
  delete answer.lang;
  return answer as T;
}

export class LinkSearches {
  private readonly now: () => number;
  private readonly running = new Map<string, Promise<ModuleOutcome<unknown>>>();

  constructor(private readonly options: LinkSearchesOptions) {
    this.now = options.now ?? Date.now;
  }

  coupons(request: CouponRequest): Promise<ModuleOutcome<CouponResponse>> {
    return this.find('coupons', request, async (model, search, signal) => {
      const { usage, coupons, tips } = await model.findCoupons(search, signal);
      return { usage, found: { coupons, tips } };
    });
  }

  offers(request: OfferRequest): Promise<ModuleOutcome<OfferResponse>> {
    return this.find(request.market === 'new' ? 'cheaper' : 'secondhand', request, async (model, search, signal) => {
      const { usage, offers, range, note } = await model.findOffers({ ...search, market: request.market }, signal);
      return { usage, found: { offers, range, note } };
    });
  }

  ratings(request: RatingsRequest): Promise<ModuleOutcome<RatingsResponse>> {
    return this.find(
      'ratings',
      request,
      async (model, search, signal) => {
        const { usage, work, ratings } = await model.findRatings(search, signal);
        return { usage, found: { work, ratings } };
      },
      { ms: KEEP_MS.ratings },
    );
  }

  recap(request: RecapRequest): Promise<ModuleOutcome<RecapResponse>> {
    return this.find(
      'recap',
      request,
      async (model, search, signal) => {
        const { usage, recap, characters, stop } = await model.writeRecap({ ...search, season: request.season, episode: request.episode }, signal);
        return { usage, found: { recap, characters, stop } };
      },
      { ms: KEEP_MS.recap, variant: `s${request.season}e${request.episode ?? 0}` },
    );
  }

  coverage(request: CoverageRequest): Promise<ModuleOutcome<CoverageResponse>> {
    return this.find(
      'coverage',
      request,
      async (model, search, signal) => {
        const { usage, story, outlets, note } = await model.findCoverage(search, signal);
        return { usage, found: { story, outlets, note } };
      },
      { ms: KEEP_MS.coverage },
    );
  }

  private find<T extends object>(
    task: ModuleTask,
    request: SearchAsk,
    run: (model: LinkModel, search: ModuleSearch, signal: AbortSignal) => Promise<{ usage: CallUsage; found: T }>,
    keeping: Keeping = { ms: SEARCH_KEEP_MS },
  ): Promise<ModuleOutcome<Found<T>>> {
    // A variant is kept under the address with its mark, so each has its own answer.
    const url = keeping.variant ? `${normalizeUrl(request.link.url)}#${keeping.variant}` : normalizeUrl(request.link.url);
    const key = `${task} ${request.lang} ${url}`;
    // A search under way is as fresh as one started now.
    const running = this.running.get(key) as Promise<ModuleOutcome<Found<T>>> | undefined;
    if (running) return running;
    if (!request.fresh) {
      const kept = this.options.usage.keptFor<Found<T>>(task, url, this.now() - keeping.ms, request.lang);
      if (kept) return Promise.resolve({ ok: true, answer: sent(kept) });
    }
    const search = this.search(task, request, url, run).finally(() => this.running.delete(key));
    this.running.set(key, search);
    return search;
  }

  private async search<T extends object>(
    task: ModuleTask,
    request: SearchAsk,
    url: string,
    run: (model: LinkModel, search: ModuleSearch, signal: AbortSignal) => Promise<{ usage: CallUsage; found: T }>,
  ): Promise<ModuleOutcome<Found<T>>> {
    const { usage } = this.options;
    const { model, budgetUsd } = this.options.analysis();
    if (!model) return { ok: false, status: 409, error: NO_KEY };
    if (usage.costSince(monthStart(this.now())) >= budgetUsd) return { ok: false, status: 409, error: BUDGET_SPENT };
    const started = this.now();
    const signal = AbortSignal.timeout(this.options.deadlineMs ?? DEADLINE_MS);
    try {
      const { usage: spent, found } = await run(model, { link: request.link, lang: request.lang, today: isoDay(started) }, signal);
      const answer: Found<T> = { ...found, searchedAt: this.now() };
      usage.recordModule(task, { linkId: request.link.id, url, usage: spent, ok: true, error: null, durationMs: this.now() - started, result: { ...answer, lang: request.lang } });
      log.info('module searched the web', { task, costUsd: Math.round(spent.costUsd * 10_000) / 10_000 });
      return { ok: true, answer };
    } catch (error) {
      if (!signal.aborted && !(error instanceof ModelError)) log.error('module search crashed', { task, error });
      const message = signal.aborted ? 'Claude a mis trop de temps' : error instanceof ModelError ? error.message : 'Erreur de la recherche';
      const spent = error instanceof ModelError ? error.usage : null;
      usage.recordModule(task, { linkId: request.link.id, url, usage: signal.aborted ? withCutOffCall(spent, model.model) : spent, ok: false, error: message, durationMs: this.now() - started, result: null });
      return { ok: false, status: 502, error: message };
    }
  }
}
