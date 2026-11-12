import { CHECK_EDGE, CHECK_EDGE_PATH, CHECK_FILL_PATH, CHECK_GRID, CHECK_TICK, CHECK_TICK_WIDTH, strokeOutline } from '../checkbox';
import { coverage, pathPolygons } from '../raster';

/** The drawing at ten pixels a unit. */
const SCALE = 10;
const SIZE = CHECK_GRID * SCALE;
const cover = (d: string, rule: 'nonzero' | 'evenodd'): Float32Array => coverage(pathPolygons(d, { scale: SCALE, x: 0, y: 0 }), SIZE, SIZE, rule);
const pixel = (map: Float32Array, [x, y]: readonly [number, number]): number => map[Math.floor(y * SCALE) * SIZE + Math.floor(x * SCALE)]!;
const total = (map: Float32Array): number => map.reduce((sum, value) => sum + value, 0) / (SCALE * SCALE);

describe('the checkbox', () => {
  const filled = cover(CHECK_FILL_PATH, 'evenodd');

  it('punches the tick through the filled box, and keeps the rest of the box whole', () => {
    for (const point of CHECK_TICK) expect(pixel(filled, point)).toBeCloseTo(0);
    // Halfway along each arm, on the line.
    expect(pixel(filled, [6.3, 10.6])).toBeCloseTo(0);
    expect(pixel(filled, [10.45, 9.15])).toBeCloseTo(0);
    // Above the foot, inside the bend; below it; the box's middle and its corners' insides.
    for (const point of [[7.7, 8.4], [7.7, 15], [9, 3], [3, 9], [15, 9], [3.5, 3.5], [14.5, 14.5]] as const) expect(pixel(filled, point)).toBeCloseTo(1);
  });

  it('cuts a tick as wide as its line: two arms and their round ends', () => {
    const [a, b, c] = CHECK_TICK as [readonly [number, number], readonly [number, number], readonly [number, number]];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1]);
    const r = CHECK_TICK_WIDTH / 2;
    // Two capsules overlapping at the foot: within the small wedge the round join adds.
    const tick = total(cover(strokeOutline(CHECK_TICK, CHECK_TICK_WIDTH), 'nonzero'));
    expect(tick).toBeGreaterThan(length * CHECK_TICK_WIDTH + Math.PI * r * r - 0.6);
    expect(tick).toBeLessThan(length * CHECK_TICK_WIDTH + Math.PI * r * r + 0.6);
  });

  it('keeps the tick clear of the edge, so the open and checked boxes never touch it', () => {
    const r = CHECK_TICK_WIDTH / 2;
    for (const [x, y] of CHECK_TICK) {
      for (const reach of [x - r, CHECK_GRID - x - r, y - r, CHECK_GRID - y - r]) expect(reach).toBeGreaterThanOrEqual(CHECK_EDGE + 1.5);
    }
  });

  it('draws its edge inside the box: the box is the same size open and checked', () => {
    // The edge's path, stroked, would reach the box's side; it runs half the edge in.
    const edge = cover(CHECK_EDGE_PATH, 'nonzero');
    expect(pixel(edge, [9, CHECK_EDGE / 2 + 0.05])).toBeCloseTo(1);
    expect(pixel(edge, [9, CHECK_EDGE / 2 - 0.15])).toBeCloseTo(0);
    expect(pixel(filled, [9, 0.05])).toBeCloseTo(1);
  });
});
