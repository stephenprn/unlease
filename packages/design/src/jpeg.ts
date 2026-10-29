/**
 * A large picture as a baseline JPEG, where a PNG of the ground's grain would weigh megabytes: YCbCr,
 * the colour sampled once per two by two pixels, the JPEG standard's own quantization and Huffman
 * tables (annex K) scaled by quality as libjpeg scales them, and AAN's fast cosine transform.
 */
import { ByteWriter } from './png';
import type { Pause, Raster } from './raster';

/** Each zigzag place's index in a block's natural (row by row) order. */
const NATURAL = (() => {
  const order: number[] = [];
  for (let sum = 0; sum < 15; sum += 1) {
    const rows: number[] = [];
    for (let row = Math.max(0, sum - 7); row <= Math.min(sum, 7); row += 1) rows.push(row);
    // Even diagonals run up and to the right, odd ones down and to the left.
    for (const row of sum % 2 === 0 ? rows.reverse() : rows) order.push(row * 8 + (sum - row));
  }
  return order;
})();

/** Each natural index's zigzag place. */
const ZIGZAG = (() => {
  const places = new Array<number>(64);
  NATURAL.forEach((natural, place) => {
    places[natural] = place;
  });
  return places;
})();

// Annex K.1, in natural order.
const LUMA_QUANT = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121,
  120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];
const CHROMA_QUANT = [
  17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99,
];

// Annex K.3: how many codes of each length (1 to 16), then the symbols in code order.
const DC_LUMA = { counts: [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], symbols: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
const DC_CHROMA = { counts: [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], symbols: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
const AC_LUMA = {
  counts: [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d],
  symbols: [
    0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72,
    0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
    0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3,
    0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
    0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
  ],
};
const AC_CHROMA = {
  counts: [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77],
  symbols: [
    0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1,
    0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58,
    0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a,
    0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
    0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
  ],
};

type HuffmanSpec = { readonly counts: readonly number[]; readonly symbols: readonly number[] };

/** Each symbol's code and its length, from the counts per length (the canonical order, annex C). */
function huffmanCodes({ counts, symbols }: HuffmanSpec): { codes: Uint16Array; lengths: Uint8Array } {
  const codes = new Uint16Array(256);
  const lengths = new Uint8Array(256);
  let code = 0;
  let k = 0;
  for (let length = 1; length <= 16; length += 1) {
    for (let i = 0; i < counts[length - 1]!; i += 1) {
      codes[symbols[k]!] = code;
      lengths[symbols[k]!] = length;
      code += 1;
      k += 1;
    }
    code <<= 1;
  }
  return { codes, lengths };
}

/** A quantization table at `quality` (1 to 100), as libjpeg scales the standard one. */
function scaled(table: readonly number[], quality: number): number[] {
  const factor = quality < 50 ? 5000 / quality : 200 - quality * 2;
  return table.map(value => Math.min(255, Math.max(1, Math.floor((value * factor + 50) / 100))));
}

/** AAN's scale for each frequency: the fast transform leaves it in, the quantization divides it out. */
const AAN = [1, 1.387039845, 1.306562965, 1.175875602, 1, 0.785694958, 0.5411961, 0.275899379];

/** Each natural place's multiplier after the transform: one over the quantization step, AAN's scale and the transform's eight. */
function divisors(table: readonly number[]): Float64Array {
  const out = new Float64Array(64);
  for (let row = 0; row < 8; row += 1) for (let col = 0; col < 8; col += 1) out[row * 8 + col] = 1 / (table[row * 8 + col]! * AAN[row]! * AAN[col]! * 8);
  return out;
}

/** The forward cosine transform of an 8 by 8 block in place (AAN, as libjpeg's jfdctflt), then quantized into `out` in zigzag order. */
function transform(block: Float64Array, divisor: Float64Array, out: Int32Array): void {
  for (let pass = 0; pass < 2; pass += 1) {
    // Rows first (each 8 apart, their samples 1 apart), then columns.
    const stride = pass === 0 ? 1 : 8;
    const step = pass === 0 ? 8 : 1;
    for (let line = 0; line < 8; line += 1) {
      const o = line * step;
      const d0 = block[o]!;
      const d1 = block[o + stride]!;
      const d2 = block[o + 2 * stride]!;
      const d3 = block[o + 3 * stride]!;
      const d4 = block[o + 4 * stride]!;
      const d5 = block[o + 5 * stride]!;
      const d6 = block[o + 6 * stride]!;
      const d7 = block[o + 7 * stride]!;
      const tmp0 = d0 + d7;
      const tmp7 = d0 - d7;
      const tmp1 = d1 + d6;
      const tmp6 = d1 - d6;
      const tmp2 = d2 + d5;
      const tmp5 = d2 - d5;
      const tmp3 = d3 + d4;
      const tmp4 = d3 - d4;
      // Even part.
      const tmp10 = tmp0 + tmp3;
      const tmp13 = tmp0 - tmp3;
      const tmp11 = tmp1 + tmp2;
      const tmp12 = tmp1 - tmp2;
      block[o] = tmp10 + tmp11;
      block[o + 4 * stride] = tmp10 - tmp11;
      const z1 = (tmp12 + tmp13) * 0.707106781;
      block[o + 2 * stride] = tmp13 + z1;
      block[o + 6 * stride] = tmp13 - z1;
      // Odd part.
      const odd10 = tmp4 + tmp5;
      const odd11 = tmp5 + tmp6;
      const odd12 = tmp6 + tmp7;
      const z5 = (odd10 - odd12) * 0.382683433;
      const z2 = 0.5411961 * odd10 + z5;
      const z4 = 1.306562965 * odd12 + z5;
      const z3 = odd11 * 0.707106781;
      const z11 = tmp7 + z3;
      const z13 = tmp7 - z3;
      block[o + 5 * stride] = z13 + z2;
      block[o + 3 * stride] = z13 - z2;
      block[o + stride] = z11 + z4;
      block[o + 7 * stride] = z11 - z4;
    }
  }
  for (let i = 0; i < 64; i += 1) {
    const value = block[i]! * divisor[i]!;
    out[ZIGZAG[i]!] = value > 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
  }
}

/** How many rows of blocks (16 pixels each) are written between two pauses. */
const MCU_ROWS_PER_PAUSE = 4;

/** A raster as a baseline JPEG at `quality` (1 to 100); its alpha is ignored (the picture must be opaque). */
export async function jpegFile(raster: Raster, quality: number, pause?: Pause): Promise<Uint8Array> {
  const { width, height, pixels } = raster;
  const lumaTable = scaled(LUMA_QUANT, quality);
  const chromaTable = scaled(CHROMA_QUANT, quality);
  const out = new ByteWriter(Math.max(1 << 16, (width * height) >>> 1));

  out.u16(0xffd8);
  // JFIF 1.01, no density, no thumbnail.
  out.u16(0xffe0);
  out.u16(16);
  out.ascii('JFIF\0');
  out.bytes([1, 1, 0, 0, 1, 0, 1, 0, 0]);
  // Both quantization tables, in zigzag order.
  out.u16(0xffdb);
  out.u16(2 + 65 * 2);
  for (const [id, table] of [lumaTable, chromaTable].entries()) {
    out.byte(id);
    for (let place = 0; place < 64; place += 1) out.byte(table[NATURAL[place]!]!);
  }
  // Baseline frame: luma sampled 2 by 2, both chromas once per MCU.
  out.u16(0xffc0);
  out.u16(17);
  out.byte(8);
  out.u16(height);
  out.u16(width);
  out.byte(3);
  out.bytes([1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  // The four Huffman tables.
  out.u16(0xffc4);
  const specs: readonly (readonly [number, HuffmanSpec])[] = [
    [0x00, DC_LUMA],
    [0x10, AC_LUMA],
    [0x01, DC_CHROMA],
    [0x11, AC_CHROMA],
  ];
  out.u16(2 + specs.reduce((sum, [, spec]) => sum + 17 + spec.symbols.length, 0));
  for (const [id, spec] of specs) {
    out.byte(id);
    out.bytes(spec.counts);
    out.bytes(spec.symbols);
  }
  // The one scan: every component, luma on tables 0, chroma on tables 1.
  out.u16(0xffda);
  out.u16(12);
  out.byte(3);
  out.bytes([1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]);

  const dcLuma = huffmanCodes(DC_LUMA);
  const acLuma = huffmanCodes(AC_LUMA);
  const dcChroma = huffmanCodes(DC_CHROMA);
  const acChroma = huffmanCodes(AC_CHROMA);
  let bitBuffer = 0;
  let bitCount = 0;
  const bits = (value: number, count: number): void => {
    bitBuffer = (bitBuffer << count) | (value & ((1 << count) - 1));
    bitCount += count;
    while (bitCount >= 8) {
      const byte = (bitBuffer >>> (bitCount - 8)) & 0xff;
      out.byte(byte);
      // A 0xFF in the data is followed by a zero, so it is never read as a marker.
      if (byte === 0xff) out.byte(0);
      bitCount -= 8;
    }
    bitBuffer &= (1 << bitCount) - 1;
  };
  const coefficients = new Int32Array(64);
  /** One quantized block: its DC as the difference from the previous one of its component, then runs of zeros and values (annex F.1.2). */
  const encode = (previousDc: number, dc: { codes: Uint16Array; lengths: Uint8Array }, ac: { codes: Uint16Array; lengths: Uint8Array }): number => {
    const value = coefficients[0]!;
    const diff = value - previousDc;
    const size = diff === 0 ? 0 : 32 - Math.clz32(Math.abs(diff));
    bits(dc.codes[size]!, dc.lengths[size]!);
    if (size > 0) bits(diff < 0 ? diff - 1 : diff, size);
    let last = 63;
    while (last > 0 && coefficients[last] === 0) last -= 1;
    let run = 0;
    for (let i = 1; i <= last; i += 1) {
      const coefficient = coefficients[i]!;
      if (coefficient === 0) {
        run += 1;
        continue;
      }
      while (run >= 16) {
        bits(ac.codes[0xf0]!, ac.lengths[0xf0]!);
        run -= 16;
      }
      const length = 32 - Math.clz32(Math.abs(coefficient));
      const symbol = (run << 4) | length;
      bits(ac.codes[symbol]!, ac.lengths[symbol]!);
      bits(coefficient < 0 ? coefficient - 1 : coefficient, length);
      run = 0;
    }
    if (last < 63) bits(ac.codes[0]!, ac.lengths[0]!);
    return value;
  };

  const lumaDivisor = divisors(lumaTable);
  const chromaDivisor = divisors(chromaTable);
  const lumaBlocks = [new Float64Array(64), new Float64Array(64), new Float64Array(64), new Float64Array(64)];
  const cb = new Float64Array(64);
  const cr = new Float64Array(64);
  let dcY = 0;
  let dcCb = 0;
  let dcCr = 0;
  const mcuRows = Math.ceil(height / 16);
  const mcuColumns = Math.ceil(width / 16);
  for (let mcuRow = 0; mcuRow < mcuRows; mcuRow += 1) {
    if (pause && mcuRow > 0 && mcuRow % MCU_ROWS_PER_PAUSE === 0) await pause();
    for (let mcuColumn = 0; mcuColumn < mcuColumns; mcuColumn += 1) {
      cb.fill(0);
      cr.fill(0);
      for (let dy = 0; dy < 16; dy += 1) {
        // Past the picture's edge, its last row and column repeat.
        const y = Math.min(height - 1, mcuRow * 16 + dy);
        for (let dx = 0; dx < 16; dx += 1) {
          const x = Math.min(width - 1, mcuColumn * 16 + dx);
          const at = (y * width + x) * 4;
          const r = pixels[at]!;
          const g = pixels[at + 1]!;
          const b = pixels[at + 2]!;
          lumaBlocks[(dy >> 3) * 2 + (dx >> 3)]![(dy & 7) * 8 + (dx & 7)] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
          // Each chroma sample is the mean of the four pixels it covers (centred on zero: JFIF's 128 taken out).
          const chroma = (dy >> 1) * 8 + (dx >> 1);
          cb[chroma] = cb[chroma]! + (-0.168736 * r - 0.331264 * g + 0.5 * b) / 4;
          cr[chroma] = cr[chroma]! + (0.5 * r - 0.418688 * g - 0.081312 * b) / 4;
        }
      }
      for (const block of lumaBlocks) {
        transform(block, lumaDivisor, coefficients);
        dcY = encode(dcY, dcLuma, acLuma);
      }
      transform(cb, chromaDivisor, coefficients);
      dcCb = encode(dcCb, dcChroma, acChroma);
      transform(cr, chromaDivisor, coefficients);
      dcCr = encode(dcCr, dcChroma, acChroma);
    }
  }
  // The last byte filled with ones.
  if (bitCount > 0) bits((1 << (8 - bitCount)) - 1, 8 - bitCount);
  out.u16(0xffd9);
  return out.done();
}
