/**
 * What « @ » offers as the word after it grows, in every app: a person, an event, a page, a note, a
 * collection, a link. Each typed word must start a word of the name (« lé ma » finds « Léa Martin »),
 * or sit inside one, or be found in what else names it (a number, an e-mail, a work line): accents
 * and case aside, the name's word-starts first, the name that starts with the whole query before,
 * then the likelier one (a favourite, an event coming soon, a page just written), then the shorter.
 * With nothing typed yet, the likelier ones first, a few of each kind.
 */
import { displayToModel, type RichDisplay } from './richDisplay';
import { concatRich, richToPlain, sliceRich, type AtomRun, type Run } from './richText';
import { foldText } from './search';

export interface MentionEntry {
  /** What it is called, as the menu shows it. */
  readonly title: string;
  /** What else finds it, searched after the name: a number, an e-mail, a work line, a page's path. */
  readonly also?: string;
  /** How likely it is wanted, 0 to 1 (a favourite, an event soon, a page just written). */
  readonly boost?: number;
}

const WORD_SPLIT = /[^\p{L}\p{N}]+/u;

/** The query's words, folded; none for nothing typed. */
export function queryWords(query: string): string[] {
  return foldText(query).split(WORD_SPLIT).filter(Boolean);
}

/**
 * How well an entry answers a query: 0 when it does not, else the higher the better. Each word
 * typed scores where it is found: at a word's start in the name (more when it is the whole word),
 * inside the name, or in what else names it; one word found nowhere and the entry is out.
 */
export function mentionScore(entry: MentionEntry, query: string): number {
  const words = queryWords(query);
  const boost = Math.max(0, Math.min(1, entry.boost ?? 0));
  if (words.length === 0) return 1 + boost;
  const title = foldText(entry.title);
  const starts = title.split(WORD_SPLIT).filter(Boolean);
  const also = entry.also ? foldText(entry.also) : '';
  let score = 0;
  for (const word of words) {
    if (starts.includes(word)) score += 5;
    else if (starts.some(start => start.startsWith(word))) score += 4;
    else if (title.includes(word)) score += 2;
    else if (also.includes(word)) score += 1;
    else return 0;
  }
  const whole = words.join(' ');
  if (title.startsWith(whole)) score += 3;
  else if (title.includes(whole)) score += 1;
  return score + boost;
}

/** The entries that answer, best first: the score, then the likelier, then the shorter name (once something is typed), then as given. */
export function rankMentions<T extends MentionEntry>(entries: readonly T[], query: string, max = Infinity): T[] {
  // With nothing typed, the order given (the most recent first) after the likelier.
  const typed = queryWords(query).length > 0;
  return entries
    .map((entry, index) => ({ entry, index, score: mentionScore(entry, query) }))
    .filter(found => found.score > 0)
    .sort((a, b) => b.score - a.score || (b.entry.boost ?? 0) - (a.entry.boost ?? 0) || (typed ? a.entry.title.length - b.entry.title.length : 0) || a.index - b.index)
    .slice(0, max)
    .map(found => found.entry);
}

/** A kind of what can be mentioned and its entries, in the menu's order while nothing is typed. */
export interface MentionSection<S extends string, T extends MentionEntry> {
  readonly section: S;
  readonly entries: readonly T[];
  /** Already ranked by their own search (Agenda's events read their place and notes too): kept in that order. */
  readonly ranked?: boolean;
}

export interface MentionHit<S extends string, T extends MentionEntry> {
  readonly section: S;
  readonly entry: T;
  readonly score: number;
}

export interface MentionListOptions {
  /** At most this many of a kind (with nothing typed: `idle`). */
  readonly perSection?: number;
  readonly idle?: number;
  /** At most this many in all. */
  readonly total?: number;
  /**
   * Kinds kept together under their heads (a menu that shows them), the kind of the best answer
   * first; else one list, the best answer first whatever its kind (a phone's strip).
   */
  readonly grouped?: boolean;
}

/** What « @ » offers for `query` from each kind's entries, in the order the menu shows them. */
export function mentionList<S extends string, T extends MentionEntry>(sections: readonly MentionSection<S, T>[], query: string, options: MentionListOptions = {}): MentionHit<S, T>[] {
  const typed = queryWords(query).length > 0;
  const cap = typed ? (options.perSection ?? 6) : (options.idle ?? 3);
  const total = options.total ?? Infinity;
  const kinds = sections.map((kind, order) => {
    // Found by their own search: those whose name answers first, the rest after them, each in that search's order.
    const hits = kind.ranked
      ? kind.entries
          .map((entry, at) => ({ section: kind.section, entry, at, score: typed ? Math.max(mentionScore(entry, query), 0.5) : 1 }))
          .sort((a, b) => Math.floor(b.score) - Math.floor(a.score) || a.at - b.at)
          .map(({ section, entry, score, at }) => ({ section, entry, score: score - at * 0.001 }))
      : rankMentions(kind.entries, query).map(entry => ({ section: kind.section, entry, score: mentionScore(entry, query) }));
    return { order, hits: hits.slice(0, cap) };
  });
  if (!typed) return kinds.flatMap(kind => kind.hits).slice(0, total);
  if (options.grouped) {
    // By how well its best answer reads (the likelier's few tenths aside), then in the menu's order.
    const best = (kind: (typeof kinds)[number]): number => Math.floor(kind.hits[0]?.score ?? 0);
    return [...kinds]
      .filter(kind => kind.hits.length > 0)
      .sort((a, b) => best(b) - best(a) || a.order - b.order)
      .flatMap(kind => kind.hits)
      .slice(0, total);
  }
  return kinds
    .flatMap(kind => kind.hits.map(hit => ({ hit, order: kind.order })))
    .sort((a, b) => b.hit.score - a.hit.score || a.order - b.order)
    .map(found => found.hit)
    .slice(0, total);
}

/**
 * The words after a « @ » the caret stands at the end of, and where the « @ » is: null outside one.
 * The « @ » starts a word (an e-mail address asks for nobody); what follows holds no line break, at
 * most one space in a row and 40 characters (a menu closes on its own once a space follows words
 * nothing answers: `closesAfter`).
 */
export function mentionQueryAt(text: string, caret: number): { readonly at: number; readonly query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0 || (at > 0 && !/[\s([{«"'“‘]/.test(before[at - 1]!))) return null;
  const query = before.slice(at + 1);
  if (query.length > 40 || /[\n\r]/.test(query) || /\s{2}/.test(query) || /^\s/.test(query) || query.includes('@')) return null;
  return { at, query };
}

/** Whether a query's menu gives up: a space typed after words nothing answers (« @rdv demain » is words, not a name). */
export function closesAfter(query: string, found: number): boolean {
  return found === 0 && /\s/.test(query);
}

/**
 * The same in a field showing rich text (the phone's: each mention spelled « @Its name »,
 * `richDisplay`): the « @ » and the words after it must be typed words, not a mention's or a date's.
 * `at` is where the « @ » is shown, `start` where it is in the runs (whose offsets count a mention as one).
 */
export function displayMentionQuery(display: RichDisplay, caret: number): { readonly at: number; readonly start: number; readonly query: string } | null {
  const found = mentionQueryAt(display.text, caret);
  if (!found) return null;
  if (display.spans.some(span => span.run.kind !== 'text' && span.display < caret && span.display + span.length > found.at)) return null;
  return { at: found.at, start: displayToModel(display, found.at, 'start'), query: found.query };
}

/** A mention (or a date) in place of what asked for it (`[start, end)` of the runs), a space after it unless one follows; the caret goes after that space. */
export function placeMention(runs: readonly Run[], start: number, end: number, atom: AtomRun): { readonly runs: Run[]; readonly caret: number } {
  const next = richToPlain(sliceRich(runs, end, end + 1));
  const spaced = next === ' ' || next === '\u00a0';
  const inserted: Run[] = spaced ? [atom] : [atom, { kind: 'text', text: ' ', marks: {} }];
  return { runs: concatRich(sliceRich(runs, 0, start), inserted, sliceRich(runs, end)), caret: start + 2 };
}
