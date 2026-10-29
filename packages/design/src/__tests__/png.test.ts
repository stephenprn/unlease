import { crc32 as zlibCrc32, inflateRawSync } from 'node:zlib';

import { crc32, deflate, icoFile, pngFile } from '../png';
import { createRaster, type Raster } from '../raster';
import { decodePng } from './decode';

/** The same pseudo-random bytes every run. */
function noise(count: number, seed: number): Uint8Array {
  let state = seed;
  return Uint8Array.from({ length: count }, () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state >>> 16;
  });
}

function raster(width: number, height: number, value: (x: number, y: number, channel: number) => number): Raster {
  const made = createRaster(width, height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) for (let channel = 0; channel < 4; channel += 1) made.pixels[(y * width + x) * 4 + channel] = value(x, y, channel);
  return made;
}

describe('the PNG writer', () => {
  it('sums as zlib does', () => {
    for (const bytes of [new Uint8Array(0), noise(1, 1), noise(5000, 2)]) expect(crc32(bytes)).toBe(zlibCrc32(bytes));
  });

  it('deflates what zlib inflates back: noise, runs longer than a match, repeats near and far', () => {
    const repeated = noise(3000, 3);
    const cases = [
      new Uint8Array(0),
      noise(1, 4),
      noise(70_000, 5),
      new Uint8Array(100_000).fill(7),
      Uint8Array.from({ length: 90_000 }, (_, i) => repeated[i % repeated.length]!),
      // A pattern met again past the 32 KiB window.
      Uint8Array.from({ length: 80_000 }, (_, i) => (i % 40_000 < 500 ? i % 11 : (i * 31) & 255)),
    ];
    for (const data of cases) expect(Buffer.compare(inflateRawSync(deflate(data)), data)).toBe(0);
  });

  it('gives back every pixel, each row’s filter undone', () => {
    const noisy = noise(37 * 23 * 4, 6);
    const cases = [
      raster(37, 23, (x, y, channel) => noisy[(y * 37 + x) * 4 + channel]!),
      raster(64, 48, (x, y, channel) => (channel === 3 ? 255 : (x * 4 + y * 2 + channel * 60) & 255)),
      createRaster(5, 5),
      raster(1, 1, () => 200),
    ];
    for (const picture of cases) {
      const decoded = decodePng(pngFile(picture));
      expect([decoded.width, decoded.height]).toEqual([picture.width, picture.height]);
      expect(Buffer.compare(decoded.pixels, new Uint8Array(picture.pixels.buffer))).toBe(0);
    }
  });

  it('shrinks what is flat, as a mark on nothing is', () => {
    expect(pngFile(createRaster(256, 256)).length).toBeLessThan(2000);
  });
});

describe('the ICO writer', () => {
  it('holds each size’s PNG where its directory says', () => {
    const images = [16, 32, 48].map(size => ({ size, png: pngFile(createRaster(size, size)) }));
    const ico = icoFile(images);
    const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
    expect([view.getUint16(0, true), view.getUint16(2, true), view.getUint16(4, true)]).toEqual([0, 1, 3]);
    images.forEach(({ size, png }, index) => {
      const entry = 6 + index * 16;
      expect([ico[entry], ico[entry + 1], view.getUint16(entry + 4, true), view.getUint16(entry + 6, true)]).toEqual([size, size, 1, 32]);
      const offset = view.getUint32(entry + 12, true);
      expect(Buffer.compare(ico.subarray(offset, offset + view.getUint32(entry + 8, true)), png)).toBe(0);
    });
  });
});
