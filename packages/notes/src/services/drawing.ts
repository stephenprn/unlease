/**
 * A drawing's strokes as text (`notes/models/drawing`), one stroke per line:
 *
 *   <id> <tool><size> <ink> <points>        e.g. `mh2k9x1c0a7q p1 blue ~nqA_tH??...`
 *
 * tool `p` pen, `m` marker, `h` highlighter; size 0 to 2; ink `ink` or a pigment key; points as
 * Google's polyline encoding (whole units, each pair after the first a difference from the one
 * before, so a stroke costs about two characters a point). Lines sort by id, the order they were
 * drawn in. Reading forgives anything else: a line it cannot read is left out.
 *
 * Strokes are never edited, only added or erased, so two versions merge as sets: what either side
 * added stays, what either side erased goes (`mergeStrokes`).
 */
import { DRAWING_LIMITS, DRAWING_MIN_HEIGHT, DRAWING_TOOLS, DRAWING_WIDTH, ERASER_MIN_PX, ERASER_RADIUS, HIGHLIGHTER_OPACITY, STROKE_WIDTHS, type DrawingInk, type DrawingSize, type DrawingTool, type Stroke } from '../models/drawing';
import { isLineColor } from '@unlease/design/colors';

const TOOL_CODES: Readonly<Record<DrawingTool, string>> = { pen: 'p', marker: 'm', highlighter: 'h' };
const CODE_TOOLS: Readonly<Record<string, DrawingTool>> = { p: 'pen', m: 'marker', h: 'highlighter' };
const ID = /^[0-9a-z]{6,24}$/;

// ── points ─────────────────────────────────────────────────────────────────

/** Google's polyline encoding of whole numbers, each after the first as a difference. */
export function encodePoints(points: readonly number[]): string {
  let out = '';
  let previous = [0, 0];
  for (let at = 0; at + 1 < points.length; at += 2) {
    const pair = [Math.round(points[at]!), Math.round(points[at + 1]!)];
    for (const axis of [0, 1]) {
      let value = pair[axis]! - previous[axis]!;
      value = value < 0 ? ~(value << 1) : value << 1;
      while (value >= 0x20) {
        out += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
        value >>= 5;
      }
      out += String.fromCharCode(value + 63);
    }
    previous = pair;
  }
  return out;
}

/** The points of `encodePoints`, or null when the text is not one. */
export function decodePoints(text: string): number[] | null {
  const out: number[] = [];
  let at = 0;
  const current = [0, 0];
  while (at < text.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        if (at >= text.length) return null;
        byte = text.charCodeAt(at) - 63;
        at += 1;
        if (byte < 0 || byte > 63) return null;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && shift < 35);
      current[axis] = current[axis]! + (result & 1 ? ~(result >> 1) : result >> 1);
    }
    out.push(current[0]!, current[1]!);
    if (out.length / 2 > DRAWING_LIMITS.points) return null;
  }
  return out;
}

/** Ramer-Douglas-Peucker: the points a stroke keeps once those within `tolerance` of the line through their neighbours are dropped. */
export function simplifyPoints(points: readonly number[], tolerance = 0.8): number[] {
  const count = points.length / 2;
  if (count <= 2) return [...points];
  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;
  const stack: [number, number][] = [[0, count - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    const ax = points[first * 2]!;
    const ay = points[first * 2 + 1]!;
    const bx = points[last * 2]!;
    const by = points[last * 2 + 1]!;
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    let farthest = -1;
    let distance = tolerance;
    for (let index = first + 1; index < last; index += 1) {
      const px = points[index * 2]!;
      const py = points[index * 2 + 1]!;
      const away = length === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / length;
      if (away > distance) {
        distance = away;
        farthest = index;
      }
    }
    if (farthest >= 0) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  const out: number[] = [];
  for (let index = 0; index < count; index += 1) if (keep[index]) out.push(points[index * 2]!, points[index * 2 + 1]!);
  return out;
}

// ── strokes as text ───────────────────────────────────────────────────────

/** An id that sorts by when the stroke was drawn: the time, then a little chance. */
export function newStrokeId(now: number = Date.now(), random: () => number = Math.random): string {
  let tail = '';
  for (let index = 0; index < 4; index += 1) tail += Math.floor(random() * 36).toString(36);
  return `${now.toString(36).padStart(9, '0')}${tail}`;
}

export function strokeLine(stroke: Stroke): string {
  return `${stroke.id} ${TOOL_CODES[stroke.tool]}${stroke.size} ${stroke.ink} ${encodePoints(stroke.points)}`;
}

function readLine(line: string): Stroke | null {
  const [id, form, ink, encoded] = line.split(' ');
  if (!id || !ID.test(id) || !form || form.length !== 2 || !ink || encoded === undefined) return null;
  const tool = CODE_TOOLS[form[0]!];
  const size = Number(form[1]);
  if (!tool || !(size === 0 || size === 1 || size === 2)) return null;
  const points = decodePoints(encoded);
  if (!points || points.length < 2) return null;
  return { id, tool, size: size as DrawingSize, ink: ink === 'ink' || isLineColor(ink) ? (ink as DrawingInk) : 'ink', points };
}

/** The strokes a drawing's text holds, in the order they lie (by id). */
export function parseDrawing(data: string): Stroke[] {
  if (!data) return [];
  const out: Stroke[] = [];
  for (const line of data.split('\n')) {
    const stroke = readLine(line.trim());
    if (stroke) out.push(stroke);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Strokes as a drawing's text, in id order. */
export function serializeStrokes(strokes: readonly Stroke[]): string {
  return [...strokes]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(strokeLine)
    .join('\n');
}

/** Lines by stroke id, for a merge: a line this version cannot draw (a newer one's) is kept as it is, a line with no id left out. */
function lines(data: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of data.split('\n')) {
    const line = raw.trim();
    const id = line.slice(0, line.indexOf(' '));
    if (id && ID.test(id)) out.set(id, line);
  }
  return out;
}

/**
 * Two versions of a drawing from a common `base`: every stroke either side drew is kept, every one
 * either side erased is gone. A stroke both hold differently (never, unless written by hand) takes
 * the newer side's line: `oursFirst` says ours is the older.
 */
export function mergeStrokes(base: string, ours: string, theirs: string, oursFirst: boolean): string {
  const o = lines(base);
  const a = lines(ours);
  const b = lines(theirs);
  const kept = new Map<string, string>();
  for (const [id, line] of a) {
    if (b.has(id)) kept.set(id, oursFirst ? b.get(id)! : line);
    else if (!o.has(id)) kept.set(id, line);
  }
  for (const [id, line] of b) if (!a.has(id) && !o.has(id)) kept.set(id, line);
  return [...kept.entries()]
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    .map(([, line]) => line)
    .join('\n');
}

/** The drawing with one more stroke: drawn last, it lies on top. */
export function withStroke(data: string, stroke: Stroke): string {
  const line = strokeLine(stroke);
  return data ? serializeStrokes([...parseDrawing(data), stroke]) : line;
}

/** The drawing without these strokes. */
export function withoutStrokes(data: string, ids: ReadonlySet<string>): string {
  return serializeStrokes(parseDrawing(data).filter(stroke => !ids.has(stroke.id)));
}

/** Whether nothing is drawn. */
export function isDrawingEmpty(data: string): boolean {
  return parseDrawing(data).length === 0;
}

// ── geometry ──────────────────────────────────────────────────────────────

export function strokeWidth(stroke: Pick<Stroke, 'tool' | 'size'>): number {
  return STROKE_WIDTHS[stroke.tool][stroke.size];
}

/** How far below the lowest stroke the sheet goes on, and the step its height grows by. */
const FOOT = 60;
const HEIGHT_STEP = 50;

/** The sheet's height in drawing units: what is drawn and a little room under it, never shorter than a new sheet. */
export function drawingHeight(strokes: readonly Stroke[]): number {
  let lowest = 0;
  for (const stroke of strokes) {
    const half = strokeWidth(stroke) / 2;
    for (let at = 1; at < stroke.points.length; at += 2) lowest = Math.max(lowest, stroke.points[at]! + half);
  }
  return Math.max(DRAWING_MIN_HEIGHT, Math.ceil((lowest + FOOT) / HEIGHT_STEP) * HEIGHT_STEP);
}

/** Height over width: what a card or a page block keeps of the sheet's proportions. */
export function drawingRatio(strokes: readonly Stroke[]): number {
  return drawingHeight(strokes) / DRAWING_WIDTH;
}

const round1 = (value: number): string => String(Math.round(value * 10) / 10);

/**
 * A stroke as an SVG path through its points, smoothed by quadratic curves through the midpoints
 * (`stroke-linecap` and `stroke-linejoin` round). A single point is a dot: a segment of no length.
 */
export function strokePath(points: readonly number[], scale = 1): string {
  const count = points.length / 2;
  if (count === 0) return '';
  const x = (index: number): number => points[index * 2]! * scale;
  const y = (index: number): number => points[index * 2 + 1]! * scale;
  if (count === 1) return `M${round1(x(0))} ${round1(y(0))}l0.01 0`;
  if (count === 2) return `M${round1(x(0))} ${round1(y(0))}L${round1(x(1))} ${round1(y(1))}`;
  let d = `M${round1(x(0))} ${round1(y(0))}`;
  for (let index = 1; index < count - 1; index += 1) {
    const mx = (x(index) + x(index + 1)) / 2;
    const my = (y(index) + y(index + 1)) / 2;
    d += `Q${round1(x(index))} ${round1(y(index))} ${round1(mx)} ${round1(my)}`;
  }
  return `${d}L${round1(x(count - 1))} ${round1(y(count - 1))}`;
}

/** Distance from a point to a segment. */
function toSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const along = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
  return Math.hypot(px - (ax + along * dx), py - (ay + along * dy));
}

/** The eraser's reach in drawing units at a scale of `unitsPerPixel`: its own, or a finger's least on a small screen. */
export function eraserReach(unitsPerPixel: number): number {
  return Math.max(ERASER_RADIUS, ERASER_MIN_PX * unitsPerPixel);
}

/** The strokes an eraser at (x, y) touches: within its reach of any part of their line, their own width included. */
export function strokesAt(strokes: readonly Stroke[], x: number, y: number, radius: number = ERASER_RADIUS): string[] {
  const out: string[] = [];
  for (const stroke of strokes) {
    const reach = radius + strokeWidth(stroke) / 2;
    const points = stroke.points;
    if (points.length === 2) {
      if (Math.hypot(points[0]! - x, points[1]! - y) <= reach) out.push(stroke.id);
      continue;
    }
    for (let at = 2; at + 1 < points.length; at += 2) {
      if (toSegment(x, y, points[at - 2]!, points[at - 1]!, points[at]!, points[at + 1]!) <= reach) {
        out.push(stroke.id);
        break;
      }
    }
  }
  return out;
}

type Box = readonly [left: number, top: number, right: number, bottom: number];

const boxes = new WeakMap<Stroke, Box>();
const NO_IDS: ReadonlySet<string> = new Set();

/** Where a stroke lies, its width included: read once per stroke. */
export function strokeBox(stroke: Stroke): Box {
  let box = boxes.get(stroke);
  if (!box) {
    const half = strokeWidth(stroke) / 2;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (let at = 0; at + 1 < stroke.points.length; at += 2) {
      left = Math.min(left, stroke.points[at]!);
      right = Math.max(right, stroke.points[at]!);
      top = Math.min(top, stroke.points[at + 1]!);
      bottom = Math.max(bottom, stroke.points[at + 1]!);
    }
    box = [left - half, top - half, right + half, bottom + half];
    boxes.set(stroke, box);
  }
  return box;
}

/**
 * Every stroke the eraser touches going from (ax, ay) to (bx, by), its reach laid along the way so a
 * quick sweep skips nothing; only the strokes whose box meets the sweep's are looked at, `skip` not at all.
 */
export function strokesAlong(strokes: readonly Stroke[], ax: number, ay: number, bx: number, by: number, radius: number, skip: ReadonlySet<string> = NO_IDS): string[] {
  const [left, right] = ax < bx ? [ax - radius, bx + radius] : [bx - radius, ax + radius];
  const [top, bottom] = ay < by ? [ay - radius, by + radius] : [by - radius, ay + radius];
  let near = strokes.filter(stroke => {
    if (skip.has(stroke.id)) return false;
    const box = strokeBox(stroke);
    return box[2] >= left && box[0] <= right && box[3] >= top && box[1] <= bottom;
  });
  const found: string[] = [];
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / Math.max(1, radius)));
  for (let step = 0; step <= steps && near.length > 0; step += 1) {
    const touched = new Set(strokesAt(near, ax + ((bx - ax) * step) / steps, ay + ((by - ay) * step) / steps, radius));
    if (touched.size === 0) continue;
    found.push(...touched);
    near = near.filter(stroke => !touched.has(stroke.id));
  }
  return found;
}

/** A stroke just drawn, ready to keep: its points rounded to whole units, simplified, inside the sheet's width. */
export function finishStroke(id: string, tool: DrawingTool, size: DrawingSize, ink: DrawingInk, raw: readonly number[]): Stroke | null {
  if (raw.length < 2 || !DRAWING_TOOLS.includes(tool)) return null;
  const rounded: number[] = [];
  for (let at = 0; at + 1 < raw.length; at += 2) {
    const x = Math.round(Math.max(0, Math.min(DRAWING_WIDTH, raw[at]!)));
    const y = Math.round(Math.max(0, raw[at + 1]!));
    // Repeated points add nothing.
    if (rounded.length >= 2 && rounded[rounded.length - 2] === x && rounded[rounded.length - 1] === y) continue;
    rounded.push(x, y);
  }
  const points = simplifyPoints(rounded).slice(0, DRAWING_LIMITS.points * 2);
  return { id, tool, size, ink, points };
}

const ratios = new WeakMap<object, number | null>();

/** A drawing note's sheet ratio for its card, or null with nothing drawn; read once per version of the note. */
export function noteDrawingRatio(note: { readonly kind: string; readonly drawing: string }): number | null {
  if (note.kind !== 'drawing' || !note.drawing) return null;
  const known = ratios.get(note);
  if (known !== undefined) return known;
  const strokes = parseDrawing(note.drawing);
  const ratio = strokes.length > 0 ? drawingRatio(strokes) : null;
  ratios.set(note, ratio);
  return ratio;
}

/** A drawing as a standalone SVG file (a backup's Markdown links it), each ink as `color` paints it. */
export function drawingSvg(data: string, color: (ink: DrawingInk) => string): string {
  const strokes = parseDrawing(data);
  const height = drawingHeight(strokes);
  const paths = strokes.map(stroke => {
    const see = stroke.tool === 'highlighter' ? ` stroke-opacity="${HIGHLIGHTER_OPACITY}"` : '';
    return `<path d="${strokePath(stroke.points)}" fill="none" stroke="${color(stroke.ink)}" stroke-width="${strokeWidth(stroke)}" stroke-linecap="round" stroke-linejoin="round"${see}/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${DRAWING_WIDTH}" height="${height}" viewBox="0 0 ${DRAWING_WIDTH} ${height}">\n${paths.join('\n')}\n</svg>\n`;
}
