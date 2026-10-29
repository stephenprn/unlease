/**
 * The stroke under the finger as an SVG path, grown a point at a time on the UI thread: the same
 * curve `strokePath` draws once the stroke is kept (quadratic curves through the midpoints, to one
 * decimal), so nothing moves when it is handed over. A point turns into a curve once the next one
 * comes: the path is what is settled (`pathStart`, then a `pathCurve` per point) and its end.
 */

function round1(value: number): number {
  'worklet';
  return Math.round(value * 10) / 10;
}

/** Where the path starts. */
export function pathStart(x: number, y: number): string {
  'worklet';
  return `M${round1(x)} ${round1(y)}`;
}

/** The curve a point adds once another follows it: to the midpoint between them, the point as its control. */
export function pathCurve(x: number, y: number, nextX: number, nextY: number): string {
  'worklet';
  return `Q${round1(x)} ${round1(y)} ${round1((x + nextX) / 2)} ${round1((y + nextY) / 2)}`;
}

/** What closes the path for now: a line to the last point, or a dot's tick while there is only one. */
export function pathEnd(count: number, x: number, y: number): string {
  'worklet';
  return count === 1 ? 'l0.01 0' : `L${round1(x)} ${round1(y)}`;
}
