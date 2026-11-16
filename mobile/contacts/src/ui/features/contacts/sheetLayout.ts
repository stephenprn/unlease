/**
 * The contact list in numbers: one sheet of paper for everyone, each letter's people under a band
 * across the sheet (the letter small, on the faces' column), the band held at the list's top while
 * its people go under it and pushed away by the next letter's. The list is virtualised and nothing
 * in it is measured: every row has a fixed height, so where each letter's band and people start and
 * end is known before anything is drawn. The list jumps there (`getItemLayout`, the rail), the paper
 * behind the rows is drawn from the sheet's length, and the bands are pinned from the scroll on the
 * UI thread (`pinnedAt`).
 *
 * Down the list: the sheet's top, 4 of it, then a letter's band (32) over its first row; rows 60
 * apart (a 56 row and the rows' gap); the next letter's band right after the last row of the one
 * before; the last row 6 from the sheet's foot. Across: the sheet 12 from the screen's left and
 * clear of the rail at its right; a row 6 in, its face 10 in from there; a band's letter on the faces.
 */
import { GEOMETRY } from '@unlease/design/palette';
import { concentric, RADII } from '@unlease/design/shapes';

/** A row's pitch: its slot (the press and the slide) and the rows' gap, half above it and half under. */
export const ROW_HEIGHT = 60;
export const ROW_SLOT = ROW_HEIGHT - GEOMETRY.rowGap;
const HALF_GAP = GEOMETRY.rowGap / 2;

/** Rows lie 6 in from the sheet's edges, as a panel's rows do (`ROW_INSET`), from its top and foot too. */
export const SHEET_INSET = 6;
/** What the sheet's first and last rows add, at its top and at its foot: the inset, less the rows' half gap. */
export const SHEET_PAD = SHEET_INSET - HALF_GAP;
/** The rows' corners where they meet the sheet's: concentric with it. */
export const SHEET_ROW_CORNER = concentric(RADII.panel, SHEET_INSET);
/** A letter's band, over its first row: the letter in label strong, centred in it. */
export const BAND = 32;

/** The letters' strip against the screen's right edge: the sheet stops short of it. */
export const RAIL_WIDTH = 28;
/** The sheet's edge from the screen's left (as the event form's panels and the settings groups). */
export const SHEET_EDGE = 12;
/** Its right edge from the screen's: clear of the rail by the rows' gap, or as its left without one. */
export const sheetRight = (railed: boolean): number => (railed ? RAIL_WIDTH + GEOMETRY.rowGap : SHEET_EDGE);
/** A row's face from its start, a list row's (`ListRow`). */
export const FACE_IN = 10;
/** The faces' column from the screen's left: the sheet's edge, the row's inset, the face's: where a band's letter stands. */
export const FACES_AT = SHEET_EDGE + SHEET_INSET + FACE_IN;

/** Where a pinned band stands in the list's frame: right under the head's line (1). */
export const PIN = 1;

/** One contact and the letter it is filed under; null while searching (one sheet, no letters). */
export interface SheetEntry {
  readonly id: string;
  readonly letter: string | null;
}

/** A row of the sheet: whether its letter's band lies over it, and what it adds above or under it. */
export interface SheetRow {
  readonly id: string;
  /** The letter its people start with, on its first row only: its band lies over it (announced as a heading there). */
  readonly heading: string | null;
  /** The sheet's first row: the sheet's top lies above it. */
  readonly top: boolean;
  /** The sheet's last row: the sheet's foot lies under it. */
  readonly foot: boolean;
}

/** A letter on the sheet, from the sheet's top: its band's top (`top`) to its last person's foot (`end`), where the next band starts. */
export interface LetterSpan {
  readonly letter: string;
  /** Its first row's index in the list. */
  readonly row: number;
  readonly top: number;
  readonly end: number;
}

export interface SheetLayout {
  readonly rows: readonly SheetRow[];
  /** Each row's offset from the sheet's top, and its length. */
  readonly offsets: readonly number[];
  readonly lengths: readonly number[];
  readonly letters: readonly LetterSpan[];
  /** The sheet's whole length; 0 without anyone on it. */
  readonly length: number;
}

/** A row's length on the sheet. */
export function rowLength(row: Pick<SheetRow, 'top' | 'foot' | 'heading'>): number {
  return ROW_HEIGHT + (row.top ? SHEET_PAD : 0) + (row.foot ? SHEET_PAD : 0) + (row.heading !== null ? BAND : 0);
}

/** The sheet for these contacts, in the list's order: its rows, their offsets, and each letter's span. */
export function layOutSheet(entries: readonly SheetEntry[]): SheetLayout {
  const rows: SheetRow[] = [];
  const offsets: number[] = [];
  const lengths: number[] = [];
  const letters: LetterSpan[] = [];
  let offset = 0;
  entries.forEach((entry, index) => {
    const before = index > 0 ? entries[index - 1]! : null;
    const heads = entry.letter !== null && (before === null || before.letter !== entry.letter);
    const row: SheetRow = { id: entry.id, heading: heads ? entry.letter : null, top: index === 0, foot: index === entries.length - 1 };
    const length = rowLength(row);
    rows.push(row);
    offsets.push(offset);
    lengths.push(length);
    if (row.heading !== null) letters.push({ letter: row.heading, row: index, top: offset + (row.top ? SHEET_PAD : 0), end: 0 });
    offset += length;
    // A letter's people end at the next letter's first row, or the sheet's foot.
    const next = entries[index + 1];
    const open = letters[letters.length - 1];
    if (open && entry.letter !== null && (next === undefined || next.letter !== entry.letter)) {
      letters[letters.length - 1] = { ...open, end: offset - (row.foot ? SHEET_PAD : 0) };
    }
  });
  return { rows, offsets, lengths, letters, length: offset };
}

/** Where the list goes to land a letter at its top: its band right under the head's line, its people under the band. */
export function landing(span: LetterSpan): number {
  return span.top - PIN;
}

/**
 * The letter whose people are under the list's top, as an index into `tops` (each letter's `top`),
 * or -1 above the first: `y` is how far the list has gone past the sheet's top.
 */
export function letterAt(tops: readonly number[], y: number): number {
  'worklet';
  let at = -1;
  for (let i = 0; i < tops.length; i += 1) {
    if (tops[i]! - y <= PIN + 0.5) at = i;
    else break;
  }
  return at;
}

/**
 * Where a letter's band stands in the list's frame, `y` past the sheet's top: over its first row,
 * then held at the top while its people go under it, then pushed up by the next letter's band as it
 * comes.
 */
export function pinnedAt(top: number, end: number, y: number): number {
  'worklet';
  return Math.min(Math.max(top - y, PIN), end - y - BAND);
}

/** How far a drawn piece of paper stands past what it shows, above and below: its made-up ends (and their lift) stay out of sight. */
export const PAPER_MARGIN = 32;

/**
 * Where the paper behind the rows is drawn in the list's frame, and how tall, for a sheet `length`
 * long whose top stands at `top` in a frame `frame` tall: the whole sheet while it fits in the frame
 * and the margins, else a frame's worth that follows the sheet's top or foot when either is in view and
 * stands still between them. It never changes height as the list scrolls, only place.
 */
export function paperAt(top: number, length: number, frame: number): { readonly y: number; readonly height: number } {
  'worklet';
  const span = frame + 2 * PAPER_MARGIN;
  if (length <= span) return { y: top, height: length };
  if (top > -PAPER_MARGIN) return { y: top, height: span };
  const foot = top + length;
  if (foot < frame + PAPER_MARGIN) return { y: foot - span, height: span };
  return { y: -PAPER_MARGIN, height: span };
}
