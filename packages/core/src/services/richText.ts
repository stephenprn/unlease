/**
 * Rich text, as a page's blocks store it: one string the typed-text merge can work on word by word
 * (`core/sync/textMerge`), so two devices editing a paragraph keep both edits, formatting included.
 *
 *   plain text      `\`, `{` and `}` escaped with `\`
 *   a run of marks  `{b,i,fg=red,a=https\://x.fr:the text}`: b bold, i italic, u underline,
 *                   s strikethrough, c code, k keyboard keys, fg text colour, bg highlight
 *                   (pigment keys), a link; inside a value `\`, `,`, `:`, `{` and `}` are escaped
 *   a mention       `{@type=ID}`: anything of the suite (`refs`), `{@page=ID}`, `{@note=ID}` (a note
 *                   or a collection), `{@link=ID}`; a type a newer client added is kept as it is
 *   a date          `{@date=2026-10-28}`, or with a time `{@date=2026-10-28T1430}`
 *
 * The parser never throws: a merge may cut a run in two, so a run left open ends where the text
 * or the next run starts, a stray `}` is a character, and an unknown mark is ignored. A mention or
 * a date counts as one character in every offset (`MENTION_CHAR` in plain text).
 */
import type { Ref } from '../refs';

export interface Marks {
  readonly b?: true;
  readonly i?: true;
  readonly u?: true;
  readonly s?: true;
  readonly c?: true;
  /** Keyboard keys (« Ctrl+Maj+P »), drawn as little keys. */
  readonly k?: true;
  /** Text colour: a pigment key. */
  readonly fg?: string;
  /** Highlight: a pigment key, drawn as its wash. */
  readonly bg?: string;
  /** A link's address. */
  readonly a?: string;
}

export type FlagMark = 'b' | 'i' | 'u' | 's' | 'c' | 'k';
export type ValueMark = 'fg' | 'bg' | 'a';

export interface TextRun {
  readonly kind: 'text';
  readonly text: string;
  readonly marks: Marks;
}

export interface MentionRun {
  readonly kind: 'mention';
  readonly target: Ref;
}

/** A day written as a date, read relative to today where it is shown (`core/services/dates`). */
export interface DateRun {
  readonly kind: 'date';
  /** `2026-10-28`. */
  readonly date: string;
  /** `14:30`, or null for the whole day. */
  readonly time: string | null;
}

export type Run = TextRun | MentionRun | DateRun;

/** A run that stands as one character: a mention or a date. */
export type AtomRun = MentionRun | DateRun;

/** A mention's or a date's place in plain text: the object replacement character. */
export const MENTION_CHAR = '\uFFFC';

const FLAGS: readonly FlagMark[] = ['b', 'i', 'u', 's', 'c', 'k'];
const VALUES: readonly ValueMark[] = ['fg', 'bg', 'a'];
/** Marks are short; a longer head is no run (its `{` is a character). Room for a 4000-character address. */
const MAX_MARKS = 4200;
/** A type as `refs` writes it (`date` is the date atom's); an id as the schema allows it. */
const MENTION = /\{@(?!date=)([a-z][a-zA-Z]{0,31})=([A-Za-z0-9_-]{1,64})\}/y;
const DATE = /\{@date=(\d{4})-(\d{2})-(\d{2})(?:T(\d{2})(\d{2}))?\}/y;
const SPECIAL = /[\\{}]/;

const text = (value: string, marks: Marks = {}): TextRun => ({ kind: 'text', text: value, marks });

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** A real calendar day as `2026-10-28`, or null. */
export function validDay(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1 || year > 9999) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

/** A date run, when the day (and the time) are real. */
export function dateRun(date: string, time: string | null = null): DateRun | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!day || !validDay(Number(day[1]), Number(day[2]), Number(day[3]))) return null;
  if (time !== null) {
    const clock = /^(\d{2}):(\d{2})$/.exec(time);
    if (!clock || Number(clock[1]) > 23 || Number(clock[2]) > 59) return null;
  }
  return { kind: 'date', date, time };
}

/** A mention or a date: one character in every offset. */
export const isAtom = (run: Run): run is AtomRun => run.kind !== 'text';

function readMarks(source: string, from: number): { readonly marks: Marks; readonly end: number } | null {
  const marks: { -readonly [K in keyof Marks]: Marks[K] } = {};
  let item = '';
  const take = (): void => {
    if ((FLAGS as readonly string[]).includes(item)) {
      marks[item as FlagMark] = true;
    } else {
      const equals = item.indexOf('=');
      const key = item.slice(0, equals);
      const value = item.slice(equals + 1);
      if (equals > 0 && value && (VALUES as readonly string[]).includes(key)) marks[key as ValueMark] = value;
    }
    item = '';
  };
  const limit = Math.min(source.length, from + MAX_MARKS);
  for (let at = from; at < limit; at += 1) {
    const char = source[at]!;
    if (char === '\\' && at + 1 < source.length) {
      item += source[at + 1];
      at += 1;
    } else if (char === ',') {
      take();
    } else if (char === ':') {
      take();
      return { marks, end: at + 1 };
    } else if (char === '{' || char === '}') {
      return null;
    } else {
      item += char;
    }
  }
  return null;
}

export function sameMarks(a: Marks, b: Marks): boolean {
  for (const key of FLAGS) if (a[key] !== b[key]) return false;
  for (const key of VALUES) if (a[key] !== b[key]) return false;
  return true;
}

/** Runs in their simplest form: no empty text, neighbours with the same marks joined, no stray mention characters. */
export function normalizeRich(runs: readonly Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    if (run.kind !== 'text') {
      out.push(run);
      continue;
    }
    const value = run.text.includes(MENTION_CHAR) ? run.text.split(MENTION_CHAR).join('') : run.text;
    if (!value) continue;
    const last = out[out.length - 1];
    if (last?.kind === 'text' && sameMarks(last.marks, run.marks)) out[out.length - 1] = text(last.text + value, last.marks);
    else out.push(value === run.text ? run : text(value, run.marks));
  }
  return out;
}

export function parseRich(source: string): Run[] {
  if (!SPECIAL.test(source)) return source ? normalizeRich([text(source)]) : [];
  const runs: Run[] = [];
  let plain = '';
  const flush = (): void => {
    if (plain) runs.push(text(plain));
    plain = '';
  };
  let at = 0;
  while (at < source.length) {
    const char = source[at]!;
    if (char === '\\') {
      plain += at + 1 < source.length ? source[at + 1] : '\\';
      at += 2;
      continue;
    }
    if (char !== '{') {
      plain += char;
      at += 1;
      continue;
    }
    if (source[at + 1] === '@') {
      MENTION.lastIndex = at;
      const mention = MENTION.exec(source);
      if (mention) {
        flush();
        runs.push({ kind: 'mention', target: { type: mention[1]!, id: mention[2]! } });
        at = MENTION.lastIndex;
        continue;
      }
      DATE.lastIndex = at;
      const found = DATE.exec(source);
      const date = found ? dateRun(`${found[1]}-${found[2]}-${found[3]}`, found[4] !== undefined ? `${found[4]}:${found[5]}` : null) : null;
      if (date) {
        flush();
        runs.push(date);
        at = DATE.lastIndex;
        continue;
      }
    }
    const head = readMarks(source, at + 1);
    if (!head) {
      plain += '{';
      at += 1;
      continue;
    }
    let body = '';
    let end = head.end;
    while (end < source.length) {
      const next = source[end]!;
      if (next === '\\' && end + 1 < source.length) {
        body += source[end + 1];
        end += 2;
      } else if (next === '}') {
        end += 1;
        break;
      } else if (next === '{') {
        break;
      } else {
        body += next;
        end += 1;
      }
    }
    flush();
    runs.push(text(body, head.marks));
    at = end;
  }
  flush();
  return normalizeRich(runs);
}

const escapeText = (value: string): string => value.replace(/[\\{}]/g, char => `\\${char}`);
const escapeValue = (value: string): string => value.replace(/[\\,:{}]/g, char => `\\${char}`);

function serializeMarks(marks: Marks): string {
  const items: string[] = [];
  for (const key of FLAGS) if (marks[key]) items.push(key);
  for (const key of VALUES) {
    const value = marks[key];
    if (value) items.push(`${key}=${escapeValue(value)}`);
  }
  return items.join(',');
}

export function serializeRich(runs: readonly Run[]): string {
  let out = '';
  for (const run of normalizeRich(runs)) {
    if (run.kind === 'mention') {
      out += `{@${run.target.type}=${run.target.id}}`;
      continue;
    }
    if (run.kind === 'date') {
      out += `{@date=${run.date}${run.time ? `T${run.time.replace(':', '')}` : ''}}`;
      continue;
    }
    const head = serializeMarks(run.marks);
    out += head ? `{${head}:${escapeText(run.text)}}` : escapeText(run.text);
  }
  return out;
}

export function richFromPlain(value: string): Run[] {
  return normalizeRich([text(value)]);
}

const runLength = (run: Run): number => (run.kind === 'text' ? run.text.length : 1);

export function richLength(runs: readonly Run[]): number {
  let length = 0;
  for (const run of runs) length += runLength(run);
  return length;
}

/** A date as words that stay true whatever day they are read (a search, the clipboard): « 28 oct. 2026 », « 28 oct. 2026 14:30 ». */
export type DateLabel = (run: DateRun) => string;

/** The default `DateLabel`: the day as `2026-10-28`, then its time. */
export const isoDateLabel: DateLabel = run => (run.time ? `${run.date} ${run.time}` : run.date);

/**
 * The text: a mention or a date as `MENTION_CHAR` (offsets), or, with `label`, as words (a search,
 * the clipboard): a mention as `label` names it, a date as `dateLabel` writes it.
 */
export function richToPlain(runs: readonly Run[], label?: (target: Ref) => string, dateLabel: DateLabel = isoDateLabel): string {
  let out = '';
  for (const run of runs) out += run.kind === 'text' ? run.text : !label ? MENTION_CHAR : run.kind === 'mention' ? label(run.target) : dateLabel(run);
  return out;
}

/** The plain text of stored markup. */
export function markupToPlain(markup: string, label?: (target: Ref) => string, dateLabel?: DateLabel): string {
  return richToPlain(parseRich(markup), label, dateLabel);
}

export function sliceRich(runs: readonly Run[], start: number, end: number = Number.POSITIVE_INFINITY): Run[] {
  const out: Run[] = [];
  let at = 0;
  for (const run of runs) {
    const length = runLength(run);
    const from = Math.max(start, at);
    const to = Math.min(end, at + length);
    if (from < to) {
      if (run.kind !== 'text') out.push(run);
      else out.push(text(run.text.slice(from - at, to - at), run.marks));
    }
    at += length;
    if (at >= end) break;
  }
  return normalizeRich(out);
}

export function concatRich(...parts: readonly (readonly Run[])[]): Run[] {
  return normalizeRich(parts.flat());
}

export function insertRich(runs: readonly Run[], at: number, inserted: readonly Run[]): Run[] {
  return concatRich(sliceRich(runs, 0, at), inserted, sliceRich(runs, at));
}

export function deleteRich(runs: readonly Run[], start: number, end: number): Run[] {
  return concatRich(sliceRich(runs, 0, start), sliceRich(runs, end));
}

function mapRange(runs: readonly Run[], start: number, end: number, map: (marks: Marks) => Marks): Run[] {
  const middle = sliceRich(runs, start, end).map(run => (run.kind === 'text' ? text(run.text, map(run.marks)) : run));
  return concatRich(sliceRich(runs, 0, start), middle, sliceRich(runs, end));
}

function withMark(marks: Marks, key: FlagMark | ValueMark, value: true | string | null): Marks {
  const next: Record<string, unknown> = { ...marks };
  if (value === null) delete next[key];
  else next[key] = value;
  return next as Marks;
}

/** Bold, italic, underline, strikethrough or code on (or off) for every character of the range. */
export function setFlag(runs: readonly Run[], start: number, end: number, key: FlagMark, on: boolean): Run[] {
  return mapRange(runs, start, end, marks => withMark(marks, key, on ? true : null));
}

/** A colour, a highlight or a link over the range; null takes it off. */
export function setValue(runs: readonly Run[], start: number, end: number, key: ValueMark, value: string | null): Run[] {
  return mapRange(runs, start, end, marks => withMark(marks, key, value));
}

/** Every character of the range wears the flag (mentions aside); false for an empty range. */
export function rangeHas(runs: readonly Run[], start: number, end: number, key: FlagMark): boolean {
  const inside = sliceRich(runs, start, end).filter((run): run is TextRun => run.kind === 'text');
  return inside.length > 0 && inside.every(run => run.marks[key] === true);
}

/** The value every character of the range shares for a colour, a highlight or a link, or null. */
export function rangeValue(runs: readonly Run[], start: number, end: number, key: ValueMark): string | null {
  const inside = sliceRich(runs, start, end).filter((run): run is TextRun => run.kind === 'text');
  const first = inside[0]?.marks[key] ?? null;
  return first !== null && inside.every(run => run.marks[key] === first) ? first : null;
}

/** The marks typing at `offset` continues: the character before's (after's at the start), a link's, code's and keys' excepted. */
export function marksAt(runs: readonly Run[], offset: number): Marks {
  const before = offset > 0 ? sliceRich(runs, offset - 1, offset)[0] : sliceRich(runs, 0, 1)[0];
  if (!before || before.kind !== 'text') return {};
  return withMark(withMark(withMark(before.marks, 'a', null), 'c', null), 'k', null);
}

export function isRichEmpty(markup: string): boolean {
  return markupToPlain(markup).trim() === '';
}

const INLINE: readonly { readonly pattern: RegExp; readonly mark: FlagMark }[] = [
  { pattern: /\*\*([^*\n]+)\*\*$/, mark: 'b' },
  { pattern: /(?:^|[^*])\*([^*\s][^*\n]*)\*$/, mark: 'i' },
  { pattern: /~~([^~\n]+)~~$/, mark: 's' },
  { pattern: /`([^`\n]+)`$/, mark: 'c' },
];

/**
 * Markdown typed inline, as it closes: `**gras**`, `*italique*`, `~~barré~~`, `` `code` `` just
 * before the caret, in text without marks, become the mark. Returns the runs and the new caret.
 */
export function inlineShortcut(runs: readonly Run[], caret: number): { readonly runs: Run[]; readonly caret: number } | null {
  const before = richToPlain(sliceRich(runs, 0, caret));
  for (const { pattern, mark } of INLINE) {
    const found = pattern.exec(before);
    if (!found) continue;
    const inner = found[1]!;
    const closing = mark === 'b' || mark === 's' ? 2 : 1;
    const end = caret;
    const start = end - inner.length - 2 * closing;
    if (start < 0 || before.slice(start, end).includes(MENTION_CHAR)) continue;
    // Only plain text turns into a mark: a link or code already there is left as it is.
    if (sliceRich(runs, start, end).some(run => run.kind !== 'text' || Object.keys(run.marks).length > 0)) continue;
    const marked = setFlag([text(inner)], 0, inner.length, mark, true);
    return { runs: concatRich(sliceRich(runs, 0, start), marked, sliceRich(runs, end)), caret: start + inner.length };
  }
  return null;
}

