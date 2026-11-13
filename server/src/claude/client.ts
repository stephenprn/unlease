/**
 * Claude for every app: one client per key and model (`provider.ts` builds it from the settings),
 * with what every call shares: one retry on a rate limit, an overload or a lost connection, a
 * server-tool loop resumed while it pauses, every call's cost counted (a refusal fallback billed at
 * each model's rates, web searches on top), failures as `ModelError`s in short French with what
 * they cost, and the tools and limits the apps build their requests with. Each app's prompts and
 * answers are its own (Carnet's link model: `apps/notes/analysis/model.ts`; Pages' questions:
 * `apps/pages/ask.ts`).
 *
 * Thinking is left unset (Opus 5.5 always thinks; sending `disabled` or a budget is a 400):
 * `effort` is the cost control. Refusals get the server-side fallback where the model offers one.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { BetaContentBlock, BetaContentBlockParam, BetaMessage, BetaToolUnion, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { Locale } from '@unlease/core/i18n';
import type { Effort } from '../config';
import { log } from '../log';
import { BUDGET_SPENT } from './outcome';
import { costUsd, WEB_SEARCH_USD, worstRates, type TokenCounts } from './pricing';
import type { BudgetHold, CallUsage } from './usage';

export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
/** A paused server-tool loop is handed back at most this many times. */
const MAX_CONTINUATIONS = 2;
const WEB_FETCH_CONTENT_TOKENS = 8000;
/** A web search: enough to try a shop, a deal community and a comparison or resale site. */
export const WEB_SEARCHES = 5;
/** A call that searches the web: searches, filtering code and the answer all come out of one budget, twice a plain call's. */
export const MODULE_MAX_TOKENS = 16_000;
/** A question's searches: a few, for what what it is asked about does not say. */
export const QUESTION_SEARCHES = 3;

export const LANGUAGE_NAMES: Record<Locale, string> = { fr: 'French', en: 'English' };

/** The one SDK method used, so tests can stand in for the API. */
export interface MessagesApi {
  create(params: MessageCreateParamsNonStreaming, options?: { signal?: AbortSignal }): Promise<BetaMessage>;
}

export function anthropicMessages(apiKey: string): MessagesApi {
  // No SDK retries: `ClaudeClient` retries once itself, so the worst case stays bounded and visible.
  // An explicit authToken keeps a stray ANTHROPIC_AUTH_TOKEN in the environment from being sent too.
  const client = new Anthropic({ apiKey, authToken: null, maxRetries: 0, timeout: 180_000 });
  return { create: (params, options) => client.beta.messages.create(params, options) };
}

/** A failed call, with a short French message the apps show and whatever the call cost. */
export class ModelError extends Error {
  constructor(
    message: string,
    readonly usage: CallUsage | null,
  ) {
    super(message);
  }
}

/** The budget was reached before the call's first request: nothing was sent. */
export class BudgetSpentError extends ModelError {
  constructor(usage: CallUsage | null) {
    super(BUDGET_SPENT, usage);
  }
}

/** Models that accept `fallbacks: "default"`; Haiku has no server-side fallback. */
export function supportsServerFallback(model: string): boolean {
  return ['claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1'].some(prefix => model.startsWith(prefix));
}

export function webFetchTool(model: string, maxUses = 1): BetaToolUnion {
  // The dynamic-filtering version needs an Opus or Sonnet model; Haiku keeps the basic one.
  return model.startsWith('claude-haiku')
    ? { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: maxUses, max_content_tokens: WEB_FETCH_CONTENT_TOKENS }
    : { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: maxUses, max_content_tokens: WEB_FETCH_CONTENT_TOKENS };
}

export function webSearchTool(model: string, maxUses = WEB_SEARCHES): BetaToolUnion {
  return model.startsWith('claude-haiku')
    ? { type: 'web_search_20250305', name: 'web_search', max_uses: maxUses }
    : { type: 'web_search_20260209', name: 'web_search', max_uses: maxUses };
}

const NO_TOKENS: TokenCounts = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** Characters per token, counted low (French runs nearer four) so the estimate errs high. */
const CHARS_PER_TOKEN = 3;
/** A picture, at the largest the API reads one. */
const IMAGE_TOKENS = 5_000;
/** What one web search brings back into the request. */
const SEARCH_RESULT_TOKENS = 10_000;

/**
 * The most one request may cost, counted high: everything it sends (pictures at their largest),
 * what its server tools may bring back (each search's results, each fetch's whole page) read at
 * the dearest input rate, `max_tokens` written, its searches on top, and all of it twice where a
 * refusal may fall back on another model. Held against the budget while the request runs.
 */
export function worstCostUsd(params: MessageCreateParamsNonStreaming): number {
  let images = 0;
  const sent = JSON.stringify(params, (_key, value: unknown) => {
    if (value !== null && typeof value === 'object' && (value as { type?: unknown }).type === 'image') {
      images += 1;
      return null;
    }
    return value;
  });
  let searches = 0;
  let fetched = 0;
  for (const tool of (params.tools ?? []) as readonly { type?: string; max_uses?: number; max_content_tokens?: number }[]) {
    if (tool.type?.startsWith('web_search')) searches += tool.max_uses ?? WEB_SEARCHES;
    else if (tool.type?.startsWith('web_fetch')) fetched += (tool.max_uses ?? 1) * (tool.max_content_tokens ?? WEB_FETCH_CONTENT_TOKENS);
  }
  const input = Math.ceil(sent.length / CHARS_PER_TOKEN) + images * IMAGE_TOKENS + searches * SEARCH_RESULT_TOKENS + fetched;
  const fallback = (params as { fallbacks?: unknown }).fallbacks !== undefined;
  const rates = worstRates(params.model, fallback);
  const once = (input * rates.cacheWrite + params.max_tokens * rates.output) / 1_000_000 + searches * WEB_SEARCH_USD;
  return fallback ? once * 2 : once;
}

/** Nothing spent yet, on `model`. */
export const noUsage = (model: string): CallUsage => ({ model, ...NO_TOKENS, costUsd: 0 });

/** `total` plus what `message` cost. */
export function addUsage(total: CallUsage, message: BetaMessage, requested: string): CallUsage {
  const add = (sum: CallUsage, counts: TokenCounts, model: string): CallUsage => ({
    model: sum.model,
    inputTokens: sum.inputTokens + counts.inputTokens,
    outputTokens: sum.outputTokens + counts.outputTokens,
    cacheReadTokens: sum.cacheReadTokens + counts.cacheReadTokens,
    cacheWriteTokens: sum.cacheWriteTokens + counts.cacheWriteTokens,
    costUsd: sum.costUsd + costUsd(model, counts),
  });
  const served = message.model || requested;
  const usage = message.usage;
  const iterations = usage.iterations ?? [];
  // Searches bill on top of their tokens.
  let next = { ...total, model: served, costUsd: total.costUsd + (usage.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD };
  if (iterations.some(entry => entry.type === 'fallback_message')) {
    // After a refusal fallback the top-level usage covers only the last attempt; each attempt bills at its own model's rates.
    for (const entry of iterations) {
      if (entry.type !== 'message' && entry.type !== 'fallback_message') continue;
      const counts = {
        inputTokens: entry.input_tokens,
        outputTokens: entry.output_tokens,
        cacheReadTokens: entry.cache_read_input_tokens ?? 0,
        cacheWriteTokens: entry.cache_creation_input_tokens ?? 0,
      };
      next = add(next, counts, entry.model ?? requested);
    }
    return next;
  }
  return add(
    next,
    {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    },
    served,
  );
}

function isRetryable(error: unknown): boolean {
  if (error instanceof Anthropic.APIUserAbortError || error instanceof Anthropic.APIConnectionTimeoutError) return false;
  return (
    error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionError
  );
}

/** Most specific first: the timeout and connection errors are themselves `APIError`s. */
function frenchMessage(error: unknown): string {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return 'Timed out (Claude)';
  if (error instanceof Anthropic.APIConnectionError) return 'Claude API unreachable';
  if (error instanceof Anthropic.RateLimitError) return 'Claude API limit reached';
  if (error instanceof Anthropic.AuthenticationError) return 'API key refused';
  if (error instanceof Anthropic.PermissionDeniedError) return 'Access to the Claude API denied';
  if (error instanceof Anthropic.NotFoundError) return 'Claude model not found';
  if (error instanceof Anthropic.InternalServerError) return error.status === 529 ? 'Claude is overloaded' : 'Claude service error';
  if (error instanceof Anthropic.APIError) {
    if (error.type === 'billing_error' || error.status === 402) return 'API credit used up';
    return `Requête refusée par l’API Claude (${error.status ?? '?'})`;
  }
  return 'Analysis error';
}

function retryDelayMs(error: unknown): number {
  const header = error instanceof Anthropic.APIError ? error.headers?.get('retry-after') : null;
  const seconds = header ? Number(header) : Number.NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1000, 20_000) : 2_000;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** A turn's last message, what the whole turn cost, and every block it wrote. */
export interface Turn {
  readonly message: BetaMessage;
  readonly usage: CallUsage;
  readonly content: BetaContentBlock[];
}

export interface ClaudeClientOptions {
  readonly model: string;
  readonly effort: Effort;
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** The call's hold on the budget (`UsageStore.hold`): each request is held at its worst while it runs. */
  readonly hold?: BudgetHold;
}

export class ClaudeClient {
  constructor(
    private readonly api: MessagesApi,
    private readonly options: ClaudeClientOptions,
  ) {}

  get model(): string {
    return this.options.model;
  }

  /** How hard Claude thinks (`UNLEASE_CLAUDE_EFFORT`). */
  get effort(): Effort {
    return this.options.effort;
  }

  /** The same client, its requests held against the budget by `hold` (the app releases it once the call is recorded). */
  holding(hold: BudgetHold): ClaudeClient {
    return new ClaudeClient(this.api, { ...this.options, hold });
  }

  /** One call, no tool loop: its message and what it cost. */
  async once(params: MessageCreateParamsNonStreaming, signal: AbortSignal): Promise<{ readonly message: BetaMessage; readonly usage: CallUsage }> {
    const empty = noUsage(this.model);
    const message = await this.send(params, signal, empty);
    return { message, usage: addUsage(empty, message, this.model) };
  }

  /** A module's turn under its deadline: cut off, what the parts already answered cost goes with the error, for the budget. */
  async within(params: MessageCreateParamsNonStreaming, signal: AbortSignal): Promise<Turn> {
    let spent: CallUsage = { model: this.model, ...NO_TOKENS, costUsd: 0 };
    try {
      return await this.converse(params, signal, usage => (spent = usage));
    } catch (error) {
      if (signal.aborted) throw new ModelError('Claude took too long', spent);
      throw error;
    }
  }

  /** One turn, its server-tool loop resumed while it pauses: the last message, what it cost (told to `onUsage` as each part answers), and every block of the turn. */
  async converse(first: MessageCreateParamsNonStreaming, signal: AbortSignal, onUsage?: (usage: CallUsage) => void): Promise<Turn> {
    const requested = this.model;
    let params = first;
    let usage: CallUsage = { model: requested, ...NO_TOKENS, costUsd: 0 };
    const content: BetaContentBlock[] = [];

    let message = await this.send(params, signal, usage);
    usage = addUsage(usage, message, requested);
    onUsage?.(usage);
    content.push(...message.content);
    for (let round = 0; message.stop_reason === 'pause_turn' && round < MAX_CONTINUATIONS; round += 1) {
      // A server-tool loop paused: hand its turn back and the API resumes where it stopped.
      params = { ...params, messages: [...params.messages, { role: 'assistant', content: message.content as BetaContentBlockParam[] }] };
      message = await this.send(params, signal, usage);
      usage = addUsage(usage, message, requested);
      onUsage?.(usage);
      content.push(...message.content);
    }
    return { message, usage, content };
  }

  /**
   * One request, held at its worst against the budget while it runs (refused, `BudgetSpentError`,
   * when the call's first request finds the budget reached), tried once more after a passing
   * failure; a failure is a `ModelError` costing `usage`.
   */
  async send(params: MessageCreateParamsNonStreaming, signal: AbortSignal, usage: CallUsage): Promise<BetaMessage> {
    const hold = this.options.hold;
    if (hold && !hold.cover(worstCostUsd(params))) throw new BudgetSpentError(usage);
    try {
      const message = await this.attempt(params, signal, usage);
      hold?.settle(addUsage(noUsage(this.model), message, this.model).costUsd);
      return message;
    } catch (error) {
      // A request that failed was not billed; one cut off may have been, and stays held at its worst until the app counts it.
      if (!signal.aborted) hold?.settle(0);
      throw error;
    }
  }

  private async attempt(params: MessageCreateParamsNonStreaming, signal: AbortSignal, usage: CallUsage): Promise<BetaMessage> {
    try {
      return await this.api.create(params, { signal });
    } catch (error) {
      if (signal.aborted || error instanceof Anthropic.APIUserAbortError) throw error;
      if (!isRetryable(error)) throw new ModelError(frenchMessage(error), usage);
      log.warn('Claude call failed, retrying once', { error: frenchMessage(error) });
      await (this.options.sleep ?? wait)(retryDelayMs(error), signal);
      try {
        return await this.api.create(params, { signal });
      } catch (second) {
        if (signal.aborted || second instanceof Anthropic.APIUserAbortError) throw second;
        throw new ModelError(frenchMessage(second), usage);
      }
    }
  }
}
