/**
 * The checkbox, one drawing for both clients. A control, not a glyph: a box with the continuous
 * corner (`SHAPES.check`), its edge drawn inside it while open; checked, filled whole with the tick
 * punched through, so the paper, wash or gradient under it shows in the tick and the box stays
 * neutral on any note colour (never matcha). The label's tag and a calendar's stone check the same
 * way: an edge while off, filled with their mark cut out while on.
 *
 * Drawn on an 18 grid with a 2 edge (Material's box) and scaled to its size, edge and tick with it.
 */
import { SHAPES, squirclePath } from './shapes';

type Point = readonly [number, number];

/** The grid the box is drawn on: its size wherever nothing asks for another. */
export const CHECK_GRID = 18;

export const CHECK_VIEWBOX = `0 0 ${CHECK_GRID} ${CHECK_GRID}`;

/** The open box's edge, drawn inside the box so the box keeps its size in both states. */
export const CHECK_EDGE = 2;

/** The tick's three points (its short arm, its foot, its long arm's end), centred in the box by eye. */
export const CHECK_TICK: readonly Point[] = [
  [4.9, 9.2],
  [7.7, 12],
  [13.2, 6.3],
];

/** The tick's line, as wide as the edge. */
export const CHECK_TICK_WIDTH = 2;

const fixed = (value: number): string => String(Math.round(value * 1000) / 1000);
const at = ([x, y]: Point): string => `${fixed(x)},${fixed(y)}`;
const along = (point: Point, direction: Point, distance: number): Point => [point[0] + direction[0] * distance, point[1] + direction[1] * distance];
const cross = (a: Point, b: Point): number => a[0] * b[1] - a[1] * b[0];
const dot = (a: Point, b: Point): number => a[0] * b[0] + a[1] * b[1];

function unit(from: Point, to: Point): Point {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  return [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
}

/** Where two lines cross, each a point and a direction (never parallel here). */
function crossing(p: Point, u: Point, q: Point, v: Point): Point {
  return along(p, u, cross([q[0] - p[0], q[1] - p[1]], v) / cross(u, v));
}

/**
 * The outline of a polyline stroked `width` wide with round ends and joins, as one closed path, so
 * the line can be cut out of a fill even-odd with nothing to mask. Each side runs along the segments
 * offset by half the width: at a bend the outer side turns on an arc, the inner side stops where its
 * two offsets cross; the ends are half circles.
 */
export function strokeOutline(points: readonly Point[], width: number): string {
  const r = width / 2;
  /** An arc of radius `r` round `center` from `from` to `to`, by way of the `toward` side (SVG's sweep 1 turns clockwise on screen). */
  const arc = (from: Point, to: Point, center: Point, toward: Point): string =>
    `A${fixed(r)},${fixed(r)} 0 0 ${cross([from[0] - center[0], from[1] - center[1]], toward) > 0 ? 1 : 0} ${at(to)}`;
  /** One side of the line, walked from its first point to its last. */
  const side = (line: readonly Point[]): { start: Point; steps: string[]; end: Point; first: Point; last: Point } => {
    const dirs = line.slice(1).map((point, i) => unit(line[i]!, point));
    const normals = dirs.map(([x, y]): Point => [-y, x]);
    const steps: string[] = [];
    for (let i = 1; i < dirs.length; i += 1) {
      const vertex = line[i]!;
      const before = normals[i - 1]!;
      const after = normals[i]!;
      if (dot(before, dirs[i]!) > 0) {
        // The line turns toward this side: the inside of the bend.
        steps.push(`L${at(crossing(along(vertex, before, r), dirs[i - 1]!, along(vertex, after, r), dirs[i]!))}`);
      } else {
        const from = along(vertex, before, r);
        steps.push(`L${at(from)}`, arc(from, along(vertex, after, r), vertex, [before[0] + after[0], before[1] + after[1]]));
      }
    }
    const end = along(line[line.length - 1]!, normals[normals.length - 1]!, r);
    steps.push(`L${at(end)}`);
    return { start: along(line[0]!, normals[0]!, r), steps, end, first: dirs[0]!, last: dirs[dirs.length - 1]! };
  };
  const there = side(points);
  // The same line walked backwards keeps to its other side.
  const back = side([...points].reverse());
  return [
    `M${at(there.start)}`,
    ...there.steps,
    arc(there.end, back.start, points[points.length - 1]!, there.last),
    ...back.steps,
    arc(back.end, there.start, points[0]!, back.last),
    'Z',
  ].join(' ');
}

/** The open box's edge: a line `CHECK_EDGE` wide drawn on this path, half its width in from the box. */
export const CHECK_EDGE_PATH = squirclePath(CHECK_GRID, CHECK_GRID, SHAPES.check, CHECK_EDGE / 2);

/** The checked box: the whole box with the tick's outline, filled even-odd so the tick is a hole. */
export const CHECK_FILL_PATH = `${squirclePath(CHECK_GRID, CHECK_GRID, SHAPES.check)} ${strokeOutline(CHECK_TICK, CHECK_TICK_WIDTH)}`;
