/**
 * The drawing editor's plain parts, shared by a note's sheet, a page's drawing screen and the
 * previews: inks in the theme's colours, each stroke's path made once, the sheet's height and the
 * bands it is drawn in, the eraser's sweep, a session's steps back and forth, and the pens the
 * phone remembers between drawings.
 */
import { LINE_COLORS } from '@unlease/design/colors';
import { DRAWING_MIN_HEIGHT, HIGHLIGHTER_OPACITY, STROKE_WIDTHS, type DrawingInk, type DrawingSize, type DrawingTool, type Stroke } from '@unlease/notes/models/drawing';
import { parseDrawing, serializeStrokes, strokeLine, strokePath, strokesAlong, strokeWidth, withStroke } from '@unlease/notes/services/drawing';

import type { Theme } from '../../theme/theme';

const NO_STROKES: readonly Stroke[] = [];

// ── inks and paths ─────────────────────────────────────────────────────────

export type InkPalette = Readonly<Record<DrawingInk, string>>;

const palettes = new WeakMap<Theme, InkPalette>();

/** Each ink in this theme: the writing ink (light at night), a pigment's fill. */
export function inkPalette(theme: Theme): InkPalette {
  let palette = palettes.get(theme);
  if (!palette) {
    const out = { ink: theme.color.ink } as Record<DrawingInk, string>;
    for (const key of LINE_COLORS) out[key] = theme.line[key].fill;
    palette = out;
    palettes.set(theme, palette);
  }
  return palette;
}

const paths = new WeakMap<Stroke, string>();

/** A stroke's SVG path in drawing units, made once per stroke. */
export function pathOf(stroke: Stroke): string {
  let d = paths.get(stroke);
  if (d === undefined) {
    d = strokePath(stroke.points);
    paths.set(stroke, d);
  }
  return d;
}

/** A highlighter lies over what it marks, see-through. */
export const strokeOpacity = (tool: DrawingTool): number => (tool === 'highlighter' ? HIGHLIGHTER_OPACITY : 1);

const parsed = new Map<string, readonly Stroke[]>();
const PARSED_KEPT = 8;

/** A drawing's strokes, read once for the few drawings on screen (a card, a block and its preview read the same text). */
export function strokesOf(data: string): readonly Stroke[] {
  if (!data) return NO_STROKES;
  let strokes = parsed.get(data);
  if (strokes) return strokes;
  strokes = parseDrawing(data);
  if (parsed.size >= PARSED_KEPT) parsed.delete(parsed.keys().next().value!);
  parsed.set(data, strokes);
  return strokes;
}

// ── keeping strokes ────────────────────────────────────────────────────────

/** The drawing with a stroke just drawn: written after the last line when it sorts last (it nearly always does), else put in its place. */
export function appendStroke(data: string, stroke: Stroke): string {
  if (!data) return strokeLine(stroke);
  const last = data.slice(data.lastIndexOf('\n') + 1);
  const lastId = last.slice(0, last.indexOf(' '));
  return lastId && lastId < stroke.id ? `${data}\n${strokeLine(stroke)}` : withStroke(data, stroke);
}

/** Strokes with more of them, in the order they lie (by id); one already there is not added twice. */
export function insertStrokes(strokes: readonly Stroke[], added: readonly Stroke[]): Stroke[] {
  const present = new Set(strokes.map(stroke => stroke.id));
  const fresh = added.filter(stroke => !present.has(stroke.id));
  if (fresh.length === 0) return [...strokes];
  const last = strokes[strokes.length - 1];
  if (fresh.length === 1 && (!last || last.id < fresh[0]!.id)) return [...strokes, fresh[0]!];
  return [...strokes, ...fresh].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Strokes read again from the store, keeping the ones already held (a stroke is never edited, only added or erased), so what did not change is not drawn again. */
export function reuseStrokes(held: readonly Stroke[], read: readonly Stroke[]): readonly Stroke[] {
  if (held.length === 0) return read;
  const byId = new Map(held.map(stroke => [stroke.id, stroke]));
  let same = held.length === read.length;
  const out = read.map((stroke, index) => {
    const kept = byId.get(stroke.id);
    const reused = kept && kept.tool === stroke.tool && kept.size === stroke.size && kept.ink === stroke.ink && kept.points.length === stroke.points.length ? kept : stroke;
    if (reused !== held[index]) same = false;
    return reused;
  });
  return same ? held : out;
}

// ── the sheet ──────────────────────────────────────────────────────────────

/** How far under the lowest stroke the editor's sheet goes on, so there is room to keep drawing (drawing units), as on the web; it grows by steps. */
const SHEET_ROOM = 250;
const SHEET_STEP = 50;

/** The lowest any stroke reaches, its own width included (0 with nothing drawn). */
function lowestPoint(strokes: readonly Stroke[]): number {
  let lowest = 0;
  for (const stroke of strokes) {
    const half = strokeWidth(stroke) / 2;
    for (let at = 1; at < stroke.points.length; at += 2) lowest = Math.max(lowest, stroke.points[at]! + half);
  }
  return lowest;
}

/**
 * The editor's sheet in drawing units: room under the lowest stroke, a new 4:3 sheet at least, and
 * the whole view when the view is taller. It grows as a stroke is kept, never under the finger.
 */
export function sheetUnits(strokes: readonly Stroke[], viewUnits: number): number {
  if (viewUnits <= 0) return 0;
  return Math.max(viewUnits, DRAWING_MIN_HEIGHT, Math.ceil((lowestPoint(strokes) + SHEET_ROOM) / SHEET_STEP) * SHEET_STEP);
}

const ranges = new WeakMap<Stroke, { readonly band: number; readonly first: number; readonly last: number }>();

/** The first and last band of `band` units a stroke reaches, its width included. */
function bandRange(stroke: Stroke, band: number): readonly [number, number] {
  const known = ranges.get(stroke);
  if (known && known.band === band) return [known.first, known.last];
  const half = strokeWidth(stroke) / 2;
  let top = Infinity;
  let bottom = -Infinity;
  for (let at = 1; at < stroke.points.length; at += 2) {
    top = Math.min(top, stroke.points[at]!);
    bottom = Math.max(bottom, stroke.points[at]!);
  }
  const first = Math.floor((top - half) / band);
  const last = Math.floor((bottom + half) / band);
  ranges.set(stroke, { band, first, last });
  return [first, last];
}

/** The strokes each of `count` bands draws (`band` units high, from the sheet's top), in the order they lie. */
export function strokesByBand(strokes: readonly Stroke[], band: number, count: number): Stroke[][] {
  const out: Stroke[][] = Array.from({ length: count }, () => []);
  if (band <= 0) return out;
  for (const stroke of strokes) {
    const [first, last] = bandRange(stroke, band);
    for (let index = Math.max(0, first); index <= Math.min(count - 1, last); index += 1) out[index]!.push(stroke);
  }
  return out;
}

/** The lists drawn before wherever they hold the same strokes, so a band nothing changed in is not drawn again. */
export function keepSameBands(previous: readonly (readonly Stroke[])[], next: readonly Stroke[][]): (readonly Stroke[])[] {
  return next.map((list, index) => {
    const before = previous[index];
    return before && before.length === list.length && before.every((stroke, at) => stroke === list[at]) ? before : list;
  });
}

// ── the eraser ─────────────────────────────────────────────────────────────

/** What the eraser touches along its way (core's sweep, each stroke's box read once). */
export { strokesAlong };

// ── a session's steps ──────────────────────────────────────────────────────

/** One thing done in the editor: strokes drawn, or strokes erased (a sweep of the eraser, « Tout effacer »). */
export interface DrawingStep {
  readonly kind: 'add' | 'remove';
  readonly strokes: readonly Stroke[];
}

/** The drawing with a step taken back or done again: strokes come back in their place, or go. */
export function applyStep(data: string, step: DrawingStep, direction: 'undo' | 'redo'): string {
  const adding = (step.kind === 'add') === (direction === 'redo');
  const current = parseDrawing(data);
  if (adding) return serializeStrokes(insertStrokes(current, step.strokes));
  const ids = new Set(step.strokes.map(stroke => stroke.id));
  return serializeStrokes(current.filter(stroke => !ids.has(stroke.id)));
}

// ── pens ───────────────────────────────────────────────────────────────────

/**
 * What is in hand, as on the web: the tool, the drawing tool kept while the eraser is in hand, each
 * drawing tool's own size, and the ink, one for all of them.
 */
export interface ToolChoice {
  readonly tool: DrawingTool | 'eraser';
  readonly pen: DrawingTool;
  readonly sizes: Readonly<Record<DrawingTool, DrawingSize>>;
  readonly ink: DrawingInk;
}

const FIRST_CHOICE: ToolChoice = { tool: 'pen', pen: 'pen', sizes: { pen: 1, marker: 1, highlighter: 1 }, ink: 'ink' };

let remembered = FIRST_CHOICE;

/** The tools as the last drawing left them, on this phone until the app closes. */
export const lastChoice = (): ToolChoice => remembered;

export function rememberChoice(choice: ToolChoice): void {
  remembered = choice;
}

export function withTool(choice: ToolChoice, tool: DrawingTool | 'eraser'): ToolChoice {
  return { ...choice, tool, pen: tool === 'eraser' ? choice.pen : tool };
}

/** A size for the drawing tool, or an ink: picked while the eraser is in hand, it takes that tool back. */
export function withPen(choice: ToolChoice, change: { readonly size?: DrawingSize; readonly ink?: DrawingInk }): ToolChoice {
  const pen = choice.pen;
  return { tool: pen, pen, sizes: change.size === undefined ? choice.sizes : { ...choice.sizes, [pen]: change.size }, ink: change.ink ?? choice.ink };
}

/** A size's dot in the tools (dp): the tool's width, eased so its three sizes tell apart and the thickest fits its button (the web's numbers). */
export function sizeDot(tool: DrawingTool, size: DrawingSize): number {
  return Math.min(22, Math.max(4, Math.round(Math.sqrt(STROKE_WIDTHS[tool][size]) * 3.3)));
}
