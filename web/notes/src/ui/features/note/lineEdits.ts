/**
 * A note's lines edited by plain-text offsets (a line break counting one, as `notes/services/noteBody`
 * counts them): what is typed or pasted over a selection, Enter, Backspace at a line's start, Delete
 * at its end. Headings follow the pages' rules: Enter at the end of a heading starts a line of text,
 * in its middle the rest goes on as text, at its start a line of text opens above it; Backspace at
 * the start of a heading makes it text before anything is joined.
 */
import { plainLines, type HeadingLevel, type NoteLine } from '@unlease/notes/services/noteBody';
import { concatRich, inlineShortcut, richLength, sliceRich, type Marks, type Run } from '@unlease/core/services/richText';

export interface LinesEdit {
  readonly lines: NoteLine[];
  /** Where the caret goes. */
  readonly caret: number;
}

const lengthOf = (line: NoteLine): number => richLength(line.runs);

/** The text's whole length, line breaks included. */
export function linesLength(lines: readonly NoteLine[]): number {
  let length = Math.max(0, lines.length - 1);
  for (const line of lines) length += lengthOf(line);
  return length;
}

/** The line an offset falls on, and where on it. */
export function spotOf(lines: readonly NoteLine[], offset: number): { readonly line: number; readonly at: number } {
  let start = 0;
  for (let line = 0; line < lines.length; line += 1) {
    const length = lengthOf(lines[line]!);
    if (offset <= start + length || line === lines.length - 1) return { line, at: Math.max(0, Math.min(length, offset - start)) };
    start += length + 1;
  }
  return { line: 0, at: 0 };
}

/** Plain text as lines of text (a paste, a drop). */
export function textLines(text: string): NoteLine[] {
  return plainLines(text.replace(/\r\n?/g, '\n'));
}

/** The first `length` characters of lines (a paste cut to what the note can hold). */
export function cutLines(lines: readonly NoteLine[], length: number): NoteLine[] {
  const out: NoteLine[] = [];
  let left = length;
  for (const line of lines) {
    if (left < 0) break;
    out.push({ heading: line.heading, runs: sliceRich(line.runs, 0, left) });
    left -= lengthOf(line) + 1;
  }
  return out.length > 0 ? out : [{ heading: 0, runs: [] }];
}

/**
 * The range replaced by `inserted` (lines; none deletes it). A range from a line's start to a later
 * line's start (a triple click) keeps that last line break: the line is emptied, never joined to the
 * next. The whole text deleted starts again as text.
 */
export function replaceRange(lines: readonly NoteLine[], start: number, end: number, inserted: readonly NoteLine[] = []): LinesEdit {
  const total = linesLength(lines);
  const from = spotOf(lines, Math.min(start, end));
  let to = spotOf(lines, Math.max(start, end));
  if (from.at === 0 && to.at === 0 && to.line > from.line) to = { line: to.line - 1, at: lengthOf(lines[to.line - 1]!) };
  const head = sliceRich(lines[from.line]!.runs, 0, from.at);
  const tail = sliceRich(lines[to.line]!.runs, to.at);
  const first = inserted[0];
  let heading: HeadingLevel = inserted.length === 0 && Math.min(start, end) === 0 && Math.max(start, end) >= total ? 0 : lines[from.line]!.heading;
  // A heading pasted at a line's start stays one.
  if (from.at === 0 && first && first.heading > 0) heading = first.heading;
  const made: NoteLine[] = [];
  if (inserted.length <= 1) {
    made.push({ heading, runs: concatRich(head, first?.runs ?? [], tail) });
  } else {
    made.push({ heading, runs: concatRich(head, first!.runs) });
    for (const line of inserted.slice(1, -1)) made.push({ heading: line.heading, runs: [...line.runs] });
    const last = inserted[inserted.length - 1]!;
    made.push({ heading: last.heading, runs: concatRich(last.runs, tail) });
  }
  const caret = Math.min(start, end) + (inserted.length === 0 ? 0 : linesLength(inserted));
  return { lines: [...lines.slice(0, from.line), ...made, ...lines.slice(to.line + 1)], caret };
}

/** Text typed over a range (or at the caret) in the given marks. */
export function insertText(lines: readonly NoteLine[], start: number, end: number, text: string, marks: Marks): LinesEdit {
  const run: Run = { kind: 'text', text, marks };
  return replaceRange(lines, start, end, [{ heading: 0, runs: [run] }]);
}

/** Enter: the line splits at the caret (what is selected goes first). */
export function splitLine(lines: readonly NoteLine[], start: number, end: number): LinesEdit {
  const cleared = replaceRange(lines, start, end);
  const { line, at } = spotOf(cleared.lines, cleared.caret);
  const current = cleared.lines[line]!;
  const next = cleared.lines.slice();
  if (at === 0 && lengthOf(current) > 0) {
    // At a line's start, a line of text opens above it: a heading keeps its words.
    next.splice(line, 0, { heading: 0, runs: [] });
  } else {
    next.splice(line, 1, { heading: current.heading, runs: sliceRich(current.runs, 0, at) }, { heading: 0, runs: sliceRich(current.runs, at) });
  }
  return { lines: next, caret: cleared.caret + 1 };
}

/** Backspace at a line's start: a heading turns to text first, a line of text joins the one above. Null away from a line's start. */
export function deleteBackward(lines: readonly NoteLine[], caret: number): LinesEdit | null {
  const { line, at } = spotOf(lines, caret);
  if (at > 0) return null;
  const current = lines[line]!;
  if (current.heading > 0) return { lines: lines.map((each, index) => (index === line ? { ...each, heading: 0 } : each)), caret };
  if (line === 0) return { lines: [...lines], caret };
  const above = lines[line - 1]!;
  // Joined to an empty line above, the line keeps its own kind.
  const joined: NoteLine = { heading: lengthOf(above) === 0 ? current.heading : above.heading, runs: concatRich(above.runs, current.runs) };
  return { lines: [...lines.slice(0, line - 1), joined, ...lines.slice(line + 1)], caret: caret - 1 };
}

/** Delete at a line's end: the line below joins it. Null away from a line's end. */
export function deleteForward(lines: readonly NoteLine[], caret: number): LinesEdit | null {
  const { line, at } = spotOf(lines, caret);
  const current = lines[line]!;
  if (at < lengthOf(current)) return null;
  if (line === lines.length - 1) return { lines: [...lines], caret };
  const below = lines[line + 1]!;
  const joined: NoteLine = { heading: lengthOf(current) === 0 ? below.heading : current.heading, runs: concatRich(current.runs, below.runs) };
  return { lines: [...lines.slice(0, line), joined, ...lines.slice(line + 2)], caret };
}

/** The marks of a range's first character (typing over a selection keeps them), or of the one before the caret. */
export function marksAtStart(lines: readonly NoteLine[], start: number, end: number): Marks {
  const { line, at } = spotOf(lines, start);
  const runs = lines[line]!.runs;
  const inside = end > start && at < richLength(runs) ? sliceRich(runs, at, at + 1)[0] : at > 0 ? sliceRich(runs, at - 1, at)[0] : sliceRich(runs, 0, 1)[0];
  return inside?.kind === 'text' ? inside.marks : {};
}

/** The marks a note's words may wear: bold, italic, underline. */
const NOTE_MARKS = new Set(['b', 'i', 'u']);

/** `**gras**` or `*italique*` closed at the caret, on its line; null when nothing was closed. */
export function inlineMarkdown(lines: readonly NoteLine[], caret: number): LinesEdit | null {
  const { line, at } = spotOf(lines, caret);
  const found = inlineShortcut(lines[line]!.runs, at);
  if (!found || found.runs.some(run => run.kind === 'text' && Object.keys(run.marks).some(mark => !NOTE_MARKS.has(mark)))) return null;
  return { lines: lines.map((each, index) => (index === line ? { ...each, runs: found.runs } : each)), caret: caret - at + found.caret };
}
