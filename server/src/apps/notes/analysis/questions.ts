/**
 * "Demander à Claude" (`POST /api/ask`): a question about a link, answered from its page (read by
 * the server, its article whole when one stands out) and from the web when the person ticks it.
 * Nothing is kept: the same question asked twice at once is joined, asked again later it is asked
 * again. Billed like the other modules, within the monthly budget.
 */
import { normalizeUrl } from '@unlease/core/services/url';
import { parseRich, richToPlain } from '@unlease/core/services/richText';
import type { AskRequest, AskResponse } from '@unlease/notes/sync/ask';
import { log } from '../../../log';
import { extractArticle } from './article';
import type { Fetcher } from './fetcher';
import { ModelError } from './model';
import type { AnalysisContext } from './provider';
import { readLink, type LinkRead } from './reader';
import { BUDGET_SPENT, NO_KEY, withCutOffCall, type ModuleOutcome } from './searches';
import { monthStart, type UsageStore } from './usage';

/** The read and Claude share it, within the apps' wait (100 s). */
const DEADLINE_MS = 85_000;
const READ_DEADLINE_MS = 20_000;
/** About 8 000 tokens of the page: enough for a long article, a fraction of a search's cost. */
const PAGE_LIMIT = 30_000;

export interface QuestionAskerOptions {
  readonly usage: UsageStore;
  readonly analysis: () => AnalysisContext;
  readonly fetcher: Fetcher;
  readonly now?: () => number;
}

/** The page's words for a question: its article whole when one stands out, else the excerpt the reading kept; null when the server read nothing. */
export function pageWords(read: LinkRead): string | null {
  const article = read.html ? extractArticle(read.html, read.finalUrl, read.page?.title ?? '') : null;
  const text = article ? article.drafts.map(draft => richToPlain(parseRich(draft.text))).filter(Boolean).join('\n') : '';
  const words = text.length >= (read.page?.text.length ?? 0) ? text : (read.page?.text ?? '');
  return words.trim() ? words.slice(0, PAGE_LIMIT) : null;
}

export class QuestionAsker {
  private readonly now: () => number;
  private readonly running = new Map<string, Promise<ModuleOutcome<AskResponse>>>();

  constructor(private readonly options: QuestionAskerOptions) {
    this.now = options.now ?? Date.now;
  }

  ask(request: AskRequest): Promise<ModuleOutcome<AskResponse>> {
    const key = JSON.stringify([normalizeUrl(request.link.url), request.lang, request.web, request.question]);
    const running = this.running.get(key);
    if (running) return running;
    const job = this.answer(request).finally(() => this.running.delete(key));
    this.running.set(key, job);
    return job;
  }

  private async answer(request: AskRequest): Promise<ModuleOutcome<AskResponse>> {
    const { usage } = this.options;
    const { model, budgetUsd } = this.options.analysis();
    if (!model) return { ok: false, status: 409, error: NO_KEY };
    if (usage.costSince(monthStart(this.now())) >= budgetUsd) return { ok: false, status: 409, error: BUDGET_SPENT };
    const started = this.now();
    const url = normalizeUrl(request.link.url);
    const deadline = AbortSignal.timeout(DEADLINE_MS);
    const read = await readLink(request.link.url, this.options.fetcher, AbortSignal.any([deadline, AbortSignal.timeout(READ_DEADLINE_MS)]));
    const record = (ok: boolean, error: string | null, spent: Parameters<UsageStore['recordModule']>[1]['usage']) =>
      usage.recordModule('ask', { linkId: request.link.id, url, usage: spent, ok, error, durationMs: this.now() - started, result: null });
    const page = pageWords(read);
    const gone = !page && read.fatal ? (read.error ?? 'La page n’a pas pu être lue') : null;
    // A page gone for good, and no web to turn to: Claude would be paid to say so.
    if (gone && !request.web) return { ok: false, status: 502, error: gone };
    try {
      const found = await model.answerQuestion({ link: request.link, question: request.question, lang: request.lang, web: request.web, page, gone }, deadline);
      record(true, null, found.usage);
      log.info('question answered', { web: request.web, costUsd: Math.round(found.usage.costUsd * 10_000) / 10_000 });
      return { ok: true, answer: { answer: found.answer, sources: found.sources } };
    } catch (error) {
      if (!deadline.aborted && !(error instanceof ModelError)) log.error('question crashed', { error });
      const message = deadline.aborted ? 'Claude a mis trop de temps' : error instanceof ModelError ? error.message : 'Erreur de la question';
      const spent = error instanceof ModelError ? error.usage : null;
      record(false, message, deadline.aborted && request.web ? withCutOffCall(spent, model.model) : spent);
      return { ok: false, status: 502, error: message };
    }
  }
}
