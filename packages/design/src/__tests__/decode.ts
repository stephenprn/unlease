/** Reads back what `png.ts` and `jpeg.ts` write, for their tests: a PNG's chunks and pixels (with Node's zlib), a JPEG's segments. */
import { crc32, inflateSync } from 'node:zlib';

/** A PNG's chunks in order, each checked against its CRC. */
export function pngChunks(png: Uint8Array): { type: string; data: Uint8Array }[] {
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: { type: string; data: Uint8Array }[] = [];
  for (let at = 8; at < png.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    expect(view.getUint32(at + 8 + length), `${type}'s CRC`).toBe(crc32(png.subarray(at + 4, at + 8 + length)));
    chunks.push({ type, data: png.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
  }
  return chunks;
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** An 8-bit RGBA PNG's size and pixels, each row's filter undone (PNG 9.2). */
export function decodePng(png: Uint8Array): { width: number; height: number; pixels: Uint8Array } {
  const chunks = pngChunks(png);
  expect(chunks[0]!.type).toBe('IHDR');
  expect(chunks.at(-1)!.type).toBe('IEND');
  const header = new DataView(chunks[0]!.data.buffer, chunks[0]!.data.byteOffset, 13);
  const width = header.getUint32(0);
  const height = header.getUint32(4);
  expect([...chunks[0]!.data.subarray(8)]).toEqual([8, 6, 0, 0, 0]);
  const raw = inflateSync(Buffer.concat(chunks.filter(chunk => chunk.type === 'IDAT').map(chunk => chunk.data)));
  const stride = width * 4;
  expect(raw.length).toBe((stride + 1) * height);
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const type = raw[y * (stride + 1)]!;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? pixels[y * stride + x - 4]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const upLeft = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4]! : 0;
      const predicted = type === 0 ? 0 : type === 1 ? left : type === 2 ? up : type === 3 ? (left + up) >> 1 : paeth(left, up, upLeft);
      pixels[y * stride + x] = (raw[y * (stride + 1) + 1 + x]! + predicted) & 0xff;
    }
  }
  return { width, height, pixels };
}

/** A JPEG's segments up to its scan (each marker with its body), then the scan's data as marker -1. */
export function jpegSegments(jpeg: Uint8Array): { marker: number; body: Uint8Array }[] {
  expect([jpeg[0], jpeg[1]]).toEqual([0xff, 0xd8]);
  expect([jpeg.at(-2), jpeg.at(-1)]).toEqual([0xff, 0xd9]);
  const segments: { marker: number; body: Uint8Array }[] = [];
  for (let at = 2; at < jpeg.length; ) {
    expect(jpeg[at]).toBe(0xff);
    const marker = jpeg[at + 1]!;
    const length = (jpeg[at + 2]! << 8) | jpeg[at + 3]!;
    segments.push({ marker, body: jpeg.subarray(at + 4, at + 2 + length) });
    at += 2 + length;
    if (marker === 0xda) {
      segments.push({ marker: -1, body: jpeg.subarray(at, jpeg.length - 2) });
      break;
    }
  }
  return segments;
}

/** A JPEG frame's height and width, from its SOF0. */
export function jpegSize(jpeg: Uint8Array): [width: number, height: number] {
  const frame = jpegSegments(jpeg).find(segment => segment.marker === 0xc0)!.body;
  return [(frame[3]! << 8) | frame[4]!, (frame[1]! << 8) | frame[2]!];
}
