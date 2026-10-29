/**
 * "Demander à Claude" on the pages (`POST /api/pages/ask`): a question about pages the app sends,
 * each as the blocks Claude may cite, answered from them (and from the web when the Administration
 * allows it and the person ticks it). Off until the Administration turns it on; each question is
 * held to the reach set there. Nothing is kept: the same question asked twice at once is joined.
 * Billed like the modules, within the monthly budget.
 */
import { createHash } from 'node:crypto';
import { askCost, requestChars, type PagesAskRequest, type PagesAskResponse } from '@unlease/notes/sync/pagesAsk';
import { isClaudeModel, PAGES_REACH_CHARS, type PagesAskSettings } from '@unlease/core/sync/settings';
import { log } from '../../../log';
import { ModelError } from './model';
import type { AnalysisContext } from './provider';
import { BUDGET_SPENT, type ModuleOutcome } from './searches';
import { monthStart, type UsageStore } from './usage';

/** Within the apps' wait (100 s). */
const DEADLINE_MS = 90_000;

export const PAGES_OFF = 'Les questions sur les pages sont désactivées dans l’administration';
export const PAGES_ALL_OFF = 'Les questions sur toutes les pages sont désactivées dans l’administration';
export const PAGES_TOO_LONG = 'Ces pages sont trop longues pour une question : choisissez moins de pages';
export const PAGES_NO_KEY = 'Claude n’a pas de clé : ajoutez-en une dans l’administration.';

export interface PagesAskerOptions {
  readonly usage: UsageStore;
  readonly analysis: () => AnalysisContext;
  readonly settings: () => PagesAskSettings;
  readonly now?: () => number;
}

export class PagesAsker {
  private readonly now: () => number;
  private readonly running = new Map<string, Promise<ModuleOutcome<PagesAskResponse>>>();

  constructor(private readonly options: PagesAskerOptions) {
    this.now = options.now ?? Date.now;
  }

  ask(request: PagesAskRequest): Promise<ModuleOutcome<PagesAskResponse>> {
    const key = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const running = this.running.get(key);
    if (running) return running;
    const job = this.answer(request).finally(() => this.running.delete(key));
    this.running.set(key, job);
    return job;
  }

  private async answer(request: PagesAskRequest): Promise<ModuleOutcome<PagesAskResponse>> {
    const settings = this.options.settings();
    if (!settings.enabled) return { ok: false, status: 409, error: PAGES_OFF };
    if (request.scope === 'all' && !settings.everywhere) return { ok: false, status: 409, error: PAGES_ALL_OFF };
    if (requestChars(request.pages) > PAGES_REACH_CHARS[settings.reach]) return { ok: false, status: 409, error: PAGES_TOO_LONG };
    const { usage } = this.options;
    const { model, budgetUsd } = this.options.analysis();
    if (!model) return { ok: false, status: 409, error: PAGES_NO_KEY };
    if (usage.costSince(monthStart(this.now())) >= budgetUsd) return { ok: false, status: 409, error: BUDGET_SPENT };
    // The web only when the Administration allows it: an app that still offers it is answered without.
    const web = request.web && settings.web;
    const started = this.now();
    const deadline = AbortSignal.timeout(DEADLINE_MS);
    const record = (ok: boolean, error: string | null, spent: Parameters<UsageStore['recordModule']>[1]['usage']) =>
      usage.recordModule('pages', { linkId: '', url: '', usage: spent, ok, error, durationMs: this.now() - started, result: null });
    try {
      const found = await model.answerPages({ pages: request.pages, question: request.question, history: request.history, web, lang: request.lang }, deadline);
      record(true, null, found.usage);
      log.info('pages question answered', { scope: request.scope, pages: request.pages.length, web, costUsd: Math.round(found.usage.costUsd * 10_000) / 10_000 });
      return { ok: true, answer: found.answer };
    } catch (error) {
      if (!deadline.aborted && !(error instanceof ModelError)) log.error('pages question crashed', { error });
      const message = deadline.aborted ? 'Claude a mis trop de temps' : error instanceof ModelError ? error.message : 'Erreur de la question';
      const spent = error instanceof ModelError ? error.usage : null;
      // Cut off, Claude bills what it read and wrote all the same: counted as the app foresaw it.
      const foreseen = isClaudeModel(model.model) ? askCost(requestChars(request.pages), model.model, web) : 0;
      record(false, message, deadline.aborted ? { ...(spent ?? { model: model.model, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 }), costUsd: (spent?.costUsd ?? 0) + foreseen } : spent);
      return { ok: false, status: 502, error: message };
    }
  }
}
