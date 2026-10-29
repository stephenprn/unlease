import { jpegFile } from '../jpeg';
import { createRaster, type Raster } from '../raster';
import { jpegSegments, jpegSize } from './decode';

/** Opaque, smooth with a little noise: photo-like. */
function picture(width: number, height: number): Raster {
  const made = createRaster(width, height);
  let state = 11;
  for (let at = 0; at < made.pixels.length; at += 4) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const x = (at / 4) % width;
    const y = Math.floor(at / 4 / width);
    made.pixels[at] = 40 + (x * 180) / width + ((state >>> 16) % 9);
    made.pixels[at + 1] = 200 - (y * 150) / height;
    made.pixels[at + 2] = 120 + 60 * Math.sin(x / 30);
    made.pixels[at + 3] = 255;
  }
  return made;
}

describe('the JPEG writer', () => {
  it('writes a baseline frame of its size, luma sampled two by two', async () => {
    const jpeg = await jpegFile(picture(203, 117), 92);
    const segments = jpegSegments(jpeg);
    expect(segments.map(segment => segment.marker)).toEqual([0xe0, 0xdb, 0xc0, 0xc4, 0xda, -1]);
    expect(jpegSize(jpeg)).toEqual([203, 117]);
    const frame = segments[2]!.body;
    expect([frame[0], frame[5], ...frame.subarray(6)]).toEqual([8, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  });

  it('never lets its data read as a marker: each 0xFF in it is followed by a zero', async () => {
    const scan = jpegSegments(await jpegFile(picture(160, 96), 100)).at(-1)!.body;
    expect(scan.length).toBeGreaterThan(0);
    for (let at = 0; at < scan.length; at += 1) if (scan[at] === 0xff) expect(scan[at + 1]).toBe(0);
  });

  it('weighs less at a lower quality, its tables scaled as libjpeg scales them', async () => {
    const source = picture(128, 128);
    const low = await jpegFile(source, 50);
    const high = await jpegFile(source, 92);
    expect(low.length).toBeLessThan(high.length);
    // Luma's first step, 16 in the standard's table.
    expect(jpegSegments(low)[1]!.body[1]).toBe(16);
    expect(jpegSegments(high)[1]!.body[1]).toBe(3);
  });

  it('gives way every four rows of blocks, when asked', async () => {
    let pauses = 0;
    await jpegFile(picture(64, 160), 80, async () => {
      pauses += 1;
    });
    // Ten rows of 16 pixels: before the fifth and the ninth.
    expect(pauses).toBe(2);
  });
});
