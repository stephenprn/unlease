import { defaultCorners, homography, orderCorners, outputSize, project, warp, type Corners, type Point } from '../perspective';

const corners: Corners = [
  { x: 112, y: 40 },
  { x: 410, y: 75 },
  { x: 380, y: 470 },
  { x: 60, y: 430 },
];

describe('orderCorners', () => {
  it('orders four points from the top left, clockwise, whatever order they come in', () => {
    const [tl, tr, br, bl] = corners;
    for (const shuffled of [
      [br, tl, bl, tr],
      [bl, br, tr, tl],
      [tr, bl, tl, br],
    ])
      expect(orderCorners(shuffled as Point[])).toEqual(corners);
  });

  it('orders a page turned almost a quarter', () => {
    const turned = [
      { x: 300, y: 10 },
      { x: 590, y: 300 },
      { x: 300, y: 590 },
      { x: 10, y: 290 },
    ];
    expect(orderCorners([turned[2]!, turned[0]!, turned[3]!, turned[1]!])).toEqual([turned[3], turned[0], turned[1], turned[2]]);
  });
});

describe('outputSize', () => {
  it('takes the longer of each pair of edges, and caps the long side keeping the shape', () => {
    const size = outputSize(corners);
    expect(size.width).toBe(Math.round(Math.max(Math.hypot(298, 35), Math.hypot(320, 40))));
    expect(size.height).toBe(Math.round(Math.max(Math.hypot(52, 390), Math.hypot(30, 395))));
    const capped = outputSize(corners, 200);
    expect(Math.max(capped.width, capped.height)).toBe(200);
    expect(capped.width / capped.height).toBeCloseTo(size.width / size.height, 1);
  });
});

describe('homography', () => {
  it('maps the four points exactly', () => {
    const square: Point[] = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 500 },
      { x: 0, y: 500 },
    ];
    const h = homography(square, corners)!;
    expect(h[8]).toBe(1);
    square.forEach((point, i) => {
      const mapped = project(h, point);
      expect(mapped.x).toBeCloseTo(corners[i]!.x, 6);
      expect(mapped.y).toBeCloseTo(corners[i]!.y, 6);
    });
    const back = homography(corners, square)!;
    const round = project(back, project(h, { x: 123, y: 321 }));
    expect(round.x).toBeCloseTo(123, 6);
    expect(round.y).toBeCloseTo(321, 6);
  });

  it('has no answer when three points are in a line', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 0, y: 5 },
    ];
    expect(homography(line, corners)).toBeNull();
  });
});

describe('warp', () => {
  /** A checkerboard of 8 × 8 squares drawn into a quad of a 500 × 500 photograph, as a camera would see it. */
  function photograph(quad: Corners): { data: Uint8ClampedArray; width: number; height: number } {
    const width = 500;
    const height = 500;
    const data = new Uint8ClampedArray(width * height * 4);
    // From the photograph back to the board's unit square.
    const toBoard = homography(quad, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ])!;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const { x: u, y: v } = project(toBoard, { x: x + 0.5, y: y + 0.5 });
        const at = (y * width + x) * 4;
        const inside = u >= 0 && u < 1 && v >= 0 && v < 1;
        const dark = inside && (Math.floor(u * 8) + Math.floor(v * 8)) % 2 === 0;
        data[at] = data[at + 1] = data[at + 2] = inside ? (dark ? 20 : 235) : 128;
        data[at + 3] = 255;
      }
    return { data, width, height };
  }

  it('gives back an axis-aligned checkerboard', () => {
    const src = photograph(corners);
    const out = { width: 320, height: 320 };
    const pixels = warp(src, corners, out);
    expect(pixels).toHaveLength(320 * 320 * 4);
    // Each square's centre: 40 pixels a square.
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 8; col++) {
        const x = col * 40 + 20;
        const y = row * 40 + 20;
        const value = pixels[(y * 320 + x) * 4]!;
        expect(value).toBe((row + col) % 2 === 0 ? 20 : 235);
        expect(pixels[(y * 320 + x) * 4 + 3]).toBe(255);
      }
    // Near the corners, still the board, never the grey around it.
    for (const [x, y] of [
      [3, 3],
      [316, 3],
      [316, 316],
      [3, 316],
    ]) {
      const value = pixels[(y! * 320 + x!) * 4]!;
      expect(Math.abs(value - 128)).toBeGreaterThan(60);
    }
  });

  it('starts the manual crop 6% inside the picture', () => {
    expect(defaultCorners(1000, 500)).toEqual([
      { x: 60, y: 30 },
      { x: 940, y: 30 },
      { x: 940, y: 470 },
      { x: 60, y: 470 },
    ]);
  });
});
