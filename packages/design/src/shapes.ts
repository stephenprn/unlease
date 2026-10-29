/**
 * Carnet's shapes: every surface a sheet with one smooth corner, the brand's pebble the one
 * organic form (`pebbles.ts`).
 *
 * The corner is Figma's continuous corner at smoothing 0.6, the iOS shape: a short circular arc
 * between two easing curves, so the bend grows from nothing where a side meets it and no hump
 * shows (a circular corner jumps from straight to its full curve at once; an elliptical one pinches
 * at one end and flares at the other). One radius per role, from a short scale, the same at every
 * size; a shape nested in another is concentric with it (`concentric`). A control's radius stays
 * under half its height, so a button reads as a soft sheet, never a pill.
 *
 * Both clients draw the same corner: the web as a path (`squirclePath`: a container's clip and its
 * edge) or as `border-radius` (controls, which take `corner-shape: squircle` where the browser
 * has it); the phone in its native view (`OrganicView.kt` mirrors `squircleSegments`, number for
 * number), since a React Native radius is a plain circle.
 */
export type CornerValue = number | `${number}%`;

/** Four radii, top-left first and clockwise (CSS `border-radius` order); a `'50%'` is relative to the box (a dot). */
export type Corners = readonly [CornerValue, CornerValue, CornerValue, CornerValue];

/** How far each corner's easing reaches beyond its arc (Figma's ξ): 0.6 is the iOS corner. */
export const SMOOTHING = 0.6;

/** A corner never takes more than this share of the box's shorter side: a one-line note stays a sheet, never a pill. */
export const CORNER_CAP = 0.3;

/**
 * The radius scale, in px on the web and dp on the phone: one step per role, never one by size.
 * Each is the radius of the corner's arc, which runs as deep into the corner as a round corner of
 * that radius, so a browser without continuous corners draws it round at that radius and looks
 * the same (`--corner-scale` on the web).
 */
export const RADII = {
  /** A detail inside text: a key, inline code, a mention, a table's option. */
  detail: 5,
  /** A small control, 32 high or less (a chevron, a crumb, a block's gutter button). */
  small: 9,
  /** A chip (40 to 44 high): a collection, a reminder, a picker's choice. */
  chip: 12,
  /** A row (navigation, menu, list) and its press. */
  row: 12,
  /** A picture's frame, a thumbnail well, a code block, a bookmark. */
  frame: 12,
  /** A button, a text field (48 to 52 high). */
  control: 13,
  /** The search strip, the slip (52 to 56 high), the segmented track. */
  bar: 15,
  /** A menu or a popover: its rows sit 6 in, concentric with it. */
  menu: 18,
  /** A note on the wall, a collection's tile, a link's row. */
  card: 20,
  /** A settings group, a notice, a callout, the info card. */
  panel: 22,
  /** A dialog, the bottom sheet's top, a side sheet's open side. */
  dialog: 28,
} as const;

const all = (radius: number): Corners => [radius, radius, radius, radius];

/** Each role's corners. A container takes its kind's (`outline.ts`); a control its role's. */
export const SHAPES = {
  /** Buttons, the destructive confirm included. */
  button: all(RADII.control),
  field: all(RADII.control),
  textarea: all(RADII.control),
  search: all(RADII.bar),
  /** A collection chip, a reminder chip, a picker's choice. */
  chip: all(RADII.chip),
  /** The bottom sheet: its two top corners; the sides and foot run off the screen. */
  sheet: [RADII.dialog, RADII.dialog, 0, 0],
  dialog: all(RADII.dialog),
  menu: all(RADII.menu),
  /** Snackbar and transfer. */
  slip: all(RADII.bar),
  /** A link's photo frame, a bookmark, a picture or a player in a page. */
  frame: all(RADII.frame),
  /** A row (navigation, menu, list). */
  tab: all(RADII.row),
  /** The segmented control's track. */
  track: all(RADII.bar),
  /** A segment, 4 inside the track and concentric with it. */
  segment: all(RADII.bar - 4),
  /** A settings group, a facts table, a notice, a callout. */
  panel: all(RADII.panel),
  card: all(RADII.card),
  /** A dashed "add" affordance. */
  dashed: all(RADII.chip),
  /** A small control, 32 high or less. */
  small: all(RADII.small),
  /** A detail inside text: a key, inline code, a mention, an option in a table. */
  detail: all(RADII.detail),
  /** A dot (the sync dot, a picture's page dots): a circle. */
  dot: ['50%', '50%', '50%', '50%'],
} as const satisfies Record<string, Corners>;

/** A shape nested `padding` inside another: concentric with it (Apple and Material: the parent's radius minus the padding), never below `minimum`. */
export function concentric(outer: number, padding: number, minimum = 0): number {
  return Math.max(minimum, outer - padding);
}

/** A small, stable number from a string: same id, same choice, on every device. */
export function cutIndex(key: string, count: number): number {
  let hash = 7;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return hash % count;
}

/** As CSS `border-radius`: `20px`, or four values when they differ. */
export function cssCorners(corners: Corners): string {
  const css = (value: CornerValue): string => (typeof value === 'number' ? (value === 0 ? '0' : `${value}px`) : value);
  const values = corners.map(css);
  return values.every(value => value === values[0]) ? values[0]! : values.join(' ');
}

/** A cubic Bézier piece: its two control points, then its end. */
export type Segment = readonly [number, number, number, number, number, number];

/** A closed outline: where it starts, then cubic pieces clockwise back to that point. */
export interface Outline {
  readonly start: readonly [number, number];
  readonly segments: readonly Segment[];
}

/** One corner's measures (Figma's construction): it reaches `p` along each side; `a`, `b`, `c`, `d` place its easing curves, `arc` spans its circular part. */
interface CornerMeasures {
  readonly radius: number;
  readonly p: number;
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly arc: number;
  /** The circular part's angle, in radians. */
  readonly sweep: number;
}

const rad = (degrees: number): number => (degrees * Math.PI) / 180;

/** A corner of `radius` with room `budget` along each side (half the box's smaller side); on a short box the easing keeps its shape and tightens. */
function cornerMeasures(radius: number, smoothing: number, budget: number): CornerMeasures {
  let p = (1 + smoothing) * radius;
  const arcDegrees = 90 * (1 - smoothing);
  const arc = Math.sin(rad(arcDegrees / 2)) * radius * Math.SQRT2;
  const alpha = (90 - arcDegrees) / 2;
  const reach = radius * Math.tan(rad(alpha / 2));
  const beta = 45 * smoothing;
  const c = reach * Math.cos(rad(beta));
  const d = c * Math.tan(rad(beta));
  let b = (p - arc - c - d) / 3;
  let a = 2 * b;
  if (p > budget) {
    // Not enough room for the whole easing: it is kept, pulled in (figma-squircle's preserveSmoothing).
    const room = Math.max(0, budget - d - arc - c);
    const least = room / 6;
    b = Math.min(b, room - least);
    a = room - b;
    p = budget;
  }
  return { radius, p, a, b, c, d, arc, sweep: rad(arcDegrees) };
}

/** A corner's three cubic pieces in its own frame: it arrives along +u from (-p, 0) and leaves along +v to (0, p); the vertex is the origin. */
function cornerPieces(m: CornerMeasures): [number, number][][] {
  const { a, b, c, d, arc, p, radius, sweep } = m;
  const start: [number, number] = [-p, 0];
  const e1: [number, number] = [-p + a + b + c, d];
  const e2: [number, number] = [e1[0] + arc, e1[1] + arc];
  const end: [number, number] = [0, p];
  // The arc as one cubic: its handles along the tangents the easing curves leave and meet it with.
  const reach = (4 / 3) * Math.tan(sweep / 4) * radius;
  const length1 = Math.hypot(c, d) || 1;
  const t1: [number, number] = [c / length1, d / length1];
  const t2: [number, number] = [d / length1, c / length1];
  return [
    [[start[0] + a, 0], [start[0] + a + b, 0], e1],
    [[e1[0] + t1[0] * reach, e1[1] + t1[1] * reach], [e2[0] - t2[0] * reach, e2[1] - t2[1] * reach], e2],
    [[e2[0] + d, e2[1] + c], [e2[0] + d, e2[1] + b + c], end],
  ];
}

const numberOf = (value: CornerValue, width: number, height: number): number =>
  typeof value === 'number' ? value : (parseFloat(value) / 100) * Math.min(width, height);

/**
 * A box's outline with continuous corners, clockwise from the top side: each corner three cubic
 * pieces (a square corner none), each side one straight piece. No corner takes more than
 * `CORNER_CAP` of the shorter side. `offset` draws it that far inside the box, concentric (each
 * radius less by as much), as a line drawn inside the edge must be.
 */
export function squircleSegments(width: number, height: number, corners: Corners, offset = 0, smoothing = SMOOTHING): Outline {
  const w = Math.max(0, width - 2 * offset);
  const h = Math.max(0, height - 2 * offset);
  const budget = Math.min(w, h) / 2;
  // The cap is the box's own, so a line drawn inside the edge stays concentric with it.
  const cap = CORNER_CAP * Math.min(width, height);
  const measures = corners.map(value => {
    const radius = Math.min(budget, Math.max(0, Math.min(cap, numberOf(value, width, height)) - offset));
    return radius > 0 ? cornerMeasures(radius, smoothing, budget) : null;
  });
  const reachOf = (i: number): number => measures[i]?.p ?? 0;
  // Each corner's vertex, the side it arrives along and the side it leaves along (y down).
  const frames: [[number, number], [number, number], [number, number]][] = [
    [[0, 0], [0, -1], [1, 0]],
    [[w, 0], [1, 0], [0, 1]],
    [[w, h], [0, 1], [-1, 0]],
    [[0, h], [-1, 0], [0, -1]],
  ];
  const at = (corner: number, u: number, v: number): [number, number] => {
    const [vertex, along, away] = frames[corner]!;
    return [offset + vertex[0] + u * along[0] + v * away[0], offset + vertex[1] + u * along[1] + v * away[1]];
  };
  const line = (from: [number, number], to: [number, number]): Segment => [from[0] + (to[0] - from[0]) / 3, from[1] + (to[1] - from[1]) / 3, from[0] + ((to[0] - from[0]) * 2) / 3, from[1] + ((to[1] - from[1]) * 2) / 3, to[0], to[1]];
  const start = at(0, 0, reachOf(0));
  const segments: Segment[] = [];
  let pen = start;
  // Clockwise: the top side, then the top-right corner, the right side, and so on round to the top-left.
  for (let k = 0; k < 4; k += 1) {
    const corner = (k + 1) % 4;
    const arrive = at(corner, -reachOf(corner), 0);
    segments.push(line(pen, arrive));
    const m = measures[corner];
    if (m) {
      for (const [c1, c2, end] of cornerPieces(m)) {
        const p1 = at(corner, c1![0], c1![1]);
        const p2 = at(corner, c2![0], c2![1]);
        const p3 = at(corner, end![0], end![1]);
        segments.push([p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]]);
      }
    }
    pen = at(corner, 0, reachOf(corner));
  }
  return { start, segments };
}

const fixed = (value: number): string => String(Math.round(value * 100) / 100);

/** As an SVG path (`clip-path: path(...)` on the web). */
export function squirclePath(width: number, height: number, corners: Corners, offset = 0): string {
  return outlineToPath(squircleSegments(width, height, corners, offset));
}

/** Any outline as an SVG path. */
export function outlineToPath({ start, segments }: Outline): string {
  const point = (x: number, y: number): string => `${fixed(x)},${fixed(y)}`;
  return `M${point(start[0], start[1])} ${segments.map(s => `C${point(s[0], s[1])} ${point(s[2], s[3])} ${point(s[4], s[5])}`).join(' ')} Z`;
}
