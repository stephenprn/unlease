/**
 * A photographed page straightened: its four corners (found by the phone's scanner, or placed by
 * hand on the web) mapped onto a rectangle by a homography, the picture resampled through it. Pure
 * arithmetic on RGBA pixels, so the web (a canvas's `ImageData`) and the tests share it; the phone's
 * scanner straightens its pages natively.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Four corners in order: top left, top right, bottom right, bottom left. */
export type Corners = readonly [Point, Point, Point, Point];

/**
 * Four points in any order as corners, clockwise from the top left (y downwards): sorted by their
 * angle about their centre, then turned to start at the one nearest the picture's top left.
 */
export function orderCorners(points: readonly Point[]): Corners {
  if (points.length !== 4) throw new Error('A page has four corners');
  const cx = points.reduce((sum, p) => sum + p.x, 0) / 4;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / 4;
  // With y downwards, a growing angle turns clockwise on screen: left, top, right, bottom.
  const around = [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let first = 0;
  for (let i = 1; i < 4; i++) if (around[i]!.x + around[i]!.y < around[first]!.x + around[first]!.y) first = i;
  const at = (k: number): Point => around[(first + k) % 4]!;
  return [at(0), at(1), at(2), at(3)];
}

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The straightened page's size: as wide as its longer top or bottom edge, as tall as its longer
 * left or right edge, scaled down (its shape kept) when its long side passes `maxLongSide`.
 */
export function outputSize(corners: Corners, maxLongSide?: number): { readonly width: number; readonly height: number } {
  const [tl, tr, br, bl] = corners;
  let width = Math.max(distance(tl, tr), distance(bl, br));
  let height = Math.max(distance(tl, bl), distance(tr, br));
  const long = Math.max(width, height);
  if (maxLongSide !== undefined && long > maxLongSide) {
    width *= maxLongSide / long;
    height *= maxLongSide / long;
  }
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

/** A 3×3 matrix, row by row. */
export type Homography = readonly [number, number, number, number, number, number, number, number, number];

/**
 * The homography taking each of `from` to the same place in `to` (its last entry 1): the 8×8
 * system solved by Gaussian elimination with partial pivoting. null when three of the points are
 * in a line (no such map).
 */
export function homography(from: readonly Point[], to: readonly Point[]): Homography | null {
  if (from.length !== 4 || to.length !== 4) throw new Error('A homography maps four points');
  // For each pair: u = (a x + b y + c) / (g x + h y + 1), v = (d x + e y + f) / (g x + h y + 1).
  const rows: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]!;
    const { x: u, y: v } = to[i]!;
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  const scale = Math.max(1, ...rows.flat().map(Math.abs));
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(rows[r]![col]!) > Math.abs(rows[pivot]![col]!)) pivot = r;
    if (Math.abs(rows[pivot]![col]!) < 1e-12 * scale) return null;
    [rows[col], rows[pivot]] = [rows[pivot]!, rows[col]!];
    const lead = rows[col]!;
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const row = rows[r]!;
      const factor = row[col]! / lead[col]!;
      if (factor === 0) continue;
      for (let k = col; k < 9; k++) row[k]! -= factor * lead[k]!;
    }
  }
  // Gauss-Jordan: each row now holds its unknown alone.
  const h = rows.map((row, col) => row[8]! / row[col]!);
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
}

/** Where `h` takes a point. */
export function project(h: Homography, p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

export interface Pixels {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/**
 * The page within `corners` (as `orderCorners` gives them, in `src`'s pixels) laid onto an `out`
 * rectangle, RGBA: each output pixel's centre is taken back into the photograph and read there
 * between its four nearest pixels (bilinear), the edges held.
 */
export function warp(src: Pixels, corners: Corners, out: { readonly width: number; readonly height: number }): Uint8ClampedArray {
  const { width, height } = out;
  const result = new Uint8ClampedArray(width * height * 4);
  const h = homography(
    [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
    corners,
  );
  if (!h || src.width < 1 || src.height < 1) return result;
  const maxX = src.width - 1;
  const maxY = src.height - 1;
  const data = src.data;
  for (let y = 0; y < height; y++) {
    const oy = y + 0.5;
    for (let x = 0; x < width; x++) {
      const ox = x + 0.5;
      const w = h[6] * ox + h[7] * oy + h[8];
      // Back to pixel indices: a pixel's centre is at +0.5.
      const sx = Math.min(maxX, Math.max(0, (h[0] * ox + h[1] * oy + h[2]) / w - 0.5));
      const sy = Math.min(maxY, Math.max(0, (h[3] * ox + h[4] * oy + h[5]) / w - 0.5));
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(maxX, x0 + 1);
      const y1 = Math.min(maxY, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const a = (y0 * src.width + x0) * 4;
      const b = (y0 * src.width + x1) * 4;
      const c = (y1 * src.width + x0) * 4;
      const d = (y1 * src.width + x1) * 4;
      const at = (y * width + x) * 4;
      for (let k = 0; k < 4; k++) {
        const top = data[a + k]! + (data[b + k]! - data[a + k]!) * fx;
        const bottom = data[c + k]! + (data[d + k]! - data[c + k]!) * fx;
        result[at + k] = top + (bottom - top) * fy;
      }
    }
  }
  return result;
}

/** Where the web's crop starts when no page edges were found: a frame 6% inside the picture. */
export function defaultCorners(width: number, height: number): Corners {
  const mx = width * 0.06;
  const my = height * 0.06;
  return [
    { x: mx, y: my },
    { x: width - mx, y: my },
    { x: width - mx, y: height - my },
    { x: mx, y: height - my },
  ];
}
