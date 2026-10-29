import { groundPaint, type GroundPaint } from '../appearance';
import { GROUNDS, parseHex } from '../palette';
import { coverage, createRaster, drawGround, fillPath, pathPolygons, type Raster } from '../raster';

const PLAIN = { scale: 1, x: 0, y: 0 };

const rgba = ({ width, pixels }: Raster, x: number, y: number): number[] => [...pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)];

describe('paths', () => {
  it('fill a shape’s inside, leave its outside, and share a pixel its edge crosses', () => {
    const cover = coverage(pathPolygons('M2 2H6.5V6H2Z', PLAIN), 10, 10, 'nonzero');
    expect(cover[3 * 10 + 3]).toBeCloseTo(1);
    expect(cover[3 * 10 + 6]).toBeCloseTo(0.5);
    expect(cover[3 * 10 + 8]).toBeCloseTo(0);
    expect(cover[1 * 10 + 3]).toBeCloseTo(0);
  });

  it('cut a hole even-odd, which non-zero fills', () => {
    const square = pathPolygons('M0 0H10V10H0ZM3 3H7V7H3Z', PLAIN);
    expect(coverage(square, 10, 10, 'evenodd')[5 * 10 + 5]).toBeCloseTo(0);
    expect(coverage(square, 10, 10, 'nonzero')[5 * 10 + 5]).toBeCloseTo(1);
  });

  it('draw arcs and curves on their line', () => {
    // A circle of radius 20 in two arcs, and the same circle's quarters as cubic curves.
    const arcs = coverage(pathPolygons('M5 25A20 20 0 0 1 45 25A20 20 0 0 1 5 25Z', PLAIN), 50, 50, 'nonzero');
    const k = 20 * 0.5523;
    const cubics = coverage(pathPolygons(`M45 25C45 ${25 + k} ${25 + k} 45 25 45C${25 - k} 45 5 ${25 + k} 5 25C5 ${25 - k} ${25 - k} 5 25 5C${25 + k} 5 45 ${25 - k} 45 25Z`, PLAIN), 50, 50, 'nonzero');
    for (const cover of [arcs, cubics]) expect(cover.reduce((sum, value) => sum + value, 0)).toBeCloseTo(Math.PI * 400, -1);
  });

  it('lay a colour over what is there', () => {
    const picture = createRaster(4, 1);
    fillPath(picture, 'M0 0H2V1H0Z', PLAIN, '#FF0000');
    fillPath(picture, 'M1 0H3V1H1Z', PLAIN, '#0000FF');
    expect([0, 1, 2, 3].map(x => rgba(picture, x, 0))).toEqual([
      [255, 0, 0, 255],
      [0, 0, 255, 255],
      [0, 0, 255, 255],
      [0, 0, 0, 0],
    ]);
  });

  it('refuse a command they do not draw', () => {
    expect(() => pathPolygons('M0 0l10 10', PLAIN)).toThrow();
  });
});

describe('the ground', () => {
  it('runs from its top to its foot as the screens paint it', async () => {
    const picture = createRaster(4, 400);
    await drawGround(picture, groundPaint({ kind: 'preset', key: 'carnet' }, 'light'), null);
    for (const [y, color] of [
      [0, GROUNDS.light.top],
      [399, GROUNDS.light.bottom],
    ] as const) {
      const found = rgba(picture, 2, y);
      parseHex(color).forEach((value, channel) => expect(Math.abs(found[channel]! - value)).toBeLessThanOrEqual(1));
      expect(found[3]).toBe(255);
    }
  });

  it('pools a cloud full at its centre and gone past its reach', async () => {
    const paint: GroundPaint = {
      base: '#FFFFFF',
      top: '#FFFFFF',
      bottom: '#FFFFFF',
      layers: [],
      colors: [],
      gradients: [
        {
          kind: 'radial',
          x: 0.5,
          y: 0.5,
          stops: [
            { color: '#FF0000', alpha: 1, at: 0 },
            { color: '#FF0000', alpha: 0, at: 0.5 },
          ],
        },
      ],
    };
    const picture = createRaster(101, 101);
    await drawGround(picture, paint, null);
    expect(rgba(picture, 50, 50)).toEqual([255, 0, 0, 255]);
    expect(rgba(picture, 0, 0)).toEqual([255, 255, 255, 255]);
  });

  it('lays the same grain from the same seed, lighter and darker, each grain two pixels square', async () => {
    const paint = groundPaint({ kind: 'preset', key: 'pierre' }, 'light');
    const grain = { sigma: 13, size: 2, seed: 7 };
    const [one, two, other, plain] = [createRaster(200, 100), createRaster(200, 100), createRaster(200, 100), createRaster(200, 100)];
    await drawGround(one, paint, grain);
    await drawGround(two, paint, grain);
    await drawGround(other, paint, { ...grain, seed: 8 });
    await drawGround(plain, paint, null);
    const bytes = (picture: Raster): Uint8Array => new Uint8Array(picture.pixels.buffer);
    expect(Buffer.compare(bytes(one), bytes(two))).toBe(0);
    expect(Buffer.compare(bytes(one), bytes(other))).not.toBe(0);
    let lighter = 0;
    let darker = 0;
    for (let at = 0; at < one.pixels.length; at += 4) {
      if (one.pixels[at]! > plain.pixels[at]!) lighter += 1;
      if (one.pixels[at]! < plain.pixels[at]!) darker += 1;
    }
    expect(lighter).toBeGreaterThan(1000);
    expect(darker).toBeGreaterThan(1000);
    expect(rgba(one, 0, 0)).toEqual(rgba(one, 1, 1));
  });

  it('gives way as it goes, when asked', async () => {
    let pauses = 0;
    await drawGround(createRaster(8, 200), groundPaint({ kind: 'preset', key: 'nacre' }, 'light'), null, async () => {
      pauses += 1;
    });
    expect(pauses).toBe(3);
  });
});
