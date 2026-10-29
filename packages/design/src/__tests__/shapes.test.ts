import { OUTLINES, outlinePath } from '../outline';
import { CORNER_CAP, RADII, SHAPES, SMOOTHING, concentric, cssCorners, squircleSegments, type Corners, type Outline } from '../shapes';

type Point = [number, number];

/** The outline flattened into a polygon, `steps` points per cubic piece. */
function polygon({ start, segments }: Outline, steps = 16): Point[] {
  const points: Point[] = [];
  let [x0, y0] = start;
  for (const [x1, y1, x2, y2, x, y] of segments) {
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const u = 1 - t;
      points.push([u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y]);
    }
    x0 = x;
    y0 = y;
  }
  return points;
}

/** Where a corner's curve crosses the box's diagonal through that corner: how far in from the corner it runs. */
function cornerDepth(outline: Outline): number {
  // The top-left corner: the polygon point nearest the line y = x.
  const near = polygon(outline, 64).filter(([x, y]) => x < 60 && y < 60).sort((a, b) => Math.abs(a[0] - a[1]) - Math.abs(b[0] - b[1]))[0]!;
  return near[0];
}

const SIZES: Point[] = [
  [190, 74],
  [190, 300],
  [388, 138],
  [120, 48],
  [44, 44],
  [76, 95],
  [400, 900],
];

describe('shapes', () => {
  it('gives each role one shape from the scale, the same at every size', () => {
    // The scale, and the one shape derived from it: a segment, concentric 4 inside its track.
    const scale = new Set<number>([...Object.values(RADII), concentric(RADII.bar, 4), 0]);
    for (const corners of Object.values(SHAPES)) for (const value of corners) if (typeof value === 'number') expect(scale.has(value)).toBe(true);
    // Every container's four corners are the same, but where it stands on a screen edge.
    expect(new Set(SHAPES.card).size).toBe(1);
    expect(SHAPES.sheet).toEqual([RADII.dialog, RADII.dialog, 0, 0]);
    expect(OUTLINES.sideSheet).toEqual([RADII.dialog, 0, 0, RADII.dialog]);
  });

  it('nests shapes concentrically', () => {
    expect(concentric(RADII.menu, 6)).toBe(RADII.row);
    expect(concentric(RADII.bar, 4)).toBeGreaterThanOrEqual(RADII.small);
    expect(concentric(12, 14)).toBe(0);
    expect(concentric(12, 14, 4)).toBe(4);
  });

  it('writes CSS radii, one value when they agree', () => {
    expect(cssCorners(SHAPES.card)).toBe(`${RADII.card}px`);
    expect(cssCorners(SHAPES.sheet)).toBe(`${RADII.dialog}px ${RADII.dialog}px 0 0`);
    expect(cssCorners(SHAPES.dot)).toBe('50%');
  });

  it('draws a closed outline that stays inside its box and touches every side', () => {
    for (const [width, height] of SIZES) {
      for (const corners of [SHAPES.card, SHAPES.button, SHAPES.sheet, OUTLINES.sideSheet] as Corners[]) {
        const outline = squircleSegments(width, height, corners);
        const last = outline.segments[outline.segments.length - 1]!;
        expect(last[4]).toBeCloseTo(outline.start[0], 6);
        expect(last[5]).toBeCloseTo(outline.start[1], 6);
        const points = polygon(outline);
        for (const [x, y] of points) {
          expect(x).toBeGreaterThanOrEqual(-1e-6);
          expect(y).toBeGreaterThanOrEqual(-1e-6);
          expect(x).toBeLessThanOrEqual(width + 1e-6);
          expect(y).toBeLessThanOrEqual(height + 1e-6);
        }
        expect(Math.min(...points.map(p => p[1]))).toBeCloseTo(0, 3);
        expect(Math.max(...points.map(p => p[0]))).toBeCloseTo(width, 3);
        expect(Math.max(...points.map(p => p[1]))).toBeCloseTo(height, 3);
        expect(Math.min(...points.map(p => p[0]))).toBeCloseTo(0, 3);
      }
    }
  });

  it('is smooth: no kink between pieces, and each corner leaves its side with no curvature', () => {
    for (const [width, height] of SIZES) {
      for (const corners of [SHAPES.card, SHAPES.button, SHAPES.panel] as Corners[]) {
        const { start, segments } = squircleSegments(width, height, corners);
        let pen: Point = [start[0], start[1]];
        let before: readonly number[] = segments[segments.length - 1]!;
        for (const piece of segments) {
          // The tangent arriving at the join and the one leaving it agree.
          const ending = [before[4]! - before[2]!, before[5]! - before[3]!];
          const leaving = [piece[0] - pen[0], piece[1] - pen[1]];
          const sizes = Math.hypot(ending[0]!, ending[1]!) * Math.hypot(leaving[0]!, leaving[1]!);
          if (sizes > 1e-9) {
            expect(Math.abs(ending[0]! * leaving[1]! - ending[1]! * leaving[0]!) / sizes).toBeLessThan(1e-6);
            expect(ending[0]! * leaving[0]! + ending[1]! * leaving[1]!).toBeGreaterThan(0);
          }
          before = piece;
          pen = [piece[4], piece[5]];
        }
      }
    }
    // A corner's first piece starts along its side: both its handles lie on the side, so its curvature starts at zero (G2).
    const { segments } = squircleSegments(300, 200, SHAPES.card);
    const firstCorner = segments[1]!;
    expect(firstCorner[1]).toBeCloseTo(0, 9);
    expect(firstCorner[3]).toBeCloseTo(0, 9);
  });

  it('eases into its corner further along the side than a circle would, and runs as deep', () => {
    const r = 40;
    const outline = squircleSegments(400, 400, [r, r, r, r]);
    // The corner starts 1.6 radii from the vertex (smoothing 0.6), where a circle starts at one.
    expect(outline.start[0]).toBeCloseTo((1 + SMOOTHING) * r, 6);
    // On the diagonal it sits a little closer to the vertex than a circle's 0.29 r.
    const depth = cornerDepth(outline);
    expect(depth).toBeGreaterThan(0.2 * r);
    expect(depth).toBeLessThan(0.3 * r);
  });

  it('keeps a control a soft sheet, never a pill: its ends round but not right round', () => {
    for (const [height, corners] of [[48, SHAPES.button], [52, SHAPES.field], [54, SHAPES.search], [44, SHAPES.chip]] as const) {
      const { segments } = squircleSegments(200, height, corners);
      // The right end: the straight piece after the top-right corner's three.
      const before = segments[3]!;
      const side = segments[4]!;
      const run = Math.hypot(side[4] - before[4], side[5] - before[5]);
      expect(side[4]).toBeCloseTo(200, 6);
      expect(run).toBeGreaterThan(1);
      expect(run).toBeLessThan(height / 4);
    }
  });

  it('keeps a one-line note a sheet: no corner takes more than its share of the shorter side', () => {
    const short = squircleSegments(190, 51, SHAPES.card);
    expect(short.start[0]).toBeCloseTo((1 + SMOOTHING) * CORNER_CAP * 51, 6);
    // A taller card keeps its role's radius.
    expect(squircleSegments(190, 120, SHAPES.card).start[0]).toBeCloseTo((1 + SMOOTHING) * RADII.card, 6);
  });

  it('insets concentrically, and grows the same way outwards for a ring', () => {
    const inside = squircleSegments(200, 100, SHAPES.card, 1);
    expect(inside.start).toEqual([1 + (1 + SMOOTHING) * (RADII.card - 1), 1]);
    const ring = squircleSegments(200, 100, SHAPES.card, -4);
    expect(ring.start[1]).toBe(-4);
    expect(outlinePath('card', 200, 100)).toMatch(/^M[\d.]+,0 C/);
    expect(outlinePath('sheet', 200, 100)).toContain('200,100');
  });
});
