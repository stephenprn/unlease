/**
 * Drawings as the web shows and edits them: a drawing's text read once, each stroke's path drawn
 * once, the editor's sheet with room under what is drawn, what an eraser's sweep touches, and the
 * text a change leaves (`notes/services/drawing` does the reading and writing).
 */
import { DRAWING_MIN_HEIGHT, STROKE_WIDTHS, drawingInkName, type DrawingInk, type DrawingSize, type DrawingTool, type Stroke } from '@unlease/notes/models/drawing';
import { parseDrawing, serializeStrokes, strokeLine, strokePath, strokesAlong, strokeWidth } from '@unlease/notes/services/drawing';

const NO_STROKES: readonly Stroke[] = [];
const NO_IDS: ReadonlySet<string> = new Set();

/** The drawings last read, by their text (the least recent first): a card drawn again, or a drawing just saved, is not read twice. */
const read = new Map<string, readonly Stroke[]>();
/** How much text the drawings kept may hold together: many small ones, or a few at the limit. */
const READ_KEPT_CHARS = 2_000_000;
let readChars = 0;

/** Strokes in the order they lie, each id once (a later line wins, as a merge keeps it). */
export function strokesOf(data: string): readonly Stroke[] {
  if (!data) return NO_STROKES;
  const known = read.get(data);
  if (known) {
    read.delete(data);
    read.set(data, known);
    return known;
  }
  const parsed = parseDrawing(data);
  const strokes = parsed.filter((stroke, index) => parsed[index + 1]?.id !== stroke.id);
  rememberStrokes(data, strokes);
  return strokes;
}

/** What a text holds, known already (the editor built it): the next read of that text takes it as it is. */
export function rememberStrokes(data: string, strokes: readonly Stroke[]): void {
  if (!data || read.has(data)) return;
  read.set(data, strokes);
  readChars += data.length;
  for (const oldest of read.keys()) {
    if (readChars <= READ_KEPT_CHARS || read.size === 1) break;
    readChars -= oldest.length;
    read.delete(oldest);
  }
}

const paths = new WeakMap<Stroke, string>();

/** A stroke's SVG path, drawn once per stroke. */
export function pathOf(stroke: Stroke): string {
  let d = paths.get(stroke);
  if (d === undefined) {
    d = strokePath(stroke.points);
    paths.set(stroke, d);
  }
  return d;
}

/** An ink's name in the interface's language. */
export function inkName(ink: DrawingInk): string {
  return drawingInkName(ink);
}

/** A size's dot in the tools (px): the tool's width, eased so its three sizes tell apart and the thickest fits its button. */
export function sizeDot(tool: DrawingTool, size: DrawingSize): number {
  return Math.min(22, Math.max(4, Math.round(Math.sqrt(STROKE_WIDTHS[tool][size]) * 3.3)));
}

// ── the editor's sheet ─────────────────────────────────────────────────────

/** How far under the lowest stroke the editor's sheet goes on, so there is room to keep drawing (drawing units). */
export const SHEET_ROOM = 250;
const SHEET_STEP = 50;

/** The lowest any stroke reaches, its own width included (0 with nothing drawn). */
export function lowestPoint(strokes: readonly Stroke[]): number {
  let lowest = 0;
  for (const stroke of strokes) {
    const half = strokeWidth(stroke) / 2;
    for (let at = 1; at < stroke.points.length; at += 2) lowest = Math.max(lowest, stroke.points[at]! + half);
  }
  return lowest;
}

/** The editor's sheet in drawing units: a new sheet at least, and always room under what is drawn, grown by steps. */
export function sheetHeight(lowest: number): number {
  return Math.max(DRAWING_MIN_HEIGHT, Math.ceil((lowest + SHEET_ROOM) / SHEET_STEP) * SHEET_STEP);
}

// ── the eraser ─────────────────────────────────────────────────────────────


/** What the eraser touches along its way (core's sweep, each stroke's box read once). */
export { strokesAlong };

// ── changes ────────────────────────────────────────────────────────────────

const byId = (a: Stroke, b: Stroke): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The strokes with `add` laid in and `remove` taken out, in the order they lie, each id once. */
export function changeStrokes(strokes: readonly Stroke[], add: readonly Stroke[], remove: ReadonlySet<string> = NO_IDS): readonly Stroke[] {
  const kept = remove.size > 0 ? strokes.filter(stroke => !remove.has(stroke.id)) : strokes;
  const present = new Set(kept.map(stroke => stroke.id));
  const fresh = add.filter(stroke => !present.has(stroke.id) && !remove.has(stroke.id));
  return fresh.length === 0 ? kept : [...kept, ...fresh].sort(byId);
}

/** The drawing's text with one more stroke (`strokes`: what `data` holds). Drawn last, it is one more line at the end; otherwise all is written again in order. */
export function textWithStroke(data: string, strokes: readonly Stroke[], stroke: Stroke): string {
  const last = strokes[strokes.length - 1];
  if (last && last.id >= stroke.id) return serializeStrokes([...strokes, stroke]);
  const line = strokeLine(stroke);
  return !data ? line : data.endsWith('\n') ? data + line : `${data}\n${line}`;
}

/** One gesture of an editing session, to take back or do again: the strokes it drew and those it erased. */
export interface DrawingStep {
  readonly added: readonly Stroke[];
  readonly removed: readonly Stroke[];
}

/** The ids of some strokes. */
export function idsOf(strokes: readonly Stroke[]): ReadonlySet<string> {
  return new Set(strokes.map(stroke => stroke.id));
}
