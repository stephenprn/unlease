/**
 * A text note's body, plain or formatted. A formatted body (`note.rich`) is lines, each optionally
 * a heading (`# `, `## `, `### ` before it) and written as a page's rich text (`core/services/
 * richText`: `{b,i:words}`); a line that starts with `#` without being a heading starts with `\#`.
 * A plain body is the text as typed. Once formatted, a note stays formatted: its editor writes this
 * form from then on, even when no mark is left.
 *
 * Everything that is not the editor reads a body through here: `bodyText` for the words alone (a
 * search, a widget, a notification, the clipboard), `bodyMarkdown` for a backup, `cardParagraphs`
 * for a card's height. Offsets are in the plain text, a line break counting one.
 */
import type { AdvanceWeight } from '@unlease/design/advances';
import {
  concatRich,
  normalizeRich,
  parseRich,
  rangeHas,
  richFromPlain,
  richLength,
  richToPlain,
  serializeRich,
  setFlag,
  sliceRich,
  type FlagMark,
  type Marks,
  type Run,
} from '@unlease/core/services/richText';
import { mapCaret } from '@unlease/core/sync/textMerge';
import type { WeightedRun } from '@unlease/design/textWrap';

export type HeadingLevel = 0 | 1 | 2 | 3;

export const HEADING_LEVELS: readonly HeadingLevel[] = [1, 2, 3];

export interface NoteLine {
  /** 0 for a line of text, 1 to 3 for a heading. */
  readonly heading: HeadingLevel;
  readonly runs: readonly Run[];
}

/** The marks a note's words can wear. */
export const NOTE_FLAGS: readonly FlagMark[] = ['b', 'i', 'u'];

const HEADING = /^(#{1,3}) /;

export function plainLines(text: string): NoteLine[] {
  return text.split('\n').map(line => ({ heading: 0, runs: richFromPlain(line) }));
}

/** A body's lines: a formatted body's headings and marks, or plain text's lines as they are. */
export function noteLines(body: string, rich: boolean): NoteLine[] {
  if (!rich) return plainLines(body);
  return body.split('\n').map(raw => {
    const found = HEADING.exec(raw);
    return { heading: (found ? found[1]!.length : 0) as HeadingLevel, runs: parseRich(found ? raw.slice(found[0].length) : raw) };
  });
}

/** Lines as a formatted body. */
export function serializeLines(lines: readonly NoteLine[]): string {
  return lines
    .map(line => {
      const text = serializeRich(line.runs);
      if (line.heading > 0) return `${'#'.repeat(line.heading)} ${text}`;
      return text.startsWith('#') ? `\\${text}` : text;
    })
    .join('\n');
}

/** The words alone, a line break between lines. */
export function linesText(lines: readonly NoteLine[]): string {
  return lines.map(line => richToPlain(line.runs)).join('\n');
}

/** A note's words without their formatting: what a search, a widget, a notification or the clipboard reads. */
export function bodyText(note: { readonly body: string; readonly rich: boolean }): string {
  return note.rich ? linesText(noteLines(note.body, true)) : note.body;
}

/** Plain text written into a note in its own form (a checklist turned back into text, a share). */
export function bodyFromText(text: string, rich: boolean): string {
  return rich ? serializeLines(plainLines(text)) : text;
}

/** The first `length` characters of the lines (a line break counting one), marks and headings kept. */
function cutLines(lines: readonly NoteLine[], length: number): NoteLine[] {
  const out: NoteLine[] = [];
  let at = 0;
  for (const line of lines) {
    if (at > length || (at === length && out.length > 0)) break;
    out.push({ ...line, runs: sliceRich(line.runs, 0, length - at) });
    at += richLength(line.runs) + 1;
  }
  return out;
}

/** Lines whose formatted form holds in `limit` characters: what does not fit is cut at the end, never inside a mark. */
export function fitLines(lines: readonly NoteLine[], limit: number): NoteLine[] {
  if (serializeLines(lines).length <= limit) return [...lines];
  let low = 0;
  let high = linesText(lines).length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (serializeLines(cutLines(lines, middle)).length <= limit) low = middle;
    else high = middle - 1;
  }
  return cutLines(lines, low);
}

/**
 * The marks and headings of `from` laid on the same words in `to` (the same text with an edit from
 * elsewhere merged in): each mark's ends follow its words through the word-level diff, so words
 * added beside a mark stay out of it.
 */
export function carryMarks(from: readonly NoteLine[], to: readonly NoteLine[]): NoteLine[] {
  const before = linesText(from);
  const after = linesText(to);
  const starts = lineStarts(from);
  let lines = [...to];
  from.forEach((line, index) => {
    const start = starts[index]!;
    if (line.heading > 0) {
      const at = mapCaret(before, after, start);
      lines = setHeading(lines, at, at, line.heading);
    }
    let offset = start;
    for (const run of line.runs) {
      const length = run.kind === 'text' ? run.text.length : 1;
      if (run.kind === 'text') for (const flag of NOTE_FLAGS) if (run.marks[flag]) lines = setNoteFlag(lines, mapCaret(before, after, offset), mapCaret(before, after, offset + length), flag, true);
      offset += length;
    }
  });
  return lines;
}

/** Whether a line wears anything: a heading or a mark. */
export function isFormatted(lines: readonly NoteLine[]): boolean {
  return lines.some(line => line.heading > 0 || line.runs.some(run => run.kind !== 'text' || Object.keys(run.marks).length > 0));
}

// ── editing by offsets ─────────────────────────────────────────────────────

const lineLength = (line: NoteLine): number => richLength(line.runs);

/** Each line's first offset in the plain text. */
export function lineStarts(lines: readonly NoteLine[]): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const line of lines) {
    starts.push(at);
    at += lineLength(line) + 1;
  }
  return starts;
}

/** The lines a range touches, as indexes: those it covers a character of (or, empty, starts on), or the caret's own. */
export function linesIn(lines: readonly NoteLine[], start: number, end: number): number[] {
  const starts = lineStarts(lines);
  const out: number[] = [];
  lines.forEach((line, index) => {
    const from = starts[index]!;
    const to = from + lineLength(line);
    const touches = start === end ? from <= start && start <= to : from === to ? start <= from && end > from : start < to && end > from;
    if (touches) out.push(index);
  });
  return out.length > 0 ? out.slice(0, start === end ? 1 : out.length) : [Math.max(0, lines.length - 1)];
}

/** The line holding an offset. */
function lineOf(starts: readonly number[], offset: number): number {
  let index = 0;
  while (index + 1 < starts.length && starts[index + 1]! <= offset) index += 1;
  return index;
}

/** Every line the range touches made a heading of `level` (0: back to text). */
export function setHeading(lines: readonly NoteLine[], start: number, end: number, level: HeadingLevel): NoteLine[] {
  const touched = new Set(linesIn(lines, start, end));
  return lines.map((line, index) => (touched.has(index) ? { ...line, heading: level } : line));
}

/** The heading every line of the range is, or null when they differ. */
export function headingIn(lines: readonly NoteLine[], start: number, end: number): HeadingLevel | null {
  const levels = new Set(linesIn(lines, start, end).map(index => lines[index]!.heading));
  return levels.size === 1 ? [...levels][0]! : null;
}

/** Applies `change` to the part of each line the range covers. */
function mapRange(lines: readonly NoteLine[], start: number, end: number, change: (runs: readonly Run[], from: number, to: number) => Run[]): NoteLine[] {
  const starts = lineStarts(lines);
  return lines.map((line, index) => {
    const from = Math.max(0, start - starts[index]!);
    const to = Math.min(lineLength(line), end - starts[index]!);
    return from < to ? { ...line, runs: change(line.runs, from, to) } : line;
  });
}

/** A mark on (or off) for every character of the range, across lines. */
export function setNoteFlag(lines: readonly NoteLine[], start: number, end: number, flag: FlagMark, on: boolean): NoteLine[] {
  return mapRange(lines, start, end, (runs, from, to) => setFlag(runs, from, to, flag, on));
}

/** Every character of the range wears the mark (line breaks aside); false for an empty range. */
export function noteRangeHas(lines: readonly NoteLine[], start: number, end: number, flag: FlagMark): boolean {
  if (start >= end) return false;
  const starts = lineStarts(lines);
  let any = false;
  for (let index = 0; index < lines.length; index += 1) {
    const from = Math.max(0, start - starts[index]!);
    const to = Math.min(lineLength(lines[index]!), end - starts[index]!);
    if (from >= to) continue;
    any = true;
    if (!rangeHas(lines[index]!.runs, from, to, flag)) return false;
  }
  return any;
}

/** The range's marks and headings taken off. */
export function clearFormat(lines: readonly NoteLine[], start: number, end: number): NoteLine[] {
  const touched = new Set(linesIn(lines, start, end));
  const unmarked = mapRange(lines, start, end, (runs, from, to) => concatRich(sliceRich(runs, 0, from), richFromPlain(richToPlain(sliceRich(runs, from, to))), sliceRich(runs, to)));
  return unmarked.map((line, index) => (touched.has(index) ? { ...line, heading: 0 } : line));
}

/** The marks typing at `offset` continues: the character before's, on its line. */
export function noteMarksAt(lines: readonly NoteLine[], offset: number): Marks {
  const starts = lineStarts(lines);
  const index = lineOf(starts, offset);
  const line = lines[index];
  if (!line) return {};
  const at = offset - starts[index]!;
  const before = at > 0 ? sliceRich(line.runs, at - 1, at)[0] : sliceRich(line.runs, 0, 1)[0];
  return before?.kind === 'text' ? before.marks : {};
}

/**
 * Markdown typed at the start of a line, as its space closes it: `# `, `## `, `### ` make the line a
 * heading. Returns the lines and where the caret goes, or null.
 */
export function headingShortcut(lines: readonly NoteLine[], caret: number): { readonly lines: NoteLine[]; readonly caret: number } | null {
  const starts = lineStarts(lines);
  const index = lineOf(starts, caret);
  const line = lines[index];
  if (!line || line.heading > 0) return null;
  const at = caret - starts[index]!;
  const head = richToPlain(sliceRich(line.runs, 0, at));
  const found = /^(#{1,3}) $/.exec(head);
  if (!found) return null;
  const next = lines.map((each, i) => (i === index ? { heading: found[1]!.length as HeadingLevel, runs: sliceRich(each.runs, at) } : each));
  return { lines: next, caret: starts[index]! };
}

// ── elsewhere ──────────────────────────────────────────────────────────────

/** A formatted body as Markdown: headings, **bold**, *italic*, <u>underline</u>. */
export function bodyMarkdown(note: { readonly body: string; readonly rich: boolean }): string {
  if (!note.rich) return note.body;
  return noteLines(note.body, true)
    .map(line => {
      let text = '';
      for (const run of line.runs) {
        if (run.kind !== 'text') continue;
        let piece = run.text;
        if (!piece.trim()) {
          text += piece;
          continue;
        }
        if (run.marks.u) piece = `<u>${piece}</u>`;
        if (run.marks.i) piece = `*${piece}*`;
        if (run.marks.b && line.heading === 0) piece = `**${piece}**`;
        text += piece;
      }
      return line.heading > 0 ? `${'#'.repeat(line.heading)} ${text}` : text;
    })
    .join('\n');
}

/** What a card shows of a formatted body, as `cardBody` cuts a plain one: blank lines at its end dropped. */
export function cardLines(lines: readonly NoteLine[]): NoteLine[] {
  const out: NoteLine[] = [];
  let length = 0;
  for (const line of lines) {
    if (length > 1200) break;
    out.push(line);
    length += lineLength(line) + 1;
  }
  while (out.length > 0 && !richToPlain(out[out.length - 1]!.runs).trim()) out.pop();
  return out.map(line => ({ ...line, runs: normalizeRich(line.runs) }));
}

/** A card's paragraphs in their weights: a heading is a bold line at the card's size, bold words bold. */
export function cardParagraphs(lines: readonly NoteLine[]): WeightedRun[][] {
  return lines.map(line =>
    line.runs.map(run => {
      const weight: AdvanceWeight = line.heading > 0 || (run.kind === 'text' && run.marks.b) ? 'bold' : 'regular';
      return { text: run.kind === 'text' ? run.text : '￼', weight };
    }),
  );
}

const shown = new WeakMap<object, NoteLine[]>();

/** What a formatted note's card shows (`cardLines`), read once per version of the note; null for a plain body. */
export function noteCardLines(note: { readonly kind: string; readonly body: string; readonly rich: boolean }): NoteLine[] | null {
  if (note.kind !== 'text' || !note.rich) return null;
  let lines = shown.get(note);
  if (!lines) {
    lines = cardLines(noteLines(note.body, true));
    shown.set(note, lines);
  }
  return lines;
}

const weighted = new WeakMap<object, WeightedRun[][]>();

/** A formatted note's card paragraphs in their weights (`cardParagraphs` of `noteCardLines`), read once per version of the note; null for a plain body. */
export function noteCardParagraphs(note: { readonly kind: string; readonly body: string; readonly rich: boolean }): WeightedRun[][] | null {
  const lines = noteCardLines(note);
  if (!lines) return null;
  let paragraphs = weighted.get(lines);
  if (!paragraphs) {
    paragraphs = cardParagraphs(lines);
    weighted.set(lines, paragraphs);
  }
  return paragraphs;
}
