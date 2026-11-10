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
 * The calls go through the suite's Claude client (`claude/client.ts`: retries, the tool loop, the
 * costs, the tools); the prompts, formats and answers here are Carnet's.
 */
import type { Locale } from '@unlease/core/i18n';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { BetaContentBlock, BetaContentBlockParam, BetaTextBlock, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { z } from 'zod';
import { INBOX_TITLE, LINK_KINDS } from '@unlease/notes/models/entities';
import type { AskSource } from '@unlease/notes/sync/ask';
import { cleanText, webAddress, type LinkBrief } from '@unlease/notes/sync/brief';
import { parseCouponLists, type Coupon, type CouponTip } from '@unlease/notes/sync/coupons';
import { parseCoverageLists, type CoverageResponse } from '@unlease/notes/sync/coverage';
import { parseRatingsLists, parseRecapLists, type RatingsResponse, type RecapResponse } from '@unlease/notes/sync/works';
import { parseOfferLists, type Offer, type OfferMarket, type PriceRange } from '@unlease/notes/sync/offers';
import { parseIngredients, parseSteps, RECIPE_LIMITS, type RecipeStep } from '@unlease/notes/sync/recipe';
import type { SortLink, SortTarget, SortTask } from '@unlease/notes/sync/sorting';
import type { Effort } from '../../../config';
import { FALLBACK_BETA, LANGUAGE_NAMES, ModelError, MODULE_MAX_TOKENS, QUESTION_SEARCHES, supportsServerFallback, webFetchTool, webSearchTool, type ClaudeClient } from '../../../claude/client';
import type { BudgetHold, CallUsage } from '../../../claude/usage';
import { promptFieldLines } from '@unlease/notes/services/templates';
import type { RoutingList } from './lists';
import { attributeLimit, NO_TEMPLATES, type TemplateAsk } from './templates';
import { INGREDIENTS_OUTPUT_JSON_SCHEMA, IngredientsOutputSchema, LinkOutputSchema, normalizeOutput, SORT_OUTPUT_JSON_SCHEMA, SortOutputSchema, type LinkOutput, type SortOutput } from './output';
import { ASK_PROMPT, COUPONS_PROMPT, COVERAGE_PROMPT, INGREDIENTS_PROMPT, OFFERS_PROMPT, RATINGS_PROMPT, RECAP_PROMPT, SORT_PROMPT, SYSTEM_PROMPT } from './prompt';

const MAX_TOKENS = 8000;
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
  /** The person's own fields, when they differ from the prompt's presets (none: the presets). */
  readonly templates?: TemplateAsk;
}

export interface Description {
  readonly output: LinkOutput;
  readonly usage: CallUsage;
  /** The page as web_fetch returned it (and where it read it), when Claude had to read it itself. */
  readonly fetched: { readonly url: string; readonly text: string } | null;
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

export { ModelError };

export interface LinkModel {
  readonly model: string;
  /** The same model, its requests held against the budget by `hold` (`UsageStore.hold`). */
  holding(hold: BudgetHold): LinkModel;
  describe(request: DescribeRequest, signal: AbortSignal): Promise<Description>;
  sort(batch: SortBatch, signal: AbortSignal): Promise<SortAnswer>;
  findCoupons(search: ModuleSearch, signal: AbortSignal): Promise<CouponAnswer>;
  findOffers(search: OfferSearch, signal: AbortSignal): Promise<OfferAnswer>;
  listIngredients(request: IngredientsRequest, signal: AbortSignal): Promise<IngredientsAnswer>;
  findRatings(search: ModuleSearch, signal: AbortSignal): Promise<RatingsAnswer>;
  writeRecap(search: RecapSearch, signal: AbortSignal): Promise<RecapAnswer>;
  findCoverage(search: ModuleSearch, signal: AbortSignal): Promise<CoverageAnswer>;
  answerQuestion(request: QuestionRequest, signal: AbortSignal): Promise<QuestionAnswer>;
}

/** A field as a list carries it in <lists>: its line without the dash. */
const fieldEntries = (fields: Parameters<typeof promptFieldLines>[0]): string[] => promptFieldLines(fields).map(line => line.slice(2));

/** The person's fields, when they differ from the presets: the collection's own, or the kinds they changed. Fixed words around the person's own. */
function templateText({ fields, kinds }: TemplateAsk): string | null {
  if (fields) {
    if (fields.length === 0) return 'This link\'s collection reads its links with the person\'s own fields, and asks for none: answer an empty attributes list.';
    return `This link's collection reads its links with the person's own fields. Fill exactly these fields as the attributes, in this order, instead of the kind's list:\n<fields>\n${promptFieldLines(fields).join('\n')}\n</fields>`;
  }
  if (kinds.length === 0) return null;
  const rows = kinds.map(({ kind, fields: own }) => (own.length === 0 ? `${kind}: no fields (an empty attributes list)` : `${kind}:\n${promptFieldLines(own).join('\n')}`));
  return `The person's own fields for these kinds replace the lists above; fill exactly these when the link is of one of them:\n<kinds>\n${rows.join('\n')}\n</kinds>`;
}

function userText({ url, digest, lists, webFetch, lang, templates = NO_TEMPLATES }: DescribeRequest): string {
  const parts: string[] = [`Language: ${LANGUAGE_NAMES[lang]}.`];
  if (lists) {
    parts.push('Describe this link and file it: choose the list it belongs in, or answer listId null when none is a clear fit.');
    const rows = lists.map(list =>
      JSON.stringify({
        id: list.id,
        title: list.title,
        ...(list.hint ? { description: list.hint } : {}),
        ...(list.examples.length > 0 ? { examples: list.examples } : {}),
        ...(list.fields ? { fields: fieldEntries(list.fields) } : {}),
      }),
    );
    parts.push(`<lists>\n${rows.join('\n')}\n</lists>`);
    if (lists.some(list => list.fields)) parts.push('A list with fields reads its links with them: when you file the link into one, its attributes are exactly those fields, each named as written.');
  } else {
    parts.push('Describe this link. Filing is not asked for: answer listId null.');
  }
  const own = templateText(templates);
  if (own) parts.push(own);
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

/** Carnet's calls, made through the suite's client. */
export class ClaudeLinkModel implements LinkModel {
  constructor(private readonly client: ClaudeClient) {}

  get model(): string {
    return this.client.model;
  }

  holding(hold: BudgetHold): LinkModel {
    return new ClaudeLinkModel(this.client.holding(hold));
  }

  async describe(request: DescribeRequest, signal: AbortSignal): Promise<Description> {
    const { message, usage, content } = await this.client.converse(buildRequest(request, this.client.model, this.client.effort), signal);

    // Checked before reading any content: a refusal carries none, or a partial answer.
    if (message.stop_reason === 'refusal') throw new ModelError('Analyse refusée par Claude', usage);
    if (message.stop_reason === 'max_tokens') throw new ModelError('Réponse de Claude incomplète', usage);
    if (message.stop_reason === 'pause_turn') throw new ModelError('Analyse trop longue', usage);
    const raw = parseAnswer(message.content, LinkOutputSchema);
    if (!raw) throw new ModelError('Réponse de Claude illisible', usage);
    const asked = request.templates ?? NO_TEMPLATES;
    const counts = [...(asked.fields ? [asked.fields.length] : []), ...asked.kinds.map(kind => kind.fields.length), ...(request.lists ?? []).map(list => list.fields?.length ?? 0)];
    const output = normalizeOutput(raw, request.imageCount, attributeLimit(counts));
    const fetched = webFetchOutcome(content);
    const pageRead = request.webFetch === null || fetched === 'read' || (fetched === 'unknown' && output.pageRead);
    return { output: { ...output, pageRead }, usage, fetched: fetchedPage(content) };
  }

  async sort(batch: SortBatch, signal: AbortSignal): Promise<SortAnswer> {
    const { message, usage } = await this.client.once(buildSortRequest(batch, this.client.model, this.client.effort), signal);
    if (message.stop_reason === 'refusal') throw new ModelError('Tri refusé par Claude', usage);
    if (message.stop_reason === 'max_tokens') throw new ModelError('Réponse de Claude incomplète', usage);
    const answer = parseAnswer(message.content, SortOutputSchema);
    if (!answer) throw new ModelError('Réponse de Claude illisible', usage);
    return { moves: answer.moves, usage };
  }

  async findCoupons(search: ModuleSearch, signal: AbortSignal): Promise<CouponAnswer> {
    const { answer, usage } = await this.searchWeb(buildCouponRequest(search, this.client.model, this.client.effort), 'coupons', signal);
    return { ...parseCouponLists(answer.coupons, answer.tips), usage };
  }

  async findOffers(search: OfferSearch, signal: AbortSignal): Promise<OfferAnswer> {
    const { answer, usage } = await this.searchWeb(buildOfferRequest(search, this.client.model, this.client.effort), 'offers', signal);
    // A usual second-hand price means nothing for new offers.
    return { ...parseOfferLists(answer.offers, search.market === 'used' ? answer.range : null, answer.note), usage };
  }

  async findRatings(search: ModuleSearch, signal: AbortSignal): Promise<RatingsAnswer> {
    const { answer, usage } = await this.searchWeb(buildRatingsRequest(search, this.client.model, this.client.effort), 'ratings', signal);
    return { ...parseRatingsLists(answer.work, answer.ratings), usage };
  }

  async writeRecap(search: RecapSearch, signal: AbortSignal): Promise<RecapAnswer> {
    const { answer, usage } = await this.searchWeb(buildRecapRequest(search, this.client.model, this.client.effort), 'characters', signal);
    const recap = parseRecapLists(answer.recap, answer.characters, answer.stop);
    if (!recap.recap) throw new ModelError('Réponse de Claude illisible', usage);
    return { ...recap, usage };
  }

  async findCoverage(search: ModuleSearch, signal: AbortSignal): Promise<CoverageAnswer> {
    const { answer, usage } = await this.searchWeb(buildCoverageRequest(search, this.client.model, this.client.effort), 'outlets', signal);
    return { ...parseCoverageLists(answer.story, answer.outlets, answer.note), usage };
  }

  async answerQuestion(request: QuestionRequest, signal: AbortSignal): Promise<QuestionAnswer> {
    const { message, usage, content } = await this.client.within(buildQuestionRequest(request, this.client.model, this.client.effort), signal);
    if (message.stop_reason === 'refusal') throw new ModelError('Question refusée par Claude', usage);
    if (message.stop_reason === 'max_tokens') throw new ModelError('Réponse de Claude incomplète', usage);
    if (message.stop_reason === 'pause_turn') throw new ModelError('Recherche trop longue', usage);
    const answer = closingText(content).trim();
    if (!answer) throw new ModelError('Réponse de Claude illisible', usage);
    return { answer, sources: citedSources(content, request.link.url), usage };
  }

  async listIngredients(request: IngredientsRequest, signal: AbortSignal): Promise<IngredientsAnswer> {
    const { message, usage } = await this.client.within(buildIngredientsRequest(request, this.client.model, this.client.effort), signal);
    if (message.stop_reason === 'refusal') throw new ModelError('Lecture refusée par Claude', usage);
    if (message.stop_reason === 'max_tokens') throw new ModelError('Réponse de Claude incomplète', usage);
    if (message.stop_reason === 'pause_turn') throw new ModelError('Analyse trop longue', usage);
    const answer = parseAnswer(message.content, IngredientsOutputSchema);
    if (!answer) throw new ModelError('Réponse de Claude illisible', usage);
    return { ingredients: parseIngredients(answer.ingredients), servings: cleanText(answer.servings, RECIPE_LIMITS.servings), steps: parseSteps(answer.steps), usage };
  }

  /** A module's web search, its JSON read from Claude's words: after its last search, else all of them (it may have answered before one more look). */
  private async searchWeb(params: MessageCreateParamsNonStreaming, list: string, signal: AbortSignal): Promise<{ answer: Record<string, unknown>; usage: CallUsage }> {
    const { message, usage, content } = await this.client.within(params, signal);
    if (message.stop_reason === 'refusal') throw new ModelError('Recherche refusée par Claude', usage);
    if (message.stop_reason === 'max_tokens') throw new ModelError('Réponse de Claude incomplète', usage);
    if (message.stop_reason === 'pause_turn') throw new ModelError('Recherche trop longue', usage);
    const answer = jsonObject(closingText(content)) ?? jsonObject(allText(content));
    if (!answer || !Array.isArray(answer[list])) throw new ModelError('Réponse de Claude illisible', usage);
    return { answer, usage };
  }


}
