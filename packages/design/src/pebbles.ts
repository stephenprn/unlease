/**
 * The pebble: the stone the mark's card lies on (`MARK_PEBBLE`), the one organic form in the
 * interface. It marks what is chosen, captured or kept, and crops pictures; it never holds text,
 * which lives on sheets (`shapes.ts`). Everywhere it is the same stone, stretched to its box so it
 * touches every side, and turned one of four ways so neighbours differ (`pebbleTurn`).
 *
 * Pressed, it gives: its pieces move most of the way to a circle through the same nodes, so the
 * morph from one to the other is smooth, and it springs back when let go. The web draws it as
 * `clip-path: shape(...)` in percentages (`pebbleShape`), which scales with the box and animates
 * between the two; the phone in its native view (`pebbleNumbers`).
 */
import { MARK_PEBBLE } from './mark';
import { cutIndex, outlineToPath, type Outline, type Segment } from './shapes';

/** How far a pressed pebble moves toward the circle through its nodes. */
const GIVE = 0.62;

type Point = [number, number];

/** The mark's pebble, read from its path: a start, then cubic pieces. */
function parse(d: string): { start: Point; pieces: [Point, Point, Point][] } {
  const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const start: Point = [numbers[0]!, numbers[1]!];
  const pieces: [Point, Point, Point][] = [];
  for (let i = 2; i + 5 < numbers.length; i += 6) pieces.push([[numbers[i]!, numbers[i + 1]!], [numbers[i + 2]!, numbers[i + 3]!], [numbers[i + 4]!, numbers[i + 5]!]]);
  return { start, pieces };
}

/** The curve's tight bounds, sampled finely (a Bézier's hull overshoots its curve). */
function bounds(start: Point, pieces: readonly [Point, Point, Point][]): { x: number; y: number; width: number; height: number } {
  let minX = start[0];
  let maxX = start[0];
  let minY = start[1];
  let maxY = start[1];
  let from = start;
  for (const [c1, c2, end] of pieces) {
    for (let i = 1; i <= 64; i += 1) {
      const t = i / 64;
      const u = 1 - t;
      const x = u * u * u * from[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * end[0];
      const y = u * u * u * from[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * end[1];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    from = end;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** The stone stretched to touch every side of a 100 box. */
const STONE: { start: Point; pieces: [Point, Point, Point][] } = (() => {
  const raw = parse(MARK_PEBBLE);
  const box = bounds(raw.start, raw.pieces);
  const fit = ([x, y]: Point): Point => [((x - box.x) / box.width) * 100, ((y - box.y) / box.height) * 100];
  return { start: fit(raw.start), pieces: raw.pieces.map(piece => piece.map(fit) as [Point, Point, Point]) };
})();

/** The circle through the stone's nodes' directions, in as many pieces: what the stone gives toward. */
const ROUND: { start: Point; pieces: [Point, Point, Point][] } = (() => {
  const angleOf = ([x, y]: Point): number => Math.atan2(y - 50, x - 50);
  const on = (angle: number): Point => [50 + 50 * Math.cos(angle), 50 + 50 * Math.sin(angle)];
  const nodes = [STONE.start, ...STONE.pieces.map(piece => piece[2])];
  const pieces: [Point, Point, Point][] = [];
  for (let i = 1; i < nodes.length; i += 1) {
    const from = angleOf(nodes[i - 1]!);
    let to = angleOf(nodes[i]!);
    while (to <= from) to += 2 * Math.PI;
    const reach = (4 / 3) * Math.tan((to - from) / 4) * 50;
    const a = on(from);
    const b = on(to);
    pieces.push([
      [a[0] - Math.sin(from) * reach, a[1] + Math.cos(from) * reach],
      [b[0] + Math.sin(to) * reach, b[1] - Math.cos(to) * reach],
      b,
    ]);
  }
  return { start: on(angleOf(STONE.start)), pieces };
})();

/** The four turns: as drawn, mirrored, turned half round, flipped. */
export const PEBBLE_TURNS = 4;

/** Neighbours differ: the pebble for the `index`-th of a row. */
export function pebbleTurn(index: number): number {
  return ((index % PEBBLE_TURNS) + PEBBLE_TURNS) % PEBBLE_TURNS;
}

/** Something's own stone, kept for life (a collection's, from its id): the same turn wherever it shows. */
export function pebbleTurnOf(key: string): number {
  return cutIndex(key, PEBBLE_TURNS);
}

const turned = ([x, y]: Point, turn: number): Point => {
  switch (pebbleTurn(turn)) {
    case 1:
      return [100 - x, y];
    case 2:
      return [100 - x, 100 - y];
    case 3:
      return [x, 100 - y];
    default:
      return [x, y];
  }
};

/** The pebble in a 100 box, turned, `pressed` (0 at rest to 1 given) of the way to its pressed form. */
export function pebbleSegments(turn: number, pressed = 0): Outline {
  const amount = Math.max(0, Math.min(1, pressed)) * GIVE;
  const mix = (a: Point, b: Point): Point => turned([a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount], turn);
  const start = mix(STONE.start, ROUND.start);
  const segments: Segment[] = STONE.pieces.map((piece, i) => {
    const round = ROUND.pieces[i]!;
    const [c1, c2, end] = [mix(piece[0], round[0]), mix(piece[1], round[1]), mix(piece[2], round[2])];
    return [c1[0], c1[1], c2[0], c2[1], end[0], end[1]];
  });
  return { start, segments };
}

/** As an SVG path for a `width` by `height` box. */
export function pebblePath(width: number, height: number, turn: number, pressed = 0): string {
  const { start, segments } = pebbleSegments(turn, pressed);
  const sx = width / 100;
  const sy = height / 100;
  return outlineToPath({ start: [start[0] * sx, start[1] * sy], segments: segments.map(s => [s[0] * sx, s[1] * sy, s[2] * sx, s[3] * sy, s[4] * sx, s[5] * sy] as Segment) });
}

const percent = (value: number): string => `${Math.round(value * 100) / 100}%`;

/** As CSS `clip-path: shape(...)`, in percentages of the box, so it needs no measuring; rest and pressed animate into each other. */
export function pebbleShape(turn: number, pressed = 0): string {
  const { start, segments } = pebbleSegments(turn, pressed);
  const pair = (x: number, y: number): string => `${percent(x)} ${percent(y)}`;
  const pieces = segments.map(s => `curve to ${pair(s[4], s[5])} with ${pair(s[0], s[1])} / ${pair(s[2], s[3])}`);
  return `shape(from ${pair(start[0], start[1])}, ${pieces.join(', ')}, close)`;
}

/** For the phone's native view: the start, then each piece's six numbers, in a 100 box. */
export function pebbleNumbers(turn: number, pressed = 0): number[] {
  const { start, segments } = pebbleSegments(turn, pressed);
  return [start[0], start[1], ...segments.flat()].map(value => Math.round(value * 1000) / 1000);
}
