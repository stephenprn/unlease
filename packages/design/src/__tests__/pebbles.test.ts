import { PEBBLE_TURNS, pebbleNumbers, pebblePath, pebbleSegments, pebbleShape, pebbleTurn } from '../pebbles';
import type { Outline } from '../shapes';

type Point = [number, number];

function points({ start, segments }: Outline, steps = 32): Point[] {
  const out: Point[] = [];
  let [x0, y0] = start;
  for (const [x1, y1, x2, y2, x, y] of segments) {
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const u = 1 - t;
      out.push([u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y]);
    }
    x0 = x;
    y0 = y;
  }
  return out;
}

/** How far the outline strays from the circle of its box, at its worst. */
const unevenness = (outline: Outline): number => Math.max(...points(outline).map(([x, y]) => Math.abs(Math.hypot(x - 50, y - 50) - 50)));

describe('the pebble', () => {
  it('fills its box, touching every side', () => {
    for (let turn = 0; turn < PEBBLE_TURNS; turn += 1) {
      const all = points(pebbleSegments(turn));
      expect(Math.min(...all.map(p => p[0]))).toBeCloseTo(0, 0);
      expect(Math.max(...all.map(p => p[0]))).toBeCloseTo(100, 0);
      expect(Math.min(...all.map(p => p[1]))).toBeCloseTo(0, 0);
      expect(Math.max(...all.map(p => p[1]))).toBeCloseTo(100, 0);
    }
  });

  it('turns four ways, so neighbours differ', () => {
    const paths = new Set([0, 1, 2, 3].map(turn => pebblePath(100, 100, turn)));
    expect(paths.size).toBe(4);
    expect(pebbleTurn(5)).toBe(1);
    expect(pebbleTurn(-1)).toBe(3);
  });

  it('is a stone, not a circle, and gives toward one when pressed, through the same pieces', () => {
    const rest = pebbleSegments(0);
    const pressed = pebbleSegments(0, 1);
    expect(unevenness(rest)).toBeGreaterThan(2);
    expect(unevenness(pressed)).toBeLessThan(unevenness(rest) * 0.6);
    expect(pressed.segments.length).toBe(rest.segments.length);
    // Half-pressed lies between the two.
    const half = pebbleSegments(0, 0.5).segments[0]!;
    expect(half[4]).toBeCloseTo((rest.segments[0]![4] + pressed.segments[0]![4]) / 2, 6);
  });

  it('writes CSS shapes with the same commands at rest and pressed, so they animate', () => {
    const rest = pebbleShape(1);
    const pressed = pebbleShape(1, 1);
    expect(rest.startsWith('shape(from ')).toBe(true);
    expect(rest.endsWith(', close)')).toBe(true);
    const commands = (css: string): string => css.replace(/-?[\d.]+%/g, '#');
    expect(commands(rest)).toBe(commands(pressed));
  });

  it('packs the start and six numbers per piece for the phone', () => {
    expect(pebbleNumbers(2).length).toBe(2 + 6 * pebbleSegments(2).segments.length);
  });
});
