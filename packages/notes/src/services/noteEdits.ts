/**
 * A text note's lines (`notes/services/noteBody`) edited as the plain text a native field shows: a
 * range of it replaced by what was typed, pasted or corrected (`displayEdit` reads it from the
 * field). What is inserted wears the marks typing continues; a line break typed or pasted splits a
 * line, one taken away joins two. Headings follow a page's own (`splitBlock`, `backspaceAtStart`): a
 * line split in a heading keeps it before the break and goes on as text after it, unless the split
 * is at the heading's start, when the heading moves down with its words; two lines joined keep the
 * first one's heading, unless nothing of the first is left, when the second keeps its own; and a
 * Backspace at a heading's start turns it back into text before it joins anything.
 */
import { lineStarts, linesText, noteMarksAt, type HeadingLevel, type NoteLine } from './noteBody';
import { concatRich, MENTION_CHAR, richLength, sliceRich, type Marks, type Run } from '@unlease/core/services/richText';

/** A range of the plain text (lines joined by one line break each) and what took its place. */
export interface NoteEdit {
  readonly start: number;
  readonly end: number;
  readonly inserted: string;
}

export interface EditedLines {
  readonly lines: NoteLine[];
  /** Where the caret goes: right after what was inserted. */
  readonly caret: number;
}

const EMPTY: NoteLine = { heading: 0, runs: [] };

/** The line holding a plain-text offset (a line's end is its own, the break after it the next line's start). */
function lineAt(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (starts[middle]! <= offset) low = middle;
    else high = middle - 1;
  }
  return low;
}

/**
 * The edit applied to the lines. What is inserted wears `marks`, or else those typing continues: the
 * character before's on its line when nothing was replaced, the first replaced character's when
 * words were typed over. Lines the edit does not touch are kept as they were (the same objects).
 */
export function applyNoteEdit(lines: readonly NoteLine[], edit: NoteEdit, marks?: Marks): EditedLines {
  const source = lines.length > 0 ? lines : [EMPTY];
  const starts = lineStarts(source);
  const total = starts[starts.length - 1]! + richLength(source[source.length - 1]!.runs);
  const start = Math.max(0, Math.min(edit.start, edit.end, total));
  const end = Math.max(start, Math.min(Math.max(edit.start, edit.end), total));
  // A mention's or a date's place holder has no meaning in a note: it is dropped, as the runs drop it.
  const inserted = edit.inserted.split(MENTION_CHAR).join('');
  const first = lineAt(starts, start);
  const last = lineAt(starts, end);
  const head = sliceRich(source[first]!.runs, 0, start - starts[first]!);
  const tail = sliceRich(source[last]!.runs, end - starts[last]!);
  const wear = marks ?? (start < end ? noteMarksAt(source, start + 1) : noteMarksAt(source, start));
  const words = (text: string): Run[] => (text ? [{ kind: 'text', text, marks: wear }] : []);
  const pieces = inserted.split('\n');

  let made: NoteLine[];
  if (pieces.length === 1) {
    const kept = concatRich(head, words(pieces[0]!));
    const heading: HeadingLevel = richLength(kept) > 0 ? source[first]!.heading : source[last]!.heading;
    made = [{ heading, runs: concatRich(kept, tail) }];
  } else {
    const opening = concatRich(head, words(pieces[0]!));
    const closing = concatRich(words(pieces[pieces.length - 1]!), tail);
    // The heading stays before the break, and what follows is text; split at its start, it moves down with its words.
    const movesDown = richLength(opening) === 0 && richLength(closing) > 0;
    const openingHeading: HeadingLevel = movesDown ? 0 : source[first]!.heading;
    const closingHeading: HeadingLevel = movesDown ? source[last]!.heading : 0;
    made = [
      { heading: openingHeading, runs: opening },
      ...pieces.slice(1, -1).map((piece): NoteLine => ({ heading: 0, runs: words(piece) })),
      { heading: closingHeading, runs: closing },
    ];
  }
  return { lines: [...source.slice(0, first), ...made, ...source.slice(last + 1)], caret: start + inserted.length };
}

/**
 * Backspace at a heading's start, the caret there and the edit taking away the line break before it
 * (or, on the first line, nothing at all): the line turns back into text, its break and the caret
 * kept, as a page's heading does; a second Backspace joins it. Null for any other edit.
 */
export function backspaceHeading(lines: readonly NoteLine[], edit: NoteEdit | null, caret: { readonly start: number; readonly end: number }): NoteLine[] | null {
  if (caret.start !== caret.end) return null;
  if (edit ? edit.inserted !== '' || edit.end !== caret.start || edit.start !== caret.start - 1 : caret.start !== 0) return null;
  const index = lineStarts(lines).indexOf(caret.start);
  if (index < 0 || (edit !== null && index === 0) || lines[index]!.heading === 0) return null;
  return lines.map((line, at) => (at === index ? { ...line, heading: 0 } : line));
}

/** What changed between two texts, as one edit: the part between their longest common start and end. */
export function textChange(before: string, after: string): NoteEdit {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;
  return { start: prefix, end: before.length - suffix, inserted: after.slice(prefix, after.length - suffix) };
}

/** Where an offset of the text before an edit lies after it: moved by what changed before it, kept at a replaced range's start. */
export function offsetAfter(offset: number, edit: NoteEdit): number {
  if (offset <= edit.start) return offset;
  if (offset >= edit.end) return offset + edit.inserted.length - (edit.end - edit.start);
  return edit.start;
}

/** The lines made to read `text`: what differs taken as one edit, the marks and headings of the rest kept. */
export function respell(lines: readonly NoteLine[], text: string): NoteLine[] {
  const before = linesText(lines);
  if (before === text) return [...lines];
  return applyNoteEdit(lines, textChange(before, text)).lines;
}
