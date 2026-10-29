/**
 * Full-text search in memory, after MiniSearch and Typesense, sized for one person's notes and
 * shared by every client. A document is a title and parts (a page's blocks, a note's lines, a
 * link's summary), each in a role: heading, body or meta.
 *
 * - Words are folded (case, accents, ligatures, an accent typed apart) and found as they are typed:
 *   whole, by their start (the word being typed, or one cut short), in the plural, inside a longer
 *   word (from four letters), by a title's initials, and, when that finds little, with a typo (one
 *   from four letters, two from eight). Words joined by a hyphen or an apostrophe are also read as
 *   one (« porte-monnaie », « aujourd'hui »).
 * - Every word of a query must match, bar its small words (« de », "the"); "words in quotes" must
 *   follow each other; -word leaves out what holds it. When nothing holds every word, what holds the
 *   most comes back, saying what it lacks.
 * - A hit's title alone answers the query, or it takes the content. Titles come first and each tier
 *   ranks on its own: a title by how well and how much of it the query covers, the content by BM25F
 *   over the roles, how close its words sit and how recent it is; both lifted by what the caller
 *   boosts (what the person opened lately, or picked for this query before).
 */
import { foldText } from './search';

export type PartRole = 'heading' | 'body' | 'meta';

export interface SearchPart {
  readonly text: string;
  readonly role: PartRole;
  /** What the part is in its document (a block, a checklist item): where a hit on it opens. */
  readonly ref?: string | null;
  /** Its weight within its role (an address counts for less than a site's name): 1 by default. */
  readonly weight?: number;
}

export interface SearchDoc<M = unknown> {
  readonly key: string;
  readonly title: string;
  readonly parts: readonly SearchPart[];
  readonly editedAt: number;
  readonly meta: M;
}

// ── words ───────────────────────────────────────────────────────────────────

/** An accent typed apart from its letter (a macOS file name's « é »). */
const COMBINING = /[̀-ͯ]/g;
/** Characters whose folding is not one for one: ligatures, the dotted capital I, an accent typed apart. */
const RESIZING = /[̀-ͯœæßŒÆİẞ]/;
const WORD = /[\p{L}\p{N}]+/gu;
/** Two words with one of these between them are also read as one: porte-monnaie, aujourd'hui. */
const JOINERS = new Set(['-', "'", '‐', '‑']);
const MAX_JOINED = 4;

/** Folded as search folds it everywhere (`foldText`), an accent typed apart dropped too. */
export function foldWords(text: string): string {
  return foldText(text).replace(COMBINING, '');
}

export interface Token {
  /** Folded. */
  readonly term: string;
  /** Where it lies in the text as written: [start, end). */
  readonly start: number;
  readonly end: number;
  /** Its place among the text's words; words read as one take their first word's place. */
  readonly index: number;
  /** Words read as one (« portemonnaie »), listed after the text's own words. */
  readonly joined: boolean;
}

/** The folded text and, when folding changed lengths, where each folded character came from. */
function foldAligned(text: string): { folded: string; origin: number[] | null } {
  const folded = foldWords(text);
  if (!RESIZING.test(text) && folded.length === text.length) return { folded, origin: null };
  const origin: number[] = [];
  let out = '';
  for (let at = 0; at < text.length; ) {
    const width = (text.codePointAt(at) ?? 0) > 0xffff ? 2 : 1;
    const piece = foldWords(text.slice(at, at + width));
    for (let k = 0; k < piece.length; k += 1) origin.push(at);
    out += piece;
    at += width;
  }
  origin.push(text.length);
  return { folded: out, origin };
}

function joinChain(chain: readonly Token[], out: Token[]): void {
  if (chain.length < 2 || chain.length > MAX_JOINED) return;
  out.push({ term: chain.map(token => token.term).join(''), start: chain[0]!.start, end: chain[chain.length - 1]!.end, index: chain[0]!.index, joined: true });
}

function scan(text: string): Token[] {
  const { folded, origin } = foldAligned(text);
  const at = (index: number): number => (origin ? origin[index]! : index);
  const tokens: Token[] = [];
  const joined: Token[] = [];
  let chain: Token[] = [];
  let lastEnd = -1;
  WORD.lastIndex = 0;
  for (let match = WORD.exec(folded); match; match = WORD.exec(folded)) {
    const start = match.index;
    const end = start + match[0].length;
    const token: Token = { term: match[0], start: at(start), end: at(end), index: tokens.length, joined: false };
    if (!(lastEnd >= 0 && start === lastEnd + 1 && JOINERS.has(folded[lastEnd]!))) {
      joinChain(chain, joined);
      chain = [];
    }
    chain.push(token);
    tokens.push(token);
    lastEnd = end;
  }
  joinChain(chain, joined);
  return joined.length > 0 ? tokens.concat(joined) : tokens;
}

const tokenCache = new Map<string, readonly Token[]>();
const TOKEN_CACHE_SIZE = 10_000;

/** A text's words, folded, with where each lies in it; the latest texts asked for are kept. */
export function tokenize(text: string): readonly Token[] {
  const cached = tokenCache.get(text);
  if (cached) {
    tokenCache.delete(text);
    tokenCache.set(text, cached);
    return cached;
  }
  const tokens = scan(text);
  tokenCache.set(text, tokens);
  if (tokenCache.size > TOKEN_CACHE_SIZE) tokenCache.delete(tokenCache.keys().next().value!);
  return tokens;
}

// ── queries ─────────────────────────────────────────────────────────────────

/** Small words a query need not find, French and English: they still rank, and count inside quotes. */
const SMALL_WORDS: ReadonlySet<string> = new Set([
  'a', 'au', 'aux', 'avec', 'c', 'ce', 'ces', 'cet', 'cette', 'd', 'dans', 'de', 'des', 'du', 'elle', 'en', 'est', 'et', 'il', 'j', 'je', 'l', 'la', 'le',
  'les', 'leur', 'lui', 'm', 'ma', 'mais', 'me', 'mes', 'mon', 'n', 'ne', 'nos', 'notre', 'nous', 'on', 'ou', 'par', 'pas', 'pour', 'qu', 'que', 'qui', 's',
  'sa', 'se', 'ses', 'son', 'sur', 't', 'ta', 'te', 'tes', 'ton', 'tu', 'un', 'une', 'vos', 'votre', 'vous', 'y',
  'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'with',
]);

export interface QueryWord {
  /** Folded. */
  readonly term: string;
  /** As typed: what a partial hit says it lacks. */
  readonly typed: string;
  /** Still being typed: the query's last word, nothing after it. */
  readonly open: boolean;
  /** A small word the results need not hold. */
  readonly optional: boolean;
  /** In quotes: this very word, in no other form. */
  readonly exact: boolean;
}

export interface QueryPhrase {
  /** Folded, in order. */
  readonly terms: readonly string[];
  /** Its closing quote not typed yet: its last word may still grow. */
  readonly open: boolean;
}

export interface Query {
  readonly words: readonly QueryWord[];
  /** Words in quotes: they must follow each other. */
  readonly phrases: readonly QueryPhrase[];
  /** Folded words after a minus: what holds one (or a word it starts) is left out. */
  readonly excluded: readonly string[];
}

const QUOTES: Readonly<Record<string, string>> = { '"': '"', '«': '»', '“': '”', '„': '“' };
const isSpace = (char: string | undefined): boolean => char !== undefined && char.trim() === '';

/** What a typed query asks for: its words, its "phrases" and its -exclusions. */
export function parseQuery(input: string): Query {
  const words: Omit<QueryWord, 'optional'>[] = [];
  const phrases: QueryPhrase[] = [];
  const excluded: string[] = [];
  const add = (raw: string, atEnd: boolean, quoted: boolean): string[] => {
    const tokens = scan(raw).filter(token => !token.joined);
    tokens.forEach((token, k) => {
      const open = atEnd && k === tokens.length - 1 && token.end === raw.length;
      // A quoted word still being typed may grow: it is matched by its start until the quote closes.
      words.push({ term: token.term, typed: raw.slice(token.start, token.end), open, exact: quoted && !open });
    });
    return tokens.map(token => token.term);
  };
  let at = 0;
  while (at < input.length) {
    const char = input[at]!;
    if (isSpace(char)) {
      at += 1;
      continue;
    }
    const close = QUOTES[char];
    if (close !== undefined) {
      let end = input.indexOf(close, at + 1);
      if (end === -1 && close !== '"') end = input.indexOf('"', at + 1);
      const closed = end !== -1;
      const inner = input.slice(at + 1, closed ? end : input.length);
      const terms = add(inner, !closed, true);
      if (terms.length > 1) phrases.push({ terms, open: !closed && !isSpace(inner[inner.length - 1]) });
      at = closed ? end + 1 : input.length;
      continue;
    }
    let end = at;
    while (end < input.length && !isSpace(input[end]) && QUOTES[input[end]!] === undefined) end += 1;
    const raw = input.slice(at, end);
    if (raw.length > 1 && raw.startsWith('-')) {
      for (const token of scan(raw.slice(1))) if (!token.joined) excluded.push(token.term);
    } else {
      add(raw, end === input.length, false);
    }
    at = end;
  }
  // Small words are optional, unless the query is made of nothing else.
  const meaningful = words.some(word => word.exact || !SMALL_WORDS.has(word.term));
  return { words: words.map(word => ({ ...word, optional: meaningful && !word.exact && SMALL_WORDS.has(word.term) })), phrases, excluded };
}

/** Nothing to look for: no word, no phrase, no exclusion. */
export function isEmptyQuery(query: Query): boolean {
  return query.words.length === 0 && query.excluded.length === 0;
}

// ── the index ───────────────────────────────────────────────────────────────

/** Title, heading, body, meta: how much a word counts in each, and the length each is measured against (BM25F). */
const ROLE_WEIGHT = [4, 2, 1, 0.6] as const;
const ROLE_LENGTH = [6, 12, 120, 16] as const;
const ROLE_INDEX: Readonly<Record<PartRole, number>> = { heading: 1, body: 2, meta: 3 };
const K1 = 1.2;
const B = 0.4;

interface Entry<M> {
  readonly doc: SearchDoc<M>;
  /** Each folded word and how much it counts here: its frequency in each role, weighted and normalised by the role's length. */
  readonly weights: ReadonlyMap<string, number>;
  /** The title's words, then those read as one. */
  readonly title: readonly Token[];
  /** How many words the title holds. */
  readonly titleLength: number;
  /** The first letter of each of the title's words: « cdc » finds « Cahier des charges ». */
  readonly initials: string;
}

export interface SearchIndex<M = unknown> {
  readonly docs: readonly SearchDoc<M>[];
  readonly entries: readonly Entry<M>[];
  /** Every folded word of every document, sorted. */
  readonly vocabulary: readonly string[];
  /** How many documents hold each word. */
  readonly frequency: ReadonlyMap<string, number>;
  /** What each query word was found to match, worked out once per index. */
  readonly expansions: Map<string, Expansion>;
}

function entryOf<M>(doc: SearchDoc<M>): Entry<M> {
  const counts = new Map<string, number[]>();
  const lengths = [0, 0, 0, 0];
  const count = (text: string, role: number, weight: number): Token[] => {
    const tokens = scan(text);
    for (const token of tokens) {
      let row = counts.get(token.term);
      if (!row) {
        row = [0, 0, 0, 0];
        counts.set(token.term, row);
      }
      row[role]! += weight;
      if (!token.joined) lengths[role]! += 1;
    }
    return tokens;
  };
  const title = count(doc.title, 0, 1);
  for (const part of doc.parts) count(part.text, ROLE_INDEX[part.role], part.weight ?? 1);
  const norms = lengths.map((length, role) => 1 - B + (B * length) / ROLE_LENGTH[role]!);
  const weights = new Map<string, number>();
  for (const [term, row] of counts) {
    let weight = 0;
    for (let role = 0; role < 4; role += 1) if (row[role]) weight += (ROLE_WEIGHT[role]! * row[role]!) / norms[role]!;
    weights.set(term, weight);
  }
  const own = title.filter(token => !token.joined);
  return { doc, weights, title, titleLength: own.length, initials: own.map(token => token.term[0]).join('') };
}

function sameText(a: SearchDoc<unknown>, b: SearchDoc<unknown>): boolean {
  if (a.title !== b.title || a.parts.length !== b.parts.length) return false;
  return a.parts.every((part, at) => {
    const other = b.parts[at]!;
    return part.text === other.text && part.role === other.role && (part.weight ?? 1) === (other.weight ?? 1);
  });
}

/** The documents indexed; a document whose words have not changed since `previous` keeps its entry. */
export function buildIndex<M>(docs: readonly SearchDoc<M>[], previous?: SearchIndex<M> | null): SearchIndex<M> {
  const before = new Map<string, Entry<M>>();
  for (const entry of previous?.entries ?? []) before.set(entry.doc.key, entry);
  const entries: Entry<M>[] = [];
  const frequency = new Map<string, number>();
  for (const doc of docs) {
    const old = before.get(doc.key);
    const entry = old && sameText(old.doc, doc) ? (old.doc === doc ? old : { ...old, doc }) : entryOf(doc);
    entries.push(entry);
    for (const term of entry.weights.keys()) frequency.set(term, (frequency.get(term) ?? 0) + 1);
  }
  return { docs, entries, vocabulary: [...frequency.keys()].sort(), frequency, expansions: new Map() };
}

// ── what a word matches ─────────────────────────────────────────────────────

export type MatchKind = 'exact' | 'prefix' | 'infix' | 'typo';

export interface WordMatch {
  readonly kind: MatchKind;
  /** 1 for the word itself, less the further it strays. */
  readonly weight: number;
  /** The part of the document's word the query covers, in folded characters: from `from`, `length` long, or to its end (null). */
  readonly from: number;
  readonly length: number | null;
}

/** The query word it answers, too (its place in `Query.words`). */
export interface MarkedMatch extends WordMatch {
  readonly word: number;
}

type Expansion = ReadonlyMap<string, WordMatch>;

/** The documents' words a query matched, and how: what to mark in them. */
export type Matcher = ReadonlyMap<string, MarkedMatch>;

/** Below this many hits found as typed, words may carry a typo. */
const FEW_HITS = 8;

function lowerBound(sorted: readonly string[], value: string): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle]! < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

let grid = new Int32Array(256);
const FAR = 1 << 20;

/**
 * How many typos (a letter added, dropped, changed, or two neighbours swapped) turn `query` into
 * `word` (`whole`), or into its start (`start`, that start `length` letters long); null when every
 * way takes more than `most`. Damerau-Levenshtein's restricted form, inside the diagonal band only.
 */
function typos(query: string, word: string, most: number): { whole: number; start: number; length: number } | null {
  const size = query.length;
  const columns = Math.min(word.length, size + most);
  if (columns < size - most) return null;
  const width = columns + 1;
  if (grid.length < (size + 1) * width) grid = new Int32Array((size + 1) * width * 2);
  for (let column = 0; column <= columns; column += 1) grid[column] = column;
  for (let line = 1; line <= size; line += 1) {
    const row = line * width;
    const from = Math.max(1, line - most);
    const to = Math.min(columns, line + most);
    grid[row + from - 1] = from === 1 ? line : FAR;
    if (to < columns) grid[row + to + 1] = FAR;
    const letter = query.charCodeAt(line - 1);
    let least = FAR;
    for (let column = from; column <= to; column += 1) {
      const other = word.charCodeAt(column - 1);
      let value = Math.min(grid[row - width + column]! + 1, grid[row + column - 1]! + 1, grid[row - width + column - 1]! + (letter === other ? 0 : 1));
      if (line > 1 && column > 1 && letter === word.charCodeAt(column - 2) && query.charCodeAt(line - 2) === other) value = Math.min(value, grid[row - 2 * width + column - 2]! + 1);
      grid[row + column] = value;
      if (value < least) least = value;
    }
    if (least > most) return null;
  }
  const last = size * width;
  const whole = word.length <= columns ? grid[last + word.length]! : FAR;
  // A start as long as the query, give or take: dropping a letter only counts on longer words.
  let start = FAR;
  let length = 0;
  for (let column = Math.max(1, size - (size >= 6 ? 1 : 0)); column <= Math.min(columns, size + most) && column < word.length; column += 1) {
    const value = grid[last + column]!;
    if (value < start || (value === start && Math.abs(column - size) < Math.abs(length - size))) {
      start = value;
      length = column;
    }
  }
  return { whole, start, length };
}

/** What a query word matches among the index's words; typos only when `lenient`. Worked out once per index. */
function expand<M>(index: SearchIndex<M>, word: QueryWord, lenient: boolean): Expansion {
  const typosAllowed = lenient && !word.exact && word.term.length >= 4 && !/\d/.test(word.term);
  const key = `${word.exact ? '=' : typosAllowed ? '~' : ':'}${word.term}`;
  const cached = index.expansions.get(key);
  if (cached) return cached;
  const query = word.term;
  const out = new Map<string, WordMatch>();
  const put = (term: string, match: WordMatch): void => {
    const had = out.get(term);
    if (!had || had.weight < match.weight) out.set(term, match);
  };
  if (index.frequency.has(query)) put(query, { kind: 'exact', weight: 1, from: 0, length: null });
  if (!word.exact) {
    const vocabulary = index.vocabulary;
    // The singular of a plural typed (the plural of a singular is a longer start, just below).
    const singular = query.length > 3 && /[sx]$/.test(query) ? query.slice(0, -1) : null;
    if (singular && index.frequency.has(singular)) put(singular, { kind: 'exact', weight: 0.95, from: 0, length: null });
    for (let at = lowerBound(vocabulary, query); at < vocabulary.length && vocabulary[at]!.startsWith(query); at += 1) {
      const term = vocabulary[at]!;
      if (term !== query) put(term, { kind: 'prefix', weight: 0.7 + (0.25 * query.length) / term.length, from: 0, length: query.length });
    }
    if (query.length >= 4) {
      for (const term of vocabulary) {
        if (term.length <= query.length) continue;
        const at = term.indexOf(query, 1);
        if (at > 0) put(term, { kind: 'infix', weight: 0.3 + (0.2 * query.length) / term.length, from: at, length: query.length });
      }
    }
    if (typosAllowed) {
      const most = query.length >= 8 ? 2 : 1;
      for (const term of vocabulary) {
        if (out.has(term) || /\d/.test(term)) continue;
        const near = typos(query, term, most);
        if (!near) continue;
        if (near.whole <= most) put(term, { kind: 'typo', weight: near.whole === 1 ? 0.5 : 0.3, from: 0, length: null });
        else if (near.start <= most) put(term, { kind: 'typo', weight: near.start === 1 ? 0.45 : 0.27, from: 0, length: near.length });
      }
    }
  }
  index.expansions.set(key, out);
  return out;
}

// ── ranking ─────────────────────────────────────────────────────────────────

export type SearchTier = 'title' | 'content' | 'partial';

export interface SearchHit<M = unknown> {
  readonly doc: SearchDoc<M>;
  /** Its title alone answers the query; it takes the content; it holds only some of the words. */
  readonly tier: SearchTier;
  readonly score: number;
  /** The query's words it lacks, as typed (a partial hit). */
  readonly missing: readonly string[];
}

export interface SearchResults<M = unknown> {
  /** Titles first, then content, then partial hits, each tier best first. */
  readonly hits: readonly SearchHit<M>[];
  readonly matcher: Matcher;
  /** Nothing matched as typed: these hits allow a typo. */
  readonly typos: boolean;
}

export interface SearchOptions<M> {
  readonly filter?: (doc: SearchDoc<M>) => boolean;
  /** How much to lift a document (0 to 1): opened lately, picked for this query before. */
  readonly boost?: (doc: SearchDoc<M>) => number;
  /** Each tier newest first instead of best first. */
  readonly byDate?: boolean;
  readonly now?: number;
}

const DAY = 86_400_000;

interface TitleMatch {
  readonly weight: number;
  readonly position: number;
  readonly span: number;
}

/** A word's best match in a title; a word found only inside a longer one does not make a title hit. */
function titleMatch<M>(entry: Entry<M>, expansion: Expansion, word: QueryWord): TitleMatch | null {
  let best: TitleMatch | null = null;
  for (const token of entry.title) {
    const match = expansion.get(token.term);
    if (!match || match.kind === 'infix') continue;
    if (!best || match.weight > best.weight) best = { weight: match.weight, position: token.index, span: 1 };
  }
  if (!best && !word.exact && word.term.length >= 3 && entry.titleLength >= 3 && !/\d/.test(word.term)) {
    const at = entry.initials.indexOf(word.term);
    if (at !== -1) best = { weight: 0.55, position: at, span: word.term.length };
  }
  return best;
}

/** How well a title answers: its matches, how much of it they cover, whether they start it and follow the query's order. */
function titleScore(matches: readonly TitleMatch[], titleLength: number, smallWords: number): number {
  let product = 1;
  const covered = new Set<number>();
  for (const match of matches) {
    product *= match.weight;
    for (let k = 0; k < match.span; k += 1) covered.add(match.position + k);
  }
  const coverage = covered.size / Math.max(1, titleLength);
  const starts = matches[0]!.position === 0 ? 0.15 : 0;
  const ordered = matches.length > 1 && matches.every((match, at) => at === 0 || match.position === matches[at - 1]!.position + matches[at - 1]!.span) ? 0.1 : 0;
  return product * (1 + 0.35 * coverage + starts + ordered) + 0.02 * smallWords;
}

/** A word's best BM25 contribution in a document, over every form of it the document holds; 0 when it holds none. */
function contentScore<M>(index: SearchIndex<M>, entry: Entry<M>, expansion: Expansion): number {
  const total = index.entries.length;
  let best = 0;
  const visit = (term: string, match: WordMatch, weight: number): void => {
    const held = index.frequency.get(term) ?? 1;
    const idf = Math.log(1 + (total - held + 0.5) / (held + 0.5));
    const score = (match.weight * idf * weight * (K1 + 1)) / (weight + K1);
    if (score > best) best = score;
  };
  if (expansion.size <= entry.weights.size) {
    for (const [term, match] of expansion) {
      const weight = entry.weights.get(term);
      if (weight !== undefined) visit(term, match, weight);
    }
  } else {
    for (const [term, weight] of entry.weights) {
      const match = expansion.get(term);
      if (match) visit(term, match, weight);
    }
  }
  return best;
}

/** The text's words, in order, hold the phrase (its last word by its start while it is typed). */
function holdsPhrase(text: string, phrase: QueryPhrase): boolean {
  const terms = tokenize(text).filter(token => !token.joined);
  const last = phrase.terms.length - 1;
  for (let at = 0; at + last < terms.length; at += 1) {
    let k = 0;
    while (k <= last && (k === last && phrase.open ? terms[at + k]!.term.startsWith(phrase.terms[k]!) : terms[at + k]!.term === phrase.terms[k])) k += 1;
    if (k > last) return true;
  }
  return false;
}

function excludedBy<M>(entry: Entry<M>, excluded: readonly string[]): boolean {
  if (excluded.length === 0) return false;
  for (const term of entry.weights.keys()) if (excluded.some(word => term.startsWith(word))) return true;
  return false;
}

/** How close the query's words sit in the part holding them all nearest: 1 when no part holds them all, up to 1.5 side by side. */
function proximity(doc: SearchDoc<unknown>, expansions: readonly Expansion[]): number {
  const need = expansions.length;
  let tightest = Infinity;
  const texts = [doc.title, ...doc.parts.slice(0, 200).map(part => part.text)];
  for (const text of texts) {
    const found: { index: number; word: number }[] = [];
    for (const token of tokenize(text)) {
      if (token.joined) continue;
      for (let word = 0; word < need; word += 1) if (expansions[word]!.has(token.term)) found.push({ index: token.index, word });
    }
    if (found.length < need) continue;
    // The shortest run of found words covering every query word.
    const seen = new Array<number>(need).fill(0);
    let distinct = 0;
    let left = 0;
    for (let right = 0; right < found.length; right += 1) {
      if (seen[found[right]!.word]!++ === 0) distinct += 1;
      while (distinct === need) {
        tightest = Math.min(tightest, found[right]!.index - found[left]!.index);
        if (--seen[found[left]!.word]! === 0) distinct -= 1;
        left += 1;
      }
    }
  }
  if (tightest === Infinity) return 1;
  return 1 + (0.5 * (need - 1)) / Math.max(need - 1, tightest);
}

interface Ranked<M> {
  readonly title: SearchHit<M>[];
  readonly content: SearchHit<M>[];
}

/** The whole words only of what a word matches: a small word's own, a short word's in the content (everything starts with « r »). */
function wholeWords<M>(index: SearchIndex<M>, word: QueryWord, expansion: Expansion): Expansion {
  const key = `!${word.term}`;
  const cached = index.expansions.get(key);
  if (cached) return cached;
  const whole = new Map([...expansion].filter(([, match]) => match.kind === 'exact'));
  index.expansions.set(key, whole);
  return whole;
}

/** Below this length a word finds titles by its start, the content only whole. */
const SHORT_WORD = 2;

/** Each required word's matches in the content: a short word's whole words only. */
function contentWords<M>(index: SearchIndex<M>, required: readonly QueryWord[], expansions: readonly Expansion[]): Expansion[] {
  return expansions.map((expansion, at) => (required[at]!.term.length <= SHORT_WORD ? wholeWords(index, required[at]!, expansion) : expansion));
}

function rank<M>(index: SearchIndex<M>, candidates: readonly Entry<M>[], query: Query, required: readonly QueryWord[], expansions: readonly Expansion[], optional: readonly Expansion[], now: number): Ranked<M> {
  const title: SearchHit<M>[] = [];
  const content: SearchHit<M>[] = [];
  const inContent = contentWords(index, required, expansions);
  for (const entry of candidates) {
    const matches: TitleMatch[] = [];
    for (let at = 0; at < required.length; at += 1) {
      const match = titleMatch(entry, expansions[at]!, required[at]!);
      if (!match) break;
      matches.push(match);
    }
    if (matches.length === required.length && query.phrases.every(phrase => holdsPhrase(entry.doc.title, phrase))) {
      const small = optional.filter(expansion => entry.title.some(token => expansion.has(token.term))).length;
      title.push({ doc: entry.doc, tier: 'title', score: titleScore(matches, entry.titleLength, small), missing: [] });
      continue;
    }
    let score = 0;
    let all = true;
    for (const expansion of inContent) {
      const part = contentScore(index, entry, expansion);
      if (part === 0) {
        all = false;
        break;
      }
      score += part;
    }
    if (!all) continue;
    if (query.phrases.length > 0 && !query.phrases.every(phrase => [entry.doc.title, ...entry.doc.parts.map(part => part.text)].some(text => holdsPhrase(text, phrase)))) continue;
    for (const expansion of optional) score += 0.3 * contentScore(index, entry, expansion);
    const age = Math.max(0, now - entry.doc.editedAt) / DAY;
    content.push({ doc: entry.doc, tier: 'content', score: score * (1 + 0.12 * Math.exp(-age / 30)), missing: [] });
  }
  return { title, content };
}

const byScore = <M>(a: SearchHit<M>, b: SearchHit<M>): number => b.score - a.score || b.doc.editedAt - a.doc.editedAt;
const byDate = <M>(a: SearchHit<M>, b: SearchHit<M>): number => b.doc.editedAt - a.doc.editedAt || b.score - a.score;

function matcherOf(words: readonly QueryWord[], expansions: readonly (Expansion | null)[]): Matcher {
  const out = new Map<string, MarkedMatch>();
  expansions.forEach((expansion, word) => {
    if (!expansion || !words[word]) return;
    for (const [term, match] of expansion) {
      const had = out.get(term);
      if (!had || had.weight < match.weight) out.set(term, { ...match, word });
    }
  });
  return out;
}

/** The documents answering a query, titles first; with nothing to look for, nothing. */
export function search<M>(index: SearchIndex<M>, query: Query, options: SearchOptions<M> = {}): SearchResults<M> {
  const { filter, boost, now = Date.now() } = options;
  if (isEmptyQuery(query)) return { hits: [], matcher: new Map(), typos: false };
  const candidates = index.entries.filter(entry => (!filter || filter(entry.doc)) && !excludedBy(entry, query.excluded));
  const requiredAt = query.words.flatMap((word, at) => (word.optional ? [] : [at]));
  const optionalAt = query.words.flatMap((word, at) => (word.optional ? [at] : []));
  const required = requiredAt.map(at => query.words[at]!);
  const sort = options.byDate ? byDate : byScore;
  if (required.length === 0) {
    // Only exclusions: whatever is left, newest first.
    return { hits: candidates.map(entry => ({ doc: entry.doc, tier: 'content' as const, score: 0, missing: [] })).sort(byDate), matcher: new Map(), typos: false };
  }
  const optional = optionalAt.map(at => wholeWords(index, query.words[at]!, expand(index, query.words[at]!, false)));
  let expansions = required.map(word => expand(index, word, false));
  let ranked = rank(index, candidates, query, required, expansions, optional, now);
  const strictCount = ranked.title.length + ranked.content.length;
  // Typos come in only when the words as typed find little, and stay only when they find more.
  let loose: Expansion[] | null = null;
  if (strictCount < FEW_HITS) {
    loose = required.map(word => expand(index, word, true));
    if (loose.some((expansion, at) => expansion.size > expansions[at]!.size)) {
      const found = rank(index, candidates, query, required, loose, optional, now);
      if (found.title.length + found.content.length > strictCount) {
        expansions = loose;
        ranked = found;
      }
    }
  }
  const lenient = expansions === loose;
  const lift = (hit: SearchHit<M>): SearchHit<M> => {
    const extra = boost ? boost(hit.doc) : 0;
    if (extra <= 0) return hit;
    return { ...hit, score: hit.tier === 'title' ? hit.score + 0.35 * extra : hit.score * (1 + 0.6 * extra) };
  };
  const title = ranked.title.map(lift).sort(sort);
  let content = ranked.content.sort(byScore);
  if (required.length > 1) {
    // Words side by side say more than words pages apart: the best few are weighed again for it.
    const near = contentWords(index, required, expansions);
    const head = content.slice(0, 40).map(hit => ({ ...hit, score: hit.score * proximity(hit.doc, near) }));
    content = head.concat(content.slice(40));
  }
  content = content.map(lift).sort(sort);
  let partial: SearchHit<M>[] = [];
  if (title.length === 0 && content.length === 0 && required.length > 1) {
    // Nothing holds every word: what holds the most of them, saying which it lacks (a typo allowed).
    if (loose) expansions = loose;
    const words = contentWords(index, required, expansions);
    let most = 1;
    for (const entry of candidates) {
      const scores = words.map(expansion => contentScore(index, entry, expansion));
      const held = scores.filter(score => score > 0).length;
      if (held === 0 || held < most) continue;
      if (held > most) {
        most = held;
        partial = [];
      }
      const missing = required.filter((_, at) => scores[at] === 0).map(word => word.typed);
      partial.push({ doc: entry.doc, tier: 'partial', score: scores.reduce((sum, score) => sum + score, 0), missing });
    }
    partial = partial.map(lift).sort(sort);
  }
  const all: (Expansion | null)[] = query.words.map(() => null);
  requiredAt.forEach((at, k) => (all[at] = expansions[k]!));
  optionalAt.forEach((at, k) => (all[at] = optional[k]!));
  return { hits: [...title, ...content, ...partial], matcher: matcherOf(query.words, all), typos: lenient && strictCount === 0 };
}

// ── showing why a document matched ──────────────────────────────────────────

/** Where a folded offset inside a token falls in the text as written. */
function writtenOffset(text: string, token: Token, folded: number): number {
  if (token.end - token.start === token.term.length) return token.start + folded;
  let length = 0;
  for (let at = token.start; at < token.end; ) {
    if (length >= folded) return at;
    const width = (text.codePointAt(at) ?? 0) > 0xffff ? 2 : 1;
    length += foldWords(text.slice(at, at + width)).length;
    at += width;
  }
  return token.end;
}

/** The ranges of a text the query matched, merged, over the text as written: a word's start where only its start was typed. */
export function highlight(text: string, matcher: Matcher): [number, number][] {
  if (matcher.size === 0 || !text) return [];
  const ranges: [number, number][] = [];
  const tokens = tokenize(text);
  for (const token of tokens) {
    const match = matcher.get(token.term);
    if (!match) continue;
    if (!token.joined) {
      ranges.push(match.length === null ? [token.start, token.end] : [writtenOffset(text, token, match.from), writtenOffset(text, token, match.from + match.length)]);
    } else if (!tokens.some(word => !word.joined && word.start >= token.start && word.end <= token.end && matcher.has(word.term))) {
      // Words read as one are marked whole, unless one of them matched on its own.
      ranges.push([token.start, token.end]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged;
}

/** The part that best answers the query: the most of its words, then the strongest matches, then the first. */
export function bestPart(doc: SearchDoc<unknown>, matcher: Matcher): SearchPart | null {
  let best: SearchPart | null = null;
  let bestScore = 0;
  for (const part of doc.parts) {
    const words = new Set<number>();
    let weight = 0;
    for (const token of tokenize(part.text)) {
      const match = matcher.get(token.term);
      if (!match || words.has(match.word)) continue;
      words.add(match.word);
      weight += match.weight;
    }
    const score = words.size * 10 + weight;
    if (score > bestScore) {
      best = part;
      bestScore = score;
    }
  }
  return best;
}

export interface Snippet {
  readonly text: string;
  readonly ranges: readonly [number, number][];
}

/**
 * A few words of a text around where the query matched it best (the most query words in the
 * window, then the first), cut at word ends, an ellipsis where it was cut, the matches marked.
 */
export function snippet(text: string, matcher: Matcher, size = 140): Snippet {
  const flat = text.replace(/\s+/g, ' ').trim();
  const all = highlight(flat, matcher);
  if (flat.length <= size) return { text: flat, ranges: all };
  const found = tokenize(flat).filter(token => !token.joined && matcher.has(token.term));
  let start = 0;
  if (found.length > 0) {
    // The window holding the most query words: two pointers over the matches, in order.
    const counts = new Map<number, number>();
    const wordOf = (token: Token): number => matcher.get(token.term)!.word;
    let bestWords = 0;
    let anchor = found[0]!.start;
    // The matches in [left, right) are counted.
    let right = 0;
    for (let left = 0; left < found.length; left += 1) {
      right = Math.max(right, left);
      const reach = found[left]!.start + size - 40;
      while (right < found.length && found[right]!.end <= reach) {
        const word = wordOf(found[right]!);
        counts.set(word, (counts.get(word) ?? 0) + 1);
        right += 1;
      }
      if (counts.size > bestWords) {
        bestWords = counts.size;
        anchor = found[left]!.start;
      }
      if (left < right) {
        const word = wordOf(found[left]!);
        const remaining = counts.get(word)! - 1;
        if (remaining === 0) counts.delete(word);
        else counts.set(word, remaining);
      }
    }
    start = Math.max(0, anchor - 36);
    if (start > 0) {
      const space = flat.indexOf(' ', start);
      start = space !== -1 && space < anchor ? space + 1 : start;
    }
  }
  let end = Math.min(flat.length, start + size);
  if (end < flat.length) {
    const space = flat.lastIndexOf(' ', end);
    if (space > start + size / 2) end = space;
  }
  const lead = start > 0 ? '…' : '';
  const shown = `${lead}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
  const ranges: [number, number][] = [];
  for (const [from, to] of all) {
    if (to <= start || from >= end) continue;
    ranges.push([Math.max(from, start) - start + lead.length, Math.min(to, end) - start + lead.length]);
  }
  return { text: shown, ranges };
}
