/**
 * Pictures as PNG and ICO files, written here so both apps make the same bytes without a library:
 * a PNG holds RGBA rows, each filtered the way that leaves the smallest numbers, deflated with the
 * fixed codes (flat colours and smooth edges shrink well without trees of their own); an ICO holds
 * PNGs. A large photo-like picture is a JPEG instead (`jpeg.ts`).
 */
import type { Raster } from './raster';

/** Bytes appended as they come, the buffer doubled when full. */
export class ByteWriter {
  private buffer: Uint8Array;
  length = 0;

  constructor(size = 1 << 16) {
    this.buffer = new Uint8Array(size);
  }

  private room(more: number): void {
    if (this.length + more <= this.buffer.length) return;
    let size = Math.max(64, this.buffer.length * 2);
    while (size < this.length + more) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.buffer.subarray(0, this.length));
    this.buffer = grown;
  }

  byte(value: number): void {
    this.room(1);
    this.buffer[this.length++] = value;
  }

  bytes(values: ArrayLike<number>): void {
    this.room(values.length);
    this.buffer.set(values, this.length);
    this.length += values.length;
  }

  /** Big-endian, as PNG and JPEG write their numbers. */
  u16(value: number): void {
    this.byte((value >>> 8) & 0xff);
    this.byte(value & 0xff);
  }

  u32(value: number): void {
    this.u16((value >>> 16) & 0xffff);
    this.u16(value & 0xffff);
  }

  /** Little-endian, as ICO writes its numbers. */
  u16le(value: number): void {
    this.byte(value & 0xff);
    this.byte((value >>> 8) & 0xff);
  }

  u32le(value: number): void {
    this.u16le(value & 0xffff);
    this.u16le((value >>> 16) & 0xffff);
  }

  ascii(text: string): void {
    for (let i = 0; i < text.length; i += 1) this.byte(text.charCodeAt(i));
  }

  done(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 a PNG chunk ends with (ISO 3309, as zlib computes it). */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  // zlib's NMAX: the most bytes summed before the sums must be reduced.
  for (let i = 0; i < bytes.length; ) {
    const end = Math.min(bytes.length, i + 5552);
    for (; i < end; i += 1) {
      a += bytes[i]!;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

// Deflate's fixed codes (RFC 1951, 3.2.5 and 3.2.6).
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DISTANCE_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DISTANCE_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

const WINDOW = 32768;
const MIN_MATCH = 3;
const MAX_MATCH = 258;
/** How many earlier places with the same three bytes a match is looked for at. */
const MAX_CHAIN = 64;
const HASH_BITS = 15;

/** A Huffman code is written from its first bit, the stream from each byte's lowest: codes go in reversed. */
function reversed(code: number, bits: number): number {
  let out = 0;
  for (let i = 0; i < bits; i += 1) out |= ((code >>> i) & 1) << (bits - 1 - i);
  return out;
}

/** Each literal or length symbol's fixed code, reversed, and its length. */
const LITERAL_CODES = (() => {
  const codes = new Uint16Array(288);
  const bits = new Uint8Array(288);
  for (let symbol = 0; symbol < 288; symbol += 1) {
    const [code, length] = symbol < 144 ? [0x30 + symbol, 8] : symbol < 256 ? [0x190 + symbol - 144, 9] : symbol < 280 ? [symbol - 256, 7] : [0xc0 + symbol - 280, 8];
    codes[symbol] = reversed(code, length);
    bits[symbol] = length;
  }
  return { codes, bits };
})();

const DISTANCE_CODES = Uint8Array.from({ length: 30 }, (_, code) => reversed(code, 5));

/** Each match length's symbol index (its code is 257 + it). */
const LENGTH_INDEX = (() => {
  const index = new Uint8Array(MAX_MATCH + 1);
  for (let i = 0; i < LENGTH_BASE.length; i += 1) {
    const end = i + 1 < LENGTH_BASE.length ? LENGTH_BASE[i + 1]! : MAX_MATCH + 1;
    for (let length = LENGTH_BASE[i]!; length < end; length += 1) index[length] = i;
  }
  return index;
})();

function distanceIndex(distance: number): number {
  let index = DISTANCE_BASE.length - 1;
  while (DISTANCE_BASE[index]! > distance) index -= 1;
  return index;
}

/** `data` as one deflate block with the fixed codes, each run found again within the last 32 KiB. */
export function deflate(data: Uint8Array): Uint8Array {
  const out = new ByteWriter(Math.max(1024, data.length >>> 2));
  let bitBuffer = 0;
  let bitCount = 0;
  const bits = (value: number, count: number): void => {
    bitBuffer |= value << bitCount;
    bitCount += count;
    while (bitCount >= 8) {
      out.byte(bitBuffer & 0xff);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };
  const literal = (symbol: number): void => bits(LITERAL_CODES.codes[symbol]!, LITERAL_CODES.bits[symbol]!);
  // The one block, the last: BFINAL then BTYPE 01.
  bits(1, 1);
  bits(1, 2);
  const head = new Int32Array(1 << HASH_BITS).fill(-1);
  const previous = new Int32Array(WINDOW);
  const hashAt = (at: number): number => ((data[at]! << 10) ^ (data[at + 1]! << 5) ^ data[at + 2]!) & ((1 << HASH_BITS) - 1);
  const remember = (at: number): void => {
    if (at + MIN_MATCH > data.length) return;
    const hash = hashAt(at);
    previous[at & (WINDOW - 1)] = head[hash]!;
    head[hash] = at;
  };
  let at = 0;
  while (at < data.length) {
    let bestLength = 0;
    let bestDistance = 0;
    if (at + MIN_MATCH <= data.length) {
      const longest = Math.min(MAX_MATCH, data.length - at);
      let candidate = head[hashAt(at)]!;
      for (let chain = 0; candidate >= 0 && at - candidate <= WINDOW && chain < MAX_CHAIN; chain += 1) {
        let length = 0;
        while (length < longest && data[candidate + length] === data[at + length]) length += 1;
        if (length > bestLength) {
          bestLength = length;
          bestDistance = at - candidate;
          if (length === longest) break;
        }
        candidate = previous[candidate & (WINDOW - 1)]!;
      }
    }
    if (bestLength >= MIN_MATCH) {
      const lengthIndex = LENGTH_INDEX[bestLength]!;
      literal(257 + lengthIndex);
      if (LENGTH_EXTRA[lengthIndex]! > 0) bits(bestLength - LENGTH_BASE[lengthIndex]!, LENGTH_EXTRA[lengthIndex]!);
      const distance = distanceIndex(bestDistance);
      bits(DISTANCE_CODES[distance]!, 5);
      if (DISTANCE_EXTRA[distance]! > 0) bits(bestDistance - DISTANCE_BASE[distance]!, DISTANCE_EXTRA[distance]!);
      for (let k = 0; k < bestLength; k += 1) remember(at + k);
      at += bestLength;
    } else {
      literal(data[at]!);
      remember(at);
      at += 1;
    }
  }
  literal(256);
  if (bitCount > 0) out.byte(bitBuffer & 0xff);
  return out.done();
}

/** The zlib stream a PNG's IDAT holds: its two-byte head, the deflated data, its Adler-32. */
function zlib(data: Uint8Array): Uint8Array {
  const out = new ByteWriter(data.length >>> 2);
  out.byte(0x78);
  out.byte(0x9c);
  out.bytes(deflate(data));
  out.u32(adler32(data));
  return out.done();
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** The raster's rows, each after its filter's type: none, sub, up or Paeth, whichever leaves the smallest numbers (libpng's heuristic). */
function filtered({ width, height, pixels }: Raster): Uint8Array {
  const stride = width * 4;
  const out = new Uint8Array((stride + 1) * height);
  const trial = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    let bestSum = Infinity;
    for (const type of [0, 1, 2, 4]) {
      let sum = 0;
      for (let x = 0; x < stride; x += 1) {
        const left = x >= 4 ? pixels[row + x - 4]! : 0;
        const up = y > 0 ? pixels[row - stride + x]! : 0;
        const upLeft = x >= 4 && y > 0 ? pixels[row - stride + x - 4]! : 0;
        const predicted = type === 0 ? 0 : type === 1 ? left : type === 2 ? up : paeth(left, up, upLeft);
        const value = (pixels[row + x]! - predicted) & 0xff;
        trial[x] = value;
        sum += value < 128 ? value : 256 - value;
      }
      if (sum < bestSum) {
        bestSum = sum;
        out[y * (stride + 1)] = type;
        out.set(trial, y * (stride + 1) + 1);
      }
    }
  }
  return out;
}

function chunk(out: ByteWriter, type: string, data: Uint8Array): void {
  const body = new ByteWriter(data.length + 4);
  body.ascii(type);
  body.bytes(data);
  const typed = body.done();
  out.u32(data.length);
  out.bytes(typed);
  out.u32(crc32(typed));
}

/** A raster as a PNG file: 8-bit RGBA, not interlaced. */
export function pngFile(raster: Raster): Uint8Array {
  const out = new ByteWriter(raster.width * raster.height + 1024);
  out.bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const header = new ByteWriter(13);
  header.u32(raster.width);
  header.u32(raster.height);
  // 8 bits per channel, colour type 6 (RGBA), deflate, adaptive filters, no interlace.
  header.bytes([8, 6, 0, 0, 0]);
  chunk(out, 'IHDR', header.done());
  chunk(out, 'IDAT', zlib(filtered(raster)));
  chunk(out, 'IEND', new Uint8Array(0));
  return out.done();
}

/** PNG images of a square at several sizes as one ICO file, as browsers and Windows read a favicon. */
export function icoFile(images: readonly { readonly size: number; readonly png: Uint8Array }[]): Uint8Array {
  const out = new ByteWriter();
  out.u16le(0);
  // Type 1: icons.
  out.u16le(1);
  out.u16le(images.length);
  let offset = 6 + images.length * 16;
  for (const { size, png } of images) {
    // 256 is written 0.
    out.byte(size >= 256 ? 0 : size);
    out.byte(size >= 256 ? 0 : size);
    // No palette, reserved, one plane, 32 bits per pixel.
    out.byte(0);
    out.byte(0);
    out.u16le(1);
    out.u16le(32);
    out.u32le(png.length);
    out.u32le(offset);
    offset += png.length;
  }
  for (const { png } of images) out.bytes(png);
  return out.done();
}
