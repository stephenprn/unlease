/**
 * Image handling with sharp. Formats are recognised by their magic bytes, not
 * by what the sender claims, so the server only ever stores and serves real
 * raster images (never SVG, whose scripts would run on the API's origin).
 */
import sharp, { type Metadata } from 'sharp';

export class UnsupportedImageError extends Error {}

const DISPLAY_EDGE = 1600;
const LINK_EDGE = 1200;
const LINK_MIN_EDGE = 120;
/** About 7000 x 7000: enough for any photo on a web page, small enough to refuse a decompression bomb. */
const LINK_MAX_PIXELS = 50_000_000;

const ascii = (data: Uint8Array, start: number, end: number): string =>
  String.fromCharCode(...data.subarray(start, end));

/** The formats an attachment may have (see the core schema), from the first bytes. */
export function sniffImageMime(data: Uint8Array): string | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 8 && ascii(data, 1, 4) === 'PNG' && data[0] === 0x89) return 'image/png';
  if (data.length >= 6 && ascii(data, 0, 4) === 'GIF8') return 'image/gif';
  if (data.length >= 12 && ascii(data, 0, 4) === 'RIFF' && ascii(data, 8, 12) === 'WEBP') return 'image/webp';
  if (data.length >= 12 && ascii(data, 4, 8) === 'ftyp') {
    const brand = ascii(data, 8, 12);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
  }
  return null;
}

export interface ProcessedUpload {
  readonly mime: string;
  /** As displayed, after EXIF rotation. */
  readonly width: number;
  readonly height: number;
  /** WebP for display, or null when this server cannot decode the format (HEIC): the original is shown instead. */
  readonly display: Buffer | null;
}

export async function processUpload(input: Buffer): Promise<ProcessedUpload> {
  const sniffed = sniffImageMime(input);
  if (!sniffed) throw new UnsupportedImageError('not a JPEG, PNG, WebP, GIF, HEIC or AVIF image');
  let meta: Metadata | null = null;
  try {
    meta = await sharp(input, { failOn: 'error' }).metadata();
  } catch {
    meta = null;
  }
  const mime = sniffed === 'image/heic' && meta?.compression === 'av1' ? 'image/avif' : sniffed;
  try {
    const animated = (meta?.pages ?? 1) > 1;
    const source = sharp(input, { failOn: 'error', animated });
    const { data } = await (animated ? source : source.rotate())
      .resize({ width: DISPLAY_EDGE, height: DISPLAY_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    const width = meta?.autoOrient?.width ?? meta?.width ?? 0;
    const height = animated ? (meta?.pageHeight ?? meta?.height ?? 0) : (meta?.autoOrient?.height ?? meta?.height ?? 0);
    return { mime, width, height, display: data };
  } catch {
    // sharp's prebuilt libvips has no HEVC decoder: keep the bytes and let the phone show the original.
    if (mime === 'image/heic' || mime === 'image/avif') {
      return { mime, width: meta?.width ?? 0, height: meta?.height ?? 0, display: null };
    }
    throw new UnsupportedImageError('the image could not be decoded');
  }
}

export interface LinkImage {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
}

/** A page's image, kept as WebP. Null for anything too small, undecodable or not a raster image. */
export async function processLinkImage(input: Buffer): Promise<LinkImage | null> {
  if (!sniffImageMime(input)) return null;
  try {
    const options = { failOn: 'error', limitInputPixels: LINK_MAX_PIXELS } as const;
    const meta = await sharp(input, options).metadata();
    const width = meta.autoOrient?.width ?? meta.width ?? 0;
    const height = meta.autoOrient?.height ?? meta.height ?? 0;
    if (Math.min(width, height) < LINK_MIN_EDGE) return null;
    const { data, info } = await sharp(input, options)
      .rotate()
      .resize({ width: LINK_EDGE, height: LINK_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    return null;
  }
}
