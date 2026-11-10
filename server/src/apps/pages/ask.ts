/**
 * "Demander à Claude" on the pages (`POST /api/pages/ask`): a question about pages the app sends,
 * each as the blocks Claude may cite, answered from them (and from the web when the Administration
 * allows it and the person ticks it). Off until the Administration turns it on; each question is
 * held to the reach set there. Nothing is kept: the same question asked twice at once is joined.
 * Billed within the monthly budget, through the suite's Claude client (`claude/`), under task `pages`.
 */
import { createHash } from 'node:crypto';
import type { BetaContentBlock, BetaContentBlockParam, BetaMessageParam, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { Locale } from '@unlease/core/i18n';
import { isClaudeModel, PAGES_REACH_CHARS, type PagesAskSettings } from '@unlease/core/sync/settings';
import type { AskSource } from '@unlease/notes/sync/ask';
import { cleanText, webAddress } from '@unlease/notes/sync/brief';
import { askCost, PAGES_ASK_LIMITS, requestChars, type AskPage, type PagesAnswerPart, type PagesAskRequest, type PagesAskResponse, type PagesAskTurn, type PagesCitation } from '@unlease/pages/sync/pagesAsk';
import type { Effort } from '../../config';
import { log } from '../../log';
import { BudgetSpentError, FALLBACK_BETA, LANGUAGE_NAMES, ModelError, MODULE_MAX_TOKENS, QUESTION_SEARCHES, supportsServerFallback, webSearchTool, type ClaudeClient } from '../../claude/client';
import { BUDGET_SPENT, NO_KEY, type ModuleOutcome } from '../../claude/outcome';
import type { ClaudeContext } from '../../claude/provider';
import type { CallUsage, UsageStore } from '../../claude/usage';
import { PAGES_PROMPT } from './prompt';

/** Its rows in the suite's spending (`analyses.task`). */
export const PAGES_TASK = 'pages';

/** Within the apps' wait (100 s). */
const DEADLINE_MS = 90_000;

export const PAGES_OFF = 'Les questions sur les pages sont désactivées dans l’administration';
export const PAGES_ALL_OFF = 'Les questions sur toutes les pages sont désactivées dans l’administration';
export const PAGES_TOO_LONG = 'Ces pages sont trop longues pour une question : choisissez moins de pages';

export interface PagesAskerOptions {
  readonly usage: UsageStore;
  readonly claude: () => ClaudeContext;
  readonly settings: () => PagesAskSettings;
  readonly now?: () => number;
}

/** A question about the person's pages, the conversation before it, and whether the web may be searched. */
export interface PagesRequest {
  readonly pages: readonly AskPage[];
  readonly question: string;
  readonly history: readonly PagesAskTurn[];
  readonly web: boolean;
  readonly lang: Locale;
}

export interface PagesAnswer {
  readonly answer: PagesAskResponse;
  readonly usage: CallUsage;
}

/** What a page with nothing in it reads as: a search result needs words. */
const EMPTY_PAGE = '(empty page)';

/**
 * A question about pages: each page a search result whose text blocks are its blocks, so Claude
 * cites the very blocks an answer rests on; the earlier turns before it. The pages are cached: a
 * follow-up within minutes reads them at a tenth of the price.
 */
export function buildPagesRequest({ pages, question, history, web, lang }: PagesRequest, model: string, effort: Effort): MessageCreateParamsNonStreaming {
  const results: BetaContentBlockParam[] = pages.map((page, index) => ({
    type: 'search_result' as const,
    source: `page:${page.id}`,
    title: page.path,
    content: (page.blocks.length > 0 ? page.blocks.map(block => block.text) : [EMPTY_PAGE]).map(text => ({ type: 'text' as const, text })),
    citations: { enabled: true },
    ...(index === pages.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}),
  }));
  const asked = (text: string): string => `<question>\n${text}\n</question>`;
  const questions = [...history.map(turn => turn.question), question];
  const last = questions.length - 1;
  // The web is the current question's choice: said with it, after what is cached.
  const said = (at: number, text: string): string => (at === last ? `Web: ${web ? 'yes' : 'no'}.\n${text}` : text);
  const messages: BetaMessageParam[] = [{ role: 'user', content: [...results, { type: 'text', text: said(0, `Language: ${LANGUAGE_NAMES[lang]}.\n${asked(questions[0]!)}`) }] }];
  history.forEach((turn, index) => {
    messages.push({ role: 'assistant', content: [{ type: 'text', text: turn.answer }] });
    messages.push({ role: 'user', content: [{ type: 'text', text: said(index + 1, asked(questions[index + 1]!)) }] });
  });
  return {
    model,
    max_tokens: MODULE_MAX_TOKENS,
    system: [{ type: 'text', text: PAGES_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages,
    output_config: { effort },
    ...(web ? { tools: [webSearchTool(model, QUESTION_SEARCHES)] } : {}),
    ...(supportsServerFallback(model) ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
  };
}

/** Claude's answer as the apps show it: its pieces with the blocks each rests on, and the web pages it read. */
export function pagesAnswer(content: readonly BetaContentBlock[], pages: readonly AskPage[]): PagesAskResponse {
  // After its last search: what it wrote before one more look is not the answer.
  let start = 0;
  content.forEach((block, index) => {
    if (block.type !== 'text' && block.type !== 'thinking' && block.type !== 'redacted_thinking') start = index + 1;
  });
  const citations: PagesCitation[] = [];
  const known = new Map<string, number>();
  const parts: PagesAnswerPart[] = [];
  const seen = new Set<string>();
  const sources: AskSource[] = [];
  for (const block of content.slice(start)) {
    if (block.type !== 'text') continue;
    const cites: number[] = [];
    for (const citation of block.citations ?? []) {
      if (citation.type === 'web_search_result_location') {
        const url = webAddress(citation.url);
        if (url && !seen.has(url) && sources.length < PAGES_ASK_LIMITS.sources) {
          seen.add(url);
          sources.push({ title: cleanText(citation.title ?? '', 200) || url, url });
        }
        continue;
      }
      if (citation.type !== 'search_result_location') continue;
      const page = pages[citation.search_result_index];
      const blockIds = page ? page.blocks.slice(citation.start_block_index, citation.end_block_index).map(cited => cited.id) : [];
      if (!page || blockIds.length === 0) continue;
      const key = `${page.id}:${blockIds.join(',')}`;
      let at = known.get(key);
      if (at === undefined && citations.length < PAGES_ASK_LIMITS.citations) {
        at = citations.push({ pageId: page.id, blockIds, quote: cleanText(citation.cited_text, PAGES_ASK_LIMITS.quote) }) - 1;
        known.set(key, at);
      }
      if (at !== undefined && !cites.includes(at)) cites.push(at);
    }
    if (block.text) parts.push({ text: block.text, cites });
  }
  return { parts, citations, sources };
}


/** One question asked of Claude: its answer, or a `ModelError` with what it cost. */
export async function answerPages(client: ClaudeClient, request: PagesRequest, signal: AbortSignal): Promise<PagesAnswer> {
  const { message, usage, content } = await client.within(buildPagesRequest(request, client.model, client.effort), signal);
  if (message.stop_reason === 'refusal') throw new ModelError('Question refusée par Claude', usage);
  if (message.stop_reason === 'max_tokens') throw new ModelError('Réponse de Claude incomplète', usage);
  if (message.stop_reason === 'pause_turn') throw new ModelError('Recherche trop longue', usage);
  const answer = pagesAnswer(content, request.pages);
  if (!answer.parts.some(part => part.text.trim())) throw new ModelError('Réponse de Claude illisible', usage);
  return { answer, usage };
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
    const { client, budgetUsd } = this.options.claude();
    if (!client) return { ok: false, status: 409, error: NO_KEY };
    const hold = usage.hold(budgetUsd);
    if (!hold) return { ok: false, status: 409, error: BUDGET_SPENT };
    // The web only when the Administration allows it: an app that still offers it is answered without.
    const web = request.web && settings.web;
    const started = this.now();
    const deadline = AbortSignal.timeout(DEADLINE_MS);
    const record = (ok: boolean, error: string | null, spent: CallUsage | null) =>
      usage.record(PAGES_TASK, { usage: spent, ok, error, durationMs: this.now() - started, result: null });
    try {
      const found = await answerPages(client.holding(hold), { pages: request.pages, question: request.question, history: request.history, web, lang: request.lang }, deadline);
      record(true, null, found.usage);
      log.info('pages question answered', { scope: request.scope, pages: request.pages.length, web, costUsd: Math.round(found.usage.costUsd * 10_000) / 10_000 });
      return { ok: true, answer: found.answer };
    } catch (error) {
      if (!deadline.aborted && !(error instanceof ModelError)) log.error('pages question crashed', { error });
      const message = deadline.aborted ? 'Claude a mis trop de temps' : error instanceof ModelError ? error.message : 'Erreur de la question';
      const spent = error instanceof ModelError ? error.usage : null;
      // Cut off, Claude bills what it read and wrote all the same: counted as the app foresaw it.
      const foreseen = isClaudeModel(client.model) ? askCost(requestChars(request.pages), client.model, web) : 0;
      record(false, message, deadline.aborted ? { ...(spent ?? { model: client.model, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 }), costUsd: (spent?.costUsd ?? 0) + foreseen } : spent);
      return { ok: false, status: error instanceof BudgetSpentError ? 409 : 502, error: message };
    } finally {
      hold.release();
    }
  }
}
