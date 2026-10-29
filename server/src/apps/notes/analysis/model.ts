/**
 * The one Claude call per link, the call that sorts links already saved, and the link modules'
 * calls: the web searches (promo codes, offers, ratings, a series' recap, other outlets), a
 * recipe's ingredients and method, and a question about a link.
 *
 * It goes through `beta.messages.create` with the zod schema as the
 * structured-output format, and is parsed and validated here rather than by
 * `beta.messages.parse()`: that helper throws on any text block that is not
 * the JSON (a preamble before a tool call, a truncated answer), and a thrown
 * call loses the usage that was billed anyway, which the budget must count.
 * The promo-code search sends no format: web search always cites its sources,
 * and citations cannot be combined with one. Its JSON is read from the text.
 *
 * Thinking is left unset (Opus 5.5 always thinks; sending `disabled` or a
 * budget is a 400): `effort` is the cost control. Refusals get the
 * server-side fallback where the model offers one.
 */
import type { Locale } from '@unlease/core/i18n';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaTextBlock,
  BetaToolUnion,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { z } from 'zod';
import { INBOX_TITLE, LINK_KINDS } from '@unlease/notes/models/entities';
import type { AskSource } from '@unlease/notes/sync/ask';
import { cleanText, webAddress, type LinkBrief } from '@unlease/notes/sync/brief';
import { parseCouponLists, type Coupon, type CouponTip } from '@unlease/notes/sync/coupons';
import { parseCoverageLists, type CoverageResponse } from '@unlease/notes/sync/coverage';
import { parseRatingsLists, parseRecapLists, type RatingsResponse, type RecapResponse } from '@unlease/notes/sync/works';
import { parseOfferLists, type Offer, type OfferMarket, type PriceRange } from '@unlease/notes/sync/offers';
import { PAGES_ASK_LIMITS, type AskPage, type PagesAnswerPart, type PagesAskResponse, type PagesAskTurn, type PagesCitation } from '@unlease/notes/sync/pagesAsk';
import { parseIngredients, parseSteps, RECIPE_LIMITS, type RecipeStep } from '@unlease/notes/sync/recipe';
import type { SortLink, SortTarget, SortTask } from '@unlease/notes/sync/sorting';
import type { Effort } from '../../../config';
import { log } from '../../../log';
import type { RoutingList } from './lists';
import { INGREDIENTS_OUTPUT_JSON_SCHEMA, IngredientsOutputSchema, LinkOutputSchema, normalizeOutput, SORT_OUTPUT_JSON_SCHEMA, SortOutputSchema, type LinkOutput, type SortOutput } from './output';
import { costUsd, WEB_SEARCH_USD, type TokenCounts } from './pricing';
import { ASK_PROMPT, COUPONS_PROMPT, COVERAGE_PROMPT, INGREDIENTS_PROMPT, OFFERS_PROMPT, PAGES_PROMPT, RATINGS_PROMPT, RECAP_PROMPT, SORT_PROMPT, SYSTEM_PROMPT } from './prompt';
import type { CallUsage } from './usage';

const MAX_TOKENS = 8000;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const MAX_CONTINUATIONS = 2;
const WEB_FETCH_CONTENT_TOKENS = 8000;
/** A module's web search: enough to try the shop, a deal community and a comparison or resale site, and read two pages. */
const MODULE_SEARCHES = 5;
const MODULE_FETCHES = 2;

/**
 * The zod schema in the JSON Schema subset the API accepts. The SDK helper
 * moves every keyword it does not handle into the description, `enum`
 * included, although the API enforces enums: `kind` gets its enum back so it
 * can never fall outside LINK_KINDS.
 */
function responseSchema(): Record<string, unknown> {
  const schema = betaZodOutputFormat(LinkOutputSchema).schema as { properties: Record<string, unknown>; description?: string };
  delete schema.description; // only "{$schema: ...}" noise
  schema.properties.kind = { type: 'string', enum: [...LINK_KINDS] };
  return schema;
}

const RESPONSE_FORMAT = { type: 'json_schema' as const, schema: responseSchema() };
const SORT_FORMAT = { type: 'json_schema' as const, schema: SORT_OUTPUT_JSON_SCHEMA };

/** The one SDK method used, so tests can stand in for the API. */
export interface MessagesApi {
  create(params: MessageCreateParamsNonStreaming, options?: { signal?: AbortSignal }): Promise<BetaMessage>;
}

export function anthropicMessages(apiKey: string): MessagesApi {
  // No SDK retries: `ClaudeLinkModel` retries once itself, so the worst case stays bounded and visible.
  // An explicit authToken keeps a stray ANTHROPIC_AUTH_TOKEN in the environment from being sent too.
  const client = new Anthropic({ apiKey, authToken: null, maxRetries: 0, timeout: 180_000 });
  return { create: (params, options) => client.beta.messages.create(params, options) };
}

export interface DescribeRequest {
  readonly url: string;
  readonly digest: string;
  /** The language every human-readable value is written in. */
  readonly lang: Locale;
  /** The lists to file into, or null when the link stays where it is. */
  readonly lists: readonly RoutingList[] | null;
  /** Set when the server could not read the page: Claude fetches it with web_fetch. */
  readonly webFetch: { readonly reason: string } | null;
  /** A direct image link, attached so Claude can see it. */
  readonly image: { readonly mediaType: 'image/webp'; readonly data: string } | null;
  readonly imageCount: number;
}

export interface Description {
  readonly output: LinkOutput;
  readonly usage: CallUsage;
  /** The page as web_fetch returned it (and where it read it), when Claude had to read it itself. */
  readonly fetched: { readonly url: string; readonly text: string } | null;
}

/** A failed call, with a French message for the link card and whatever the call cost. */
export class ModelError extends Error {
  constructor(
    message: string,
    readonly usage: CallUsage | null,
  ) {
    super(message);
  }
}

/** Links to sort and the collections, numbered from 1 in the message; "Non classé" is 0 in a review. */
export interface SortBatch {
  readonly task: SortTask;
  readonly targets: readonly SortTarget[];
  /** In a review, the index in `targets` of the collection the links sit in. */
  readonly from: number | null;
  readonly links: readonly SortLink[];
}

export interface SortAnswer {
  /** As Claude wrote them: the sorter checks them against the batch. */
  readonly moves: SortOutput['moves'];
  readonly usage: CallUsage;
}

/** A link a module searches the web for, as the app sent it. */
export interface ModuleSearch {
  readonly link: LinkBrief;
  readonly lang: Locale;
  /** `2026-10-27`: Claude judges what is current against it. */
  readonly today: string;
}

export interface CouponAnswer {
  readonly coupons: readonly Coupon[];
  readonly tips: readonly CouponTip[];
  readonly usage: CallUsage;
}

export interface OfferSearch extends ModuleSearch {
  readonly market: OfferMarket;
}

export interface OfferAnswer {
  readonly offers: readonly Offer[];
  readonly range: PriceRange | null;
  readonly note: string;
  readonly usage: CallUsage;
}

/** A recipe page whose structured data gave no ingredients. */
export interface IngredientsRequest {
  readonly url: string;
  readonly digest: string;
  readonly lang: Locale;
  /** Set when the server could not read the page: Claude fetches it with web_fetch. */
  readonly webFetch: { readonly reason: string } | null;
}

export interface IngredientsAnswer {
  readonly ingredients: readonly string[];
  readonly servings: string;
  readonly steps: readonly RecipeStep[];
  readonly usage: CallUsage;
}

export type RatingsAnswer = Omit<RatingsResponse, 'searchedAt'> & { readonly usage: CallUsage };

export interface RecapSearch extends ModuleSearch {
  readonly season: number;
  /** Null: the whole season. */
  readonly episode: number | null;
}

export type RecapAnswer = Omit<RecapResponse, 'searchedAt'> & { readonly usage: CallUsage };

export type CoverageAnswer = Omit<CoverageResponse, 'searchedAt'> & { readonly usage: CallUsage };

/** A question about a link. */
export interface QuestionRequest {
  readonly link: LinkBrief;
  readonly question: string;
  readonly lang: Locale;
  /** Claude may search the web. */
  readonly web: boolean;
  /** The page's words as the server read them; null: Claude fetches the page itself, unless it is gone. */
  readonly page: string | null;
  /** Why the page is gone for good (a 404), or null: Claude does not fetch it either. */
  readonly gone: string | null;
}

export interface QuestionAnswer {
  readonly answer: string;
  readonly sources: readonly AskSource[];
  readonly usage: CallUsage;
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

export interface LinkModel {
  readonly model: string;
  describe(request: DescribeRequest, signal: AbortSignal): Promise<Description>;
  sort(batch: SortBatch, signal: AbortSignal): Promise<SortAnswer>;
  findCoupons(search: ModuleSearch, signal: AbortSignal): Promise<CouponAnswer>;
  findOffers(search: OfferSearch, signal: AbortSignal): Promise<OfferAnswer>;
  listIngredients(request: IngredientsRequest, signal: AbortSignal): Promise<IngredientsAnswer>;
  findRatings(search: ModuleSearch, signal: AbortSignal): Promise<RatingsAnswer>;
  writeRecap(search: RecapSearch, signal: AbortSignal): Promise<RecapAnswer>;
  findCoverage(search: ModuleSearch, signal: AbortSignal): Promise<CoverageAnswer>;
  answerQuestion(request: QuestionRequest, signal: AbortSignal): Promise<QuestionAnswer>;
  answerPages(request: PagesRequest, signal: AbortSignal): Promise<PagesAnswer>;
}

/** Models that accept `fallbacks: "default"`; Haiku has no server-side fallback. */
export function supportsServerFallback(model: string): boolean {
  return ['claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1'].some(prefix => model.startsWith(prefix));
}

function webFetchTool(model: string, maxUses = 1): BetaToolUnion {
  // The dynamic-filtering version needs an Opus or Sonnet model; Haiku keeps the basic one.
  return model.startsWith('claude-haiku')
    ? { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: maxUses, max_content_tokens: WEB_FETCH_CONTENT_TOKENS }
    : { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: maxUses, max_content_tokens: WEB_FETCH_CONTENT_TOKENS };
}

function webSearchTool(model: string, maxUses = MODULE_SEARCHES): BetaToolUnion {
  return model.startsWith('claude-haiku')
    ? { type: 'web_search_20250305', name: 'web_search', max_uses: maxUses }
    : { type: 'web_search_20260209', name: 'web_search', max_uses: maxUses };
}

const LANGUAGE_NAMES: Record<Locale, string> = { fr: 'French', en: 'English' };

function userText({ url, digest, lists, webFetch, lang }: DescribeRequest): string {
  const parts: string[] = [`Language: ${LANGUAGE_NAMES[lang]}.`];
  if (lists) {
    parts.push('Describe this link and file it: choose the list it belongs in, or answer listId null when none is a clear fit.');
    const rows = lists.map(list =>
      JSON.stringify({
        id: list.id,
        title: list.title,
        ...(list.hint ? { description: list.hint } : {}),
        ...(list.examples.length > 0 ? { examples: list.examples } : {}),
      }),
    );
    parts.push(`<lists>\n${rows.join('\n')}\n</lists>`);
  } else {
    parts.push('Describe this link. Filing is not asked for: answer listId null.');
  }
  if (webFetch) {
    parts.push(
      `The server could not read this page (${webFetch.reason}). Fetch ${url} once with web_fetch and answer from what it returns. If it cannot be read either, answer from the URL alone and set pageRead to false.`,
    );
  }
  parts.push(`<page>\n${digest}\n</page>`);
  return parts.join('\n\n');
}

export function buildRequest(request: DescribeRequest, model: string, effort: Effort): MessageCreateParamsNonStreaming {
  const content: BetaContentBlockParam[] = [];
  if (request.image) {
    content.push({ type: 'image', source: { type: 'base64', media_type: request.image.mediaType, data: request.image.data } });
  }
  content.push({ type: 'text', text: userText(request) });
  return {
    model,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
    output_config: { effort, format: RESPONSE_FORMAT },
    ...(request.webFetch ? { tools: [webFetchTool(model)] } : {}),
    ...(supportsServerFallback(model) ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
  };
}

function sortText({ task, targets, from, links }: SortBatch): string {
  const collections = targets.map(
    (target, index) =>
      `${index + 1}. ${JSON.stringify({
        title: target.title,
        ...(target.hint ? { description: target.hint } : {}),
        ...(target.examples.length > 0 ? { examples: target.examples } : {}),
      })}`,
  );
  const parts: string[] = [];
  if (task === 'review' && from !== null) {
    parts.push(`Task: review. The links all sit in collection ${from + 1} (${JSON.stringify(targets[from]!.title)}), the current one.`);
    collections.unshift(`0. ${JSON.stringify({ title: INBOX_TITLE, description: 'For links that fit no collection.' })}`);
  } else {
    parts.push('Task: file.');
  }
  parts.push(`<collections>\n${collections.join('\n')}\n</collections>`);
  const rows = links.map(
    (link, index) =>
      `${index + 1}. ${JSON.stringify({
        ...(link.title ? { title: link.title } : {}),
        ...(link.site ? { site: link.site } : {}),
        kind: link.kind,
        ...(link.summary ? { summary: link.summary } : {}),
        ...(link.facts.length > 0 ? { facts: link.facts } : {}),
        url: link.url,
      })}`,
  );
  parts.push(`<links>\n${rows.join('\n')}\n</links>`);
  return parts.join('\n\n');
}

export function buildSortRequest(batch: SortBatch, model: string, effort: Effort): MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: SORT_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: [{ type: 'text', text: sortText(batch) }] }],
    output_config: { effort, format: SORT_FORMAT },
    ...(supportsServerFallback(model) ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
  };
}

/** The message for a module's search: the language, today, any more lines (the market), then the item. */
function itemText({ link, lang, today }: ModuleSearch, more: readonly string[] = []): string {
  const item = JSON.stringify({
    url: link.url,
    ...(link.title ? { name: link.title } : {}),
    ...(link.site ? { shop: link.site } : {}),
    kind: link.kind,
    ...(link.price === null ? {} : { price: link.currency ? `${link.price} ${link.currency}` : String(link.price) }),
    ...(link.facts.length > 0 ? { facts: link.facts } : {}),
  });
  return [`Language: ${LANGUAGE_NAMES[lang]}.`, `Today: ${today}.`, ...more, `<item>\n${item}\n</item>`].join('\n\n');
}

/** The message for a module about a work or a story: the language, today, any more lines, then what the reading found of it. */
function aboutText({ link, lang, today }: ModuleSearch, more: readonly string[] = []): string {
  const item = JSON.stringify({
    url: link.url,
    ...(link.title ? { title: link.title } : {}),
    ...(link.site ? { site: link.site } : {}),
    kind: link.kind,
    ...(link.summary ? { summary: link.summary } : {}),
    ...(link.facts.length > 0 ? { facts: link.facts } : {}),
  });
  return [`Language: ${LANGUAGE_NAMES[lang]}.`, `Today: ${today}.`, ...more, `<item>\n${item}\n</item>`].join('\n\n');
}

/** Searches, filtering code and the answer all come out of one budget: twice a reading's. */
const MODULE_MAX_TOKENS = 16_000;

/** A module's web search: no structured format, as web search always cites its sources and citations cannot go with one. */
function buildSearchRequest(prompt: string, text: string, model: string, effort: Effort): MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: MODULE_MAX_TOKENS,
    system: [{ type: 'text', text: prompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: [{ type: 'text', text }] }],
    output_config: { effort },
    tools: [webSearchTool(model), webFetchTool(model, MODULE_FETCHES)],
    ...(supportsServerFallback(model) ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
  };
}

export function buildCouponRequest(search: ModuleSearch, model: string, effort: Effort): MessageCreateParamsNonStreaming {
  return buildSearchRequest(COUPONS_PROMPT, itemText(search), model, effort);
}

export function buildOfferRequest(search: OfferSearch, model: string, effort: Effort): MessageCreateParamsNonStreaming {
  return buildSearchRequest(OFFERS_PROMPT, itemText(search, [`Market: ${search.market}.`]), model, effort);
}

export function buildRatingsRequest(search: ModuleSearch, model: string, effort: Effort): MessageCreateParamsNonStreaming {
  return buildSearchRequest(RATINGS_PROMPT, aboutText(search), model, effort);
}

export function buildRecapRequest(search: RecapSearch, model: string, effort: Effort): MessageCreateParamsNonStreaming {
  const stop = search.episode === null ? `season ${search.season}, the whole season` : `season ${search.season}, episode ${search.episode}`;
  return buildSearchRequest(RECAP_PROMPT, aboutText(search, [`Watched up to: ${stop}.`]), model, effort);
}

export function buildCoverageRequest(search: ModuleSearch, model: string, effort: Effort): MessageCreateParamsNonStreaming {
  return buildSearchRequest(COVERAGE_PROMPT, aboutText(search), model, effort);
}

/** A question's searches: a few, for what the page does not say. */
const QUESTION_SEARCHES = 3;

export function buildQuestionRequest({ link, question, lang, web, page, gone }: QuestionRequest, model: string, effort: Effort): MessageCreateParamsNonStreaming {
  const about = JSON.stringify({
    url: link.url,
    ...(link.title ? { title: link.title } : {}),
    ...(link.site ? { site: link.site } : {}),
    kind: link.kind,
    ...(link.summary ? { summary: link.summary } : {}),
    ...(link.facts.length > 0 ? { facts: link.facts } : {}),
  });
  const parts = [`Language: ${LANGUAGE_NAMES[lang]}.`, `Web: ${web ? 'yes' : 'no'}.`, `<link>\n${about}\n</link>`];
  if (page) parts.push(`<page>\n${page}\n</page>`);
  else if (gone) parts.push(`The page cannot be read any more (${gone}): answer from what the link says and the web.`);
  else parts.push(`The server could not read this page: fetch ${link.url} once with web_fetch.`);
  parts.push(`<question>\n${question}\n</question>`);
  const fetches = !page && !gone;
  const tools = [...(web ? [webSearchTool(model, QUESTION_SEARCHES)] : []), ...(fetches ? [webFetchTool(model)] : [])];
  return {
    model,
    max_tokens: web ? MODULE_MAX_TOKENS : MAX_TOKENS,
    system: [{ type: 'text', text: ASK_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: [{ type: 'text', text: parts.join('\n\n') }] }],
    output_config: { effort },
    ...(tools.length > 0 ? { tools } : {}),
    ...(supportsServerFallback(model) ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
  };
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
    source: `carnet-page:${page.id}`,
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

/** The pages Claude's answer cites from its searches, each once, the link's own left out. */
function citedSources(content: readonly BetaContentBlock[], own: string): AskSource[] {
  const seen = new Set<string>([own]);
  const sources: AskSource[] = [];
  for (const block of content) {
    if (block.type !== 'text') continue;
    for (const citation of block.citations ?? []) {
      if (citation.type !== 'web_search_result_location') continue;
      const url = webAddress(citation.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      sources.push({ title: cleanText(citation.title ?? '', 200) || url, url });
    }
  }
  return sources;
}

const INGREDIENTS_FORMAT = { type: 'json_schema' as const, schema: INGREDIENTS_OUTPUT_JSON_SCHEMA };

export function buildIngredientsRequest({ url, digest, lang, webFetch }: IngredientsRequest, model: string, effort: Effort): MessageCreateParamsNonStreaming {
  const parts = [`Language: ${LANGUAGE_NAMES[lang]}.`];
  if (webFetch) parts.push(`The server could not read this page (${webFetch.reason}). Fetch ${url} once with web_fetch and answer from what it returns.`);
  parts.push(`<page>\n${digest}\n</page>`);
  return {
    model,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: INGREDIENTS_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: [{ type: 'text', text: parts.join('\n\n') }] }],
    output_config: { effort, format: INGREDIENTS_FORMAT },
    ...(webFetch ? { tools: [webFetchTool(model)] } : {}),
    ...(supportsServerFallback(model) ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
  };
}

const ZERO: TokenCounts = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

function addUsage(total: CallUsage, message: BetaMessage, requested: string): CallUsage {
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

function parseAnswer<T>(content: readonly BetaContentBlock[], schema: z.ZodType<T>): T | null {
  const texts = content.filter((block): block is BetaTextBlock => block.type === 'text').map(block => block.text);
  for (const candidate of [texts[texts.length - 1], texts.join('')]) {
    if (!candidate) continue;
    try {
      const parsed = schema.safeParse(JSON.parse(candidate.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')));
      if (parsed.success) return parsed.data;
    } catch {
      // Not JSON: try the next reading.
    }
  }
  return null;
}

/** Claude's words after its last search, fetch or filtering run: a cited answer comes split into several text blocks, joined back here. */
function closingText(content: readonly BetaContentBlock[]): string {
  let start = 0;
  content.forEach((block, index) => {
    if (block.type !== 'text' && block.type !== 'thinking' && block.type !== 'redacted_thinking') start = index + 1;
  });
  return content
    .slice(start)
    .filter((block): block is BetaTextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');
}

function allText(content: readonly BetaContentBlock[]): string {
  return content
    .filter((block): block is BetaTextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');
}

/** The JSON object in a text, fenced or bare, whatever words come around it. */
function jsonObject(text: string): Record<string, unknown> | null {
  const open = text.indexOf('{');
  const close = text.lastIndexOf('}');
  if (open < 0 || close <= open) return null;
  try {
    const value: unknown = JSON.parse(text.slice(open, close + 1));
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function webFetchOutcome(content: readonly BetaContentBlock[]): 'read' | 'failed' | 'unknown' {
  let failed = false;
  for (const block of content) {
    if (block.type !== 'web_fetch_tool_result') continue;
    if (block.content.type === 'web_fetch_result') return 'read';
    failed = true;
  }
  return failed ? 'failed' : 'unknown';
}

function fetchedPage(content: readonly BetaContentBlock[]): Description['fetched'] {
  for (const block of content) {
    if (block.type !== 'web_fetch_tool_result' || block.content.type !== 'web_fetch_result') continue;
    const source = block.content.content.source;
    if (source.type === 'text') return { url: block.content.url, text: source.data };
  }
  return null;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof Anthropic.APIUserAbortError || error instanceof Anthropic.APIConnectionTimeoutError) return false;
  return (
    error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionError
  );
}

/** Most specific first: the timeout and connection errors are themselves `APIError`s. */
function frenchMessage(error: unknown): string {
  if (error instanceof Anthropic.APIConnectionTimeoutError) return 'Délai dépassé (Claude)';
  if (error instanceof Anthropic.APIConnectionError) return 'API Claude injoignable';
  if (error instanceof Anthropic.RateLimitError) return 'Limite de l’API Claude atteinte';
  if (error instanceof Anthropic.AuthenticationError) return 'Clé API refusée';
  if (error instanceof Anthropic.PermissionDeniedError) return 'Accès à l’API Claude refusé';
  if (error instanceof Anthropic.NotFoundError) return 'Modèle Claude introuvable';
  if (error instanceof Anthropic.InternalServerError) return error.status === 529 ? 'Claude est surchargé' : 'Erreur du service Claude';
  if (error instanceof Anthropic.APIError) {
    if (error.type === 'billing_error' || error.status === 402) return 'Crédit API épuisé';
    return `Requête refusée par l’API Claude (${error.status ?? '?'})`;
  }
  return 'Erreur de l’analyse';
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
interface Turn {
  readonly message: BetaMessage;
  readonly usage: CallUsage;
  readonly content: BetaContentBlock[];
}

export interface ClaudeLinkModelOptions {
  readonly model: string;
  readonly effort: Effort;
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export class ClaudeLinkModel implements LinkModel {
  constructor(
    private readonly api: MessagesApi,
    private readonly options: ClaudeLinkModelOptions,
  ) {}

  get model(): string {
    return this.options.model;
  }

  async describe(request: DescribeRequest, signal: AbortSignal): Promise<Description> {
    const { message, usage, content } = await this.converse(buildRequest(request, this.options.model, this.options.effort), signal);

    // Checked before reading any content: a refusal carries none, or a partial answer.
    if (message.stop_reason === 'refusal') throw new ModelError('Analyse refusée par Claude', usage);
    if (message.stop_reason === 'max_tokens') throw new ModelError('Réponse de Claude incomplète', usage);
    if (message.stop_reason === 'pause_turn') throw new ModelError('Analyse trop longue', usage);
    const raw = parseAnswer(message.content, LinkOutputSchema);
    if (!raw) throw new ModelError('Réponse de Claude illisible', usage);
    const output = normalizeOutput(raw, request.imageCount);
    const fetched = webFetchOutcome(content);
    const pageRead = request.webFetch === null || fetched === 'read' || (fetched === 'unknown' && output.pageRead);
    return { output: { ...output, pageRead }, usage, fetched: fetchedPage(content) };
  }

  async sort(batch: SortBatch, signal: AbortSignal): Promise<SortAnswer> {
    const requested = this.options.model;
    const empty: CallUsage = { model: requested, ...ZERO, costUsd: 0 };
    const message = await this.send(buildSortRequest(batch, requested, this.options.effort), signal, empty);
    const usage = addUsage(empty, message, requested);
    if (message.stop_reason === 'refusal') throw new ModelError('Tri refusé par Claude', usage);
    if (message.stop_reason === 'max_tokens') throw new ModelError('Réponse de Claude incomplète', usage);
    const answer = parseAnswer(message.content, SortOutputSchema);
    if (!answer) throw new ModelError('Réponse de Claude illisible', usage);
    return { moves: answer.moves, usage };
  }

  async findCoupons(search: ModuleSearch, signal: AbortSignal): Promise<CouponAnswer> {
    const { answer, usage } = await this.searchWeb(buildCouponRequest(search, this.options.model, this.options.effort), 'coupons', signal);
    return { ...parseCouponLists(answer.coupons, answer.tips), usage };
  }

  async findOffers(search: OfferSearch, signal: AbortSignal): Promise<OfferAnswer> {
    const { answer, usage } = await this.searchWeb(buildOfferRequest(search, this.options.model, this.options.effort), 'offers', signal);
    // A usual second-hand price means nothing for new offers.
    return { ...parseOfferLists(answer.offers, search.market === 'used' ? answer.range : null, answer.note), usage };
  }

  async findRatings(search: ModuleSearch, signal: AbortSignal): Promise<RatingsAnswer> {
    const { answer, usage } = await this.searchWeb(buildRatingsRequest(search, this.options.model, this.options.effort), 'ratings', signal);
    return { ...parseRatingsLists(answer.work, answer.ratings), usage };
  }

  async writeRecap(search: RecapSearch, signal: AbortSignal): Promise<RecapAnswer> {
    const { answer, usage } = await this.searchWeb(buildRecapRequest(search, this.options.model, this.options.effort), 'characters', signal);
    const recap = parseRecapLists(answer.recap, answer.characters, answer.stop);
    if (!recap.recap) throw new ModelError('Réponse de Claude illisible', usage);
    return { ...recap, usage };
  }

  async findCoverage(search: ModuleSearch, signal: AbortSignal): Promise<CoverageAnswer> {
    const { answer, usage } = await this.searchWeb(buildCoverageRequest(search, this.options.model, this.options.effort), 'outlets', signal);
    return { ...parseCoverageLists(answer.story, answer.outlets, answer.note), usage };
  }

  async answerQuestion(request: QuestionRequest, signal: AbortSignal): Promise<QuestionAnswer> {
    const { message, usage, content } = await this.within(buildQuestionRequest(request, this.options.model, this.options.effort), signal);
    if (message.stop_reason === 'refusal') throw new ModelError('Question refusée par Claude', usage);
    if (message.stop_reason === 'max_tokens') throw new ModelError('Réponse de Claude incomplète', usage);
    if (message.stop_reason === 'pause_turn') throw new ModelError('Recherche trop longue', usage);
    const answer = closingText(content).trim();
    if (!answer) throw new ModelError('Réponse de Claude illisible', usage);
    return { answer, sources: citedSources(content, request.link.url), usage };
  }

  async answerPages(request: PagesRequest, signal: AbortSignal): Promise<PagesAnswer> {
    const { message, usage, content } = await this.within(buildPagesRequest(request, this.options.model, this.options.effort), signal);
    if (message.stop_reason === 'refusal') throw new ModelError('Question refusée par Claude', usage);
    if (message.stop_reason === 'max_tokens') throw new ModelError('Réponse de Claude incomplète', usage);
    if (message.stop_reason === 'pause_turn') throw new ModelError('Recherche trop longue', usage);
    const answer = pagesAnswer(content, request.pages);
    if (!answer.parts.some(part => part.text.trim())) throw new ModelError('Réponse de Claude illisible', usage);
    return { answer, usage };
  }

  async listIngredients(request: IngredientsRequest, signal: AbortSignal): Promise<IngredientsAnswer> {
    const { message, usage } = await this.within(buildIngredientsRequest(request, this.options.model, this.options.effort), signal);
    if (message.stop_reason === 'refusal') throw new ModelError('Lecture refusée par Claude', usage);
    if (message.stop_reason === 'max_tokens') throw new ModelError('Réponse de Claude incomplète', usage);
    if (message.stop_reason === 'pause_turn') throw new ModelError('Analyse trop longue', usage);
    const answer = parseAnswer(message.content, IngredientsOutputSchema);
    if (!answer) throw new ModelError('Réponse de Claude illisible', usage);
    return { ingredients: parseIngredients(answer.ingredients), servings: cleanText(answer.servings, RECIPE_LIMITS.servings), steps: parseSteps(answer.steps), usage };
  }

  /** A module's web search, its JSON read from Claude's words: after its last search, else all of them (it may have answered before one more look). */
  private async searchWeb(params: MessageCreateParamsNonStreaming, list: string, signal: AbortSignal): Promise<{ answer: Record<string, unknown>; usage: CallUsage }> {
    const { message, usage, content } = await this.within(params, signal);
    if (message.stop_reason === 'refusal') throw new ModelError('Recherche refusée par Claude', usage);
    if (message.stop_reason === 'max_tokens') throw new ModelError('Réponse de Claude incomplète', usage);
    if (message.stop_reason === 'pause_turn') throw new ModelError('Recherche trop longue', usage);
    const answer = jsonObject(closingText(content)) ?? jsonObject(allText(content));
    if (!answer || !Array.isArray(answer[list])) throw new ModelError('Réponse de Claude illisible', usage);
    return { answer, usage };
  }

  /** A module's turn under its deadline: cut off, what the parts already answered cost goes with the error, for the budget. */
  private async within(params: MessageCreateParamsNonStreaming, signal: AbortSignal): Promise<Turn> {
    let spent: CallUsage = { model: this.options.model, ...ZERO, costUsd: 0 };
    try {
      return await this.converse(params, signal, usage => (spent = usage));
    } catch (error) {
      if (signal.aborted) throw new ModelError('Claude a mis trop de temps', spent);
      throw error;
    }
  }

  /** One turn, its server-tool loop resumed while it pauses: the last message, what it cost (told to `onUsage` as each part answers), and every block of the turn. */
  private async converse(first: MessageCreateParamsNonStreaming, signal: AbortSignal, onUsage?: (usage: CallUsage) => void): Promise<Turn> {
    const requested = this.options.model;
    let params = first;
    let usage: CallUsage = { model: requested, ...ZERO, costUsd: 0 };
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

  private async send(params: MessageCreateParamsNonStreaming, signal: AbortSignal, usage: CallUsage): Promise<BetaMessage> {
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
