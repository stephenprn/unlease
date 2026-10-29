/**
 * "Demander à Claude" on the pages: a question about a page, a page and its sub-pages, or the pages
 * closest to the question, answered from them (and from the web when the person ticks it), each
 * claim with the blocks it rests on. `POST /api/pages/ask` a PagesAskRequest -> PagesAskResponse,
 * or 4xx/5xx { error } in French. Nothing is kept: the apps hold the conversation and send its last
 * turns with each question.
 */
import { isLocale, type Locale } from '@unlease/core/i18n';
import type { AskSource } from './ask';
import { cleanText, webAddress } from './brief';
import { isValidId } from '@unlease/core/sync/schema';
import { CLAUDE_RATES, type ClaudeModel } from '@unlease/core/sync/settings';

/** This page, this page and its sub-pages, or every page (the closest to the question first). */
export const PAGE_SCOPES = ['page', 'tree', 'all'] as const;
export type PageScope = (typeof PAGE_SCOPES)[number];

export function isPageScope(value: unknown): value is PageScope {
  return typeof value === 'string' && (PAGE_SCOPES as readonly string[]).includes(value);
}

/** A block as Claude reads it: its words as Markdown, the smallest piece an answer can cite. */
export interface AskBlock {
  readonly id: string;
  readonly text: string;
}

export interface AskPage {
  readonly id: string;
  /** Where it sits, its own title last: « Voyages › Lisbonne ». */
  readonly path: string;
  readonly blocks: readonly AskBlock[];
}

/** An earlier question of the conversation and what Claude answered, its citations left out. */
export interface PagesAskTurn {
  readonly question: string;
  readonly answer: string;
}

export interface PagesAskRequest {
  readonly scope: PageScope;
  readonly pages: readonly AskPage[];
  readonly question: string;
  /** The conversation so far, oldest first. */
  readonly history: readonly PagesAskTurn[];
  /** Claude may search the web too (dearer). */
  readonly web: boolean;
  readonly lang: Locale;
}

/** What a piece of the answer rests on: one page's blocks, and their words. */
export interface PagesCitation {
  readonly pageId: string;
  readonly blockIds: readonly string[];
  readonly quote: string;
}

/** A piece of the answer, and the citations (indexes in `citations`) its words rest on. */
export interface PagesAnswerPart {
  readonly text: string;
  readonly cites: readonly number[];
}

export interface PagesAskResponse {
  readonly parts: readonly PagesAnswerPart[];
  readonly citations: readonly PagesCitation[];
  /** Pages of the web Claude read, when it searched. */
  readonly sources: readonly AskSource[];
}

/** `chars` is what the longest read may send (`PAGES_REACH_CHARS.long`); the server holds each question to its own reach. */
export const PAGES_ASK_LIMITS = {
  question: 1000,
  history: 4,
  turnAnswer: 6000,
  pages: 200,
  blocks: 5000,
  block: 8000,
  path: 400,
  chars: 400_000,
  answer: 16_000,
  parts: 300,
  citations: 80,
  quote: 600,
  sources: 8,
} as const;

/** The characters a request sends Claude: its pages' paths and blocks. */
export function requestChars(pages: readonly AskPage[]): number {
  let chars = 0;
  for (const page of pages) {
    chars += page.path.length;
    for (const block of page.blocks) chars += block.text.length;
  }
  return chars;
}

/** About as many tokens as these characters (French and English Markdown: a token is three or four of them). */
const tokensOf = (chars: number): number => Math.ceil(chars / 3.5);

/** What a question costs on top of what it reads: the instructions and the question, about a thousand words written. */
const OVERHEAD_TOKENS = 1200;
const ANSWER_TOKENS = 1500;
/** The web: what its searches bring back to read, and their own price (three at most). */
const WEB_TOKENS = 20_000;
const WEB_SEARCHES_USD = 0.03;

/** What one question may cost, in US dollars: what it reads, what Claude writes, and the web when it searches. */
export function askCost(chars: number, model: ClaudeModel, web: boolean): number {
  const rates = CLAUDE_RATES[model];
  // The pages are written to the cache on a first question (a quarter dearer), read from it for a tenth after.
  const input = tokensOf(chars) * 1.25 + OVERHEAD_TOKENS + (web ? WEB_TOKENS : 0);
  return (input * rates.input + ANSWER_TOKENS * rates.output) / 1_000_000 + (web ? WEB_SEARCHES_USD : 0);
}

const record = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {});
const words = (value: unknown, limit: number): string => (typeof value === 'string' ? value.trim().slice(0, limit) : '');

function parsePages(value: unknown): AskPage[] | null {
  if (!Array.isArray(value) || value.length > PAGES_ASK_LIMITS.pages) return null;
  const pages: AskPage[] = [];
  let blocks = 0;
  for (const entry of value) {
    const raw = record(entry);
    if (!isValidId(raw.id) || !Array.isArray(raw.blocks)) return null;
    const kept: AskBlock[] = [];
    for (const item of raw.blocks) {
      const block = record(item);
      // Kept whole: Claude cites a block by its place, so a block cut short would cite words never sent.
      if (!isValidId(block.id) || typeof block.text !== 'string' || block.text.length > PAGES_ASK_LIMITS.block) return null;
      if (block.text.trim()) kept.push({ id: block.id, text: block.text });
    }
    blocks += kept.length;
    if (blocks > PAGES_ASK_LIMITS.blocks) return null;
    pages.push({ id: raw.id, path: words(raw.path, PAGES_ASK_LIMITS.path), blocks: kept });
  }
  return requestChars(pages) <= PAGES_ASK_LIMITS.chars ? pages : null;
}

export function parsePagesAskRequest(body: unknown): PagesAskRequest | null {
  const raw = record(body);
  const question = words(raw.question, PAGES_ASK_LIMITS.question);
  const pages = parsePages(raw.pages);
  if (!question || !pages || !isPageScope(raw.scope)) return null;
  const history = (Array.isArray(raw.history) ? raw.history : [])
    .map(entry => {
      const turn = record(entry);
      return { question: words(turn.question, PAGES_ASK_LIMITS.question), answer: words(turn.answer, PAGES_ASK_LIMITS.turnAnswer) };
    })
    .filter(turn => turn.question && turn.answer)
    .slice(-PAGES_ASK_LIMITS.history);
  return { scope: raw.scope, pages, question, history, web: raw.web === true, lang: isLocale(raw.lang) ? raw.lang : 'fr' };
}

/** An answer as the apps show it: its pieces kept in order, citations pointing only at what exists. */
export function parsePagesAskResponse(body: unknown): PagesAskResponse | null {
  const raw = record(body);
  const citations: PagesCitation[] = [];
  for (const entry of (Array.isArray(raw.citations) ? raw.citations : []).slice(0, PAGES_ASK_LIMITS.citations)) {
    const citation = record(entry);
    const blockIds = (Array.isArray(citation.blockIds) ? citation.blockIds : []).filter(isValidId);
    if (!isValidId(citation.pageId)) return null;
    citations.push({ pageId: citation.pageId, blockIds, quote: words(citation.quote, PAGES_ASK_LIMITS.quote) });
  }
  const parts: PagesAnswerPart[] = [];
  let length = 0;
  for (const entry of (Array.isArray(raw.parts) ? raw.parts : []).slice(0, PAGES_ASK_LIMITS.parts)) {
    const part = record(entry);
    if (typeof part.text !== 'string' || !part.text) continue;
    const text = part.text.slice(0, Math.max(0, PAGES_ASK_LIMITS.answer - length));
    if (!text) break;
    length += text.length;
    const cites = (Array.isArray(part.cites) ? part.cites : []).filter((index): index is number => Number.isInteger(index) && index >= 0 && index < citations.length);
    parts.push({ text, cites: [...new Set(cites)] });
  }
  if (!parts.some(part => part.text.trim())) return null;
  const seen = new Set<string>();
  const sources: AskSource[] = [];
  for (const entry of Array.isArray(raw.sources) ? raw.sources : []) {
    const source = record(entry);
    const url = webAddress(source.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push({ title: cleanText(source.title, 200) || url, url });
    if (sources.length === PAGES_ASK_LIMITS.sources) break;
  }
  return { parts, citations, sources };
}
