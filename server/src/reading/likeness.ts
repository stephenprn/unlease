/**
 * Whether two of a page's pictures are one picture. A page names its picture several times (its
 * og:image, its twitter:image, its structured data, the article's own <img>), each at its own size,
 * crop or encoding, and YouTube's oEmbed thumbnail is the video's frame in 4:3 with black bars. Two
 * ways to tell, the cheap one first:
 *
 * - by address (`pictureKeys`): the same file at several sizes (`photo.jpg?w=650`), or one distinctive
 *   file name under an image service's resizing path (`…/1500x843/2026/11/03/6ae9eff3d693e355452870.jpg`,
 *   WordPress's `livret-a-1200x630.jpg`), so a copy is never even downloaded;
 * - by sight (`likenessOf`, `sameLikeness`): the picture flattened on white and trimmed of the bars or
 *   margin around it, as a small grid of colours. Two are one when they match cell for cell: whole,
 *   one as a crop of the other (any slice of it at the other's proportion), or two crops of one photo
 *   a little apart.
 */
import sharp from 'sharp';

/** The longest edge of the small copy a picture is compared on. */
const EDGE = 96;
/** The grid two pictures are compared on, cells a side. */
const GRID = 16;
/** How far a colour may stray from the border's and still be trimmed (letterbox bars, a white margin). */
const TRIM_THRESHOLD = 24;
/** One picture: its cells differ by at most this on average (of 255)… */
const MEAN_LIMIT = 8;
/** …and this share of cells differs by more than `FAR` (re-encoding never moves a cell that much). */
const FAR = 32;
const FAR_SHARE = 0.03;
/** Crops further apart in proportion than this are not compared (a banner and a square). */
const RATIO_LIMIT = 2;
/** Where a crop may lie along the side it was cut from: the start, the centre, the end and between. */
const SLIDES = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
/** How far apart two crops of one photo may lie, as a share of their side. */
const SHIFTS = [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15];

export interface Likeness {
  /** The small copy, RGB, `width` by `height` (its longest edge `EDGE`). */
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  /** The picture's own pixels, bars and margin trimmed, at the size it was kept: of two copies, the larger is the better. */
  readonly area: number;
}

/** The picture (its bytes or its file) as it is compared, or null when sharp cannot read it. */
export async function likenessOf(image: Buffer | string): Promise<Likeness | null> {
  try {
    const flat = await sharp(image).flatten({ background: '#ffffff' }).raw().toBuffer({ resolveWithObject: true });
    const raw = { raw: { width: flat.info.width, height: flat.info.height, channels: flat.info.channels } } as const;
    const trimmed = await sharp(flat.data, raw).trim({ threshold: TRIM_THRESHOLD }).raw().toBuffer({ resolveWithObject: true });
    const small = await sharp(trimmed.data, { raw: { width: trimmed.info.width, height: trimmed.info.height, channels: trimmed.info.channels } })
      .resize(EDGE, EDGE, { fit: 'inside' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (small.info.channels !== 3) return null;
    return { width: small.info.width, height: small.info.height, pixels: new Uint8Array(small.data), area: trimmed.info.width * trimmed.info.height };
  } catch {
    return null;
  }
}

/** A region of a small copy, in its pixels. */
interface Region {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const whole = (picture: Likeness): Region => ({ x: 0, y: 0, width: picture.width, height: picture.height });

/** The region's colours on the grid: each cell the average of the pixels it covers (partly covered ones in part). */
function cells(picture: Likeness, region: Region): Float64Array {
  const out = new Float64Array(GRID * GRID * 3);
  for (let gy = 0; gy < GRID; gy += 1) {
    const top = region.y + (gy * region.height) / GRID;
    const bottom = region.y + ((gy + 1) * region.height) / GRID;
    for (let gx = 0; gx < GRID; gx += 1) {
      const left = region.x + (gx * region.width) / GRID;
      const right = region.x + ((gx + 1) * region.width) / GRID;
      let r = 0;
      let g = 0;
      let b = 0;
      let weight = 0;
      for (let y = Math.floor(top); y < Math.min(Math.ceil(bottom), picture.height); y += 1) {
        const wy = Math.min(bottom, y + 1) - Math.max(top, y);
        if (wy <= 0) continue;
        for (let x = Math.floor(left); x < Math.min(Math.ceil(right), picture.width); x += 1) {
          const wx = Math.min(right, x + 1) - Math.max(left, x);
          if (wx <= 0) continue;
          const at = (y * picture.width + x) * 3;
          const w = wx * wy;
          r += picture.pixels[at]! * w;
          g += picture.pixels[at + 1]! * w;
          b += picture.pixels[at + 2]! * w;
          weight += w;
        }
      }
      const cell = (gy * GRID + gx) * 3;
      if (weight > 0) {
        out[cell] = r / weight;
        out[cell + 1] = g / weight;
        out[cell + 2] = b / weight;
      }
    }
  }
  return out;
}

/** Whether two regions show the same thing, cell for cell. */
function alike(a: Likeness, ra: Region, b: Likeness, rb: Region): boolean {
  if (ra.width < 2 || ra.height < 2 || rb.width < 2 || rb.height < 2) return false;
  const ca = cells(a, ra);
  const cb = cells(b, rb);
  let total = 0;
  let far = 0;
  for (let cell = 0; cell < GRID * GRID; cell += 1) {
    const at = cell * 3;
    const difference = (Math.abs(ca[at]! - cb[at]!) + Math.abs(ca[at + 1]! - cb[at + 1]!) + Math.abs(ca[at + 2]! - cb[at + 2]!)) / 3;
    total += difference;
    if (difference > FAR) far += 1;
  }
  return total / (GRID * GRID) <= MEAN_LIMIT && far / (GRID * GRID) <= FAR_SHARE;
}

/** The slices of `picture` at proportion `ratio` (width over height): across its whole width or height, along the other side. */
function slices(picture: Likeness, ratio: number): Region[] {
  const own = picture.width / picture.height;
  if (own > ratio) {
    const width = picture.height * ratio;
    return SLIDES.map(at => ({ x: (picture.width - width) * at, y: 0, width, height: picture.height }));
  }
  const height = picture.width / ratio;
  return SLIDES.map(at => ({ x: 0, y: (picture.height - height) * at, width: picture.width, height }));
}

/** Whether `inner` is a crop of `outer`: some slice of it at the inner one's proportion. */
function cropOf(inner: Likeness, outer: Likeness): boolean {
  return slices(outer, inner.width / inner.height).some(region => alike(inner, whole(inner), outer, region));
}

/** Whether two pictures of nearly one proportion are two crops of one photo, a little apart (its top and its centre). */
function shifted(a: Likeness, b: Likeness): boolean {
  for (const dx of SHIFTS) {
    for (const dy of SHIFTS) {
      if (dx === 0 && dy === 0) continue;
      const ra = { x: Math.max(0, dx) * a.width, y: Math.max(0, dy) * a.height, width: (1 - Math.abs(dx)) * a.width, height: (1 - Math.abs(dy)) * a.height };
      const rb = { x: Math.max(0, -dx) * b.width, y: Math.max(0, -dy) * b.height, width: (1 - Math.abs(dx)) * b.width, height: (1 - Math.abs(dy)) * b.height };
      if (alike(a, ra, b, rb)) return true;
    }
  }
  return false;
}

/** Whether two pictures are one: resized, re-encoded, letterboxed, or cut to another proportion. */
export function sameLikeness(a: Likeness, b: Likeness): boolean {
  const ra = a.width / a.height;
  const rb = b.width / b.height;
  const apart = Math.max(ra, rb) / Math.min(ra, rb);
  if (apart > RATIO_LIMIT) return false;
  if (apart < 1.02) return alike(a, whole(a), b, whole(b)) || shifted(a, b);
  return cropOf(a, b) || cropOf(b, a);
}

const RASTER = /\.(?:jpe?g|png|webp|avif|gif)$/i;
/** A size in a file name: `1200x630`, `@2x`, WordPress's `scaled`. */
const SIZE_IN_NAME = /(?:^|[-_.@])(?:\d{2,5}x\d{2,5}|\d(?:\.\d)?x|scaled)(?=$|[-_.])/gi;

/**
 * What names a picture's file, so the same file at another size is known before it is downloaded:
 * its path (query left out) when it ends as a picture does, and its file name without its size when
 * that name is distinctive (twelve characters or more, three digits among them: never `image.jpg`
 * nor `large.png`, which many pictures share).
 */
export function pictureKeys(url: string): string[] {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [url];
  }
  const keys = [url];
  if (RASTER.test(parsed.pathname)) keys.push(`path:${parsed.origin}${parsed.pathname}`);
  let name = parsed.pathname.split('/').filter(Boolean).pop() ?? '';
  try {
    name = decodeURIComponent(name);
  } catch {
    // Kept as written.
  }
  const stem = name
    .toLowerCase()
    .replace(RASTER, '')
    .replace(SIZE_IN_NAME, '')
    .replace(/^[-_.]+|[-_.]+$/g, '');
  if (stem.length >= 12 && (stem.match(/\d/g)?.length ?? 0) >= 3) keys.push(`name:${stem}`);
  return keys;
}

interface Kept<T> {
  item: T;
  likeness: Likeness | null;
  readonly keys: Set<string>;
}

/**
 * The pictures of one link, each once, in the order offered: a copy of one already kept is left
 * out, or takes its place when it is larger (YouTube's frame without its bars over the 4:3
 * thumbnail), so the first stays first.
 */
export class DistinctPictures<T> {
  private readonly kept: Kept<T>[] = [];

  /** Whether this address names a file already kept (at another size): no need to download it. */
  knows(url: string): boolean {
    const keys = pictureKeys(url);
    return this.kept.some(kept => keys.some(key => kept.keys.has(key)));
  }

  /** Keeps the picture unless it is one already kept; true when it was kept. */
  offer(item: T, likeness: Likeness | null, url: string | null = null): boolean {
    const keys = url ? pictureKeys(url) : [];
    const twin = this.kept.find(kept => keys.some(key => kept.keys.has(key)) || (likeness && kept.likeness && sameLikeness(kept.likeness, likeness)));
    if (!twin) {
      this.kept.push({ item, likeness, keys: new Set(keys) });
      return true;
    }
    for (const key of keys) twin.keys.add(key);
    if (likeness && twin.likeness && likeness.area > twin.likeness.area * 1.2) {
      twin.item = item;
      twin.likeness = likeness;
      return true;
    }
    return false;
  }

  get size(): number {
    return this.kept.length;
  }

  get items(): T[] {
    return this.kept.map(kept => kept.item);
  }
}
