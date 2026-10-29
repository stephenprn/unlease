/**
 * Pictures drawn in memory for the files the apps hand out (`servicePictures.ts`): a box of RGBA
 * pixels, SVG paths filled into it with smooth edges, a ground's gradients and grain laid as the
 * screens lay them. Pure, so the phone and the web make the same bytes.
 */
import { seededRandom, type GradientStop, type GroundPaint } from './appearance';
import { parseHex } from './palette';

/** Straight (not premultiplied) RGBA, row after row from the top. */
export interface Raster {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
}

export function createRaster(width: number, height: number): Raster {
  return { width, height, pixels: new Uint8ClampedArray(width * height * 4) };
}

/** Where a path on its own grid lands in the raster: scaled, then moved. */
export interface Placement {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

/** A closed outline, as x, y pairs in raster pixels. */
type Polygon = number[];

/** About how long each straight piece of a curve is, in pixels: short enough to read as a curve at any size drawn here. */
const CURVE_PIECE = 1.5;

const piecesFor = (length: number): number => Math.min(256, Math.max(4, Math.ceil(length / CURVE_PIECE)));

/** A path's outlines with its curves cut into short lines. Reads the absolute commands the mark is drawn with (M L H V C Q A Z). */
export function pathPolygons(d: string, place: Placement): Polygon[] {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const polygons: Polygon[] = [];
  let current: Polygon = [];
  let index = 0;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let command = '';
  const num = (): number => Number(tokens[index++]);
  const at = (px: number, py: number): void => {
    // Drawing on after a Z starts a new outline where the last one started.
    if (current.length === 0 && command !== 'M') current.push(startX * place.scale + place.x, startY * place.scale + place.y);
    current.push(px * place.scale + place.x, py * place.scale + place.y);
  };
  const close = (): void => {
    if (current.length >= 6) polygons.push(current);
    current = [];
  };
  while (index < tokens.length) {
    // A number where a command is due repeats the last one (M repeats as L).
    if (/^[A-Za-z]$/.test(tokens[index]!)) command = tokens[index++]!;
    else if (command === 'M') command = 'L';
    switch (command) {
      case 'M':
        close();
        x = startX = num();
        y = startY = num();
        at(x, y);
        break;
      case 'L':
        x = num();
        y = num();
        at(x, y);
        break;
      case 'H':
        x = num();
        at(x, y);
        break;
      case 'V':
        y = num();
        at(x, y);
        break;
      case 'C': {
        const [x1, y1, x2, y2, ex, ey] = [num(), num(), num(), num(), num(), num()];
        const pieces = piecesFor((Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(ex - x2, ey - y2)) * place.scale);
        for (let step = 1; step <= pieces; step += 1) {
          const t = step / pieces;
          const u = 1 - t;
          at(u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey);
        }
        x = ex;
        y = ey;
        break;
      }
      case 'Q': {
        const [x1, y1, ex, ey] = [num(), num(), num(), num()];
        const pieces = piecesFor((Math.hypot(x1 - x, y1 - y) + Math.hypot(ex - x1, ey - y1)) * place.scale);
        for (let step = 1; step <= pieces; step += 1) {
          const t = step / pieces;
          const u = 1 - t;
          at(u * u * x + 2 * u * t * x1 + t * t * ex, u * u * y + 2 * u * t * y1 + t * t * ey);
        }
        x = ex;
        y = ey;
        break;
      }
      case 'A': {
        const [rx, ry, rotation, large, sweep, ex, ey] = [num(), num(), num(), num(), num(), num(), num()];
        arc(x, y, rx, ry, rotation, large !== 0, sweep !== 0, ex, ey, place.scale, at);
        x = ex;
        y = ey;
        break;
      }
      case 'Z':
      case 'z':
        x = startX;
        y = startY;
        close();
        break;
      default:
        throw new Error(`Path command ${command} is not drawn here`);
    }
  }
  close();
  return polygons;
}

/** An elliptical arc as points, from its end points to its centre (SVG's own conversion). */
function arc(x1: number, y1: number, rxIn: number, ryIn: number, rotation: number, large: boolean, sweep: boolean, x2: number, y2: number, scale: number, at: (x: number, y: number) => void): void {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) {
    at(x2, y2);
    return;
  }
  const phi = (rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const px = cos * dx + sin * dy;
  const py = -sin * dx + cos * dy;
  const reach = (px * px) / (rx * rx) + (py * py) / (ry * ry);
  if (reach > 1) {
    rx *= Math.sqrt(reach);
    ry *= Math.sqrt(reach);
  }
  const numerator = rx * rx * ry * ry - rx * rx * py * py - ry * ry * px * px;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / (rx * rx * py * py + ry * ry * px * px)));
  const cxp = (coef * rx * py) / ry;
  const cyp = (-coef * ry * px) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const start = Math.atan2((py - cyp) / ry, (px - cxp) / rx);
  let delta = Math.atan2((-py - cyp) / ry, (-px - cxp) / rx) - start;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  const pieces = piecesFor(Math.abs(delta) * Math.max(rx, ry) * scale);
  for (let step = 1; step <= pieces; step += 1) {
    const angle = start + (delta * step) / pieces;
    at(cos * rx * Math.cos(angle) - sin * ry * Math.sin(angle) + cx, sin * rx * Math.cos(angle) + cos * ry * Math.sin(angle) + cy);
  }
}

/** Lines through each pixel row: how finely an edge's slope is shaded. */
const SUBROWS = 16;

/** How much of each pixel the outlines cover (0 to 1): `SUBROWS` lines through each row, each span's ends exact across. */
export function coverage(polygons: readonly Polygon[], width: number, height: number, rule: 'nonzero' | 'evenodd'): Float32Array {
  const cover = new Float32Array(width * height);
  const edges: { x0: number; y0: number; x1: number; y1: number; dir: number }[] = [];
  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i += 2) {
      const j = (i + 2) % polygon.length;
      const [ax, ay, bx, by] = [polygon[i]!, polygon[i + 1]!, polygon[j]!, polygon[j + 1]!];
      if (ay === by) continue;
      edges.push(ay < by ? { x0: ax, y0: ay, x1: bx, y1: by, dir: 1 } : { x0: bx, y0: by, x1: ax, y1: ay, dir: -1 });
    }
  }
  const crossings: { x: number; dir: number }[] = [];
  for (let row = 0; row < height; row += 1) {
    for (let sub = 0; sub < SUBROWS; sub += 1) {
      const sample = row + (sub + 0.5) / SUBROWS;
      crossings.length = 0;
      for (const edge of edges) if (sample >= edge.y0 && sample < edge.y1) crossings.push({ x: edge.x0 + ((sample - edge.y0) * (edge.x1 - edge.x0)) / (edge.y1 - edge.y0), dir: edge.dir });
      if (crossings.length < 2) continue;
      crossings.sort((a, b) => a.x - b.x);
      let winding = 0;
      for (let k = 0; k < crossings.length - 1; k += 1) {
        winding += rule === 'nonzero' ? crossings[k]!.dir : 1;
        const inside = rule === 'nonzero' ? winding !== 0 : winding % 2 === 1;
        if (inside) span(cover, row * width, width, crossings[k]!.x, crossings[k + 1]!.x);
      }
    }
  }
  return cover;
}

/** One line's span from `from` to `to`, a pixel partly covered at each end. */
function span(cover: Float32Array, offset: number, width: number, from: number, to: number): void {
  const left = Math.max(0, from);
  const right = Math.min(width, to);
  if (right <= left) return;
  const first = Math.floor(left);
  const last = Math.min(width - 1, Math.ceil(right) - 1);
  const share = 1 / SUBROWS;
  if (first === last) {
    cover[offset + first]! += (right - left) * share;
    return;
  }
  cover[offset + first]! += (first + 1 - left) * share;
  for (let px = first + 1; px < last; px += 1) cover[offset + px]! += share;
  cover[offset + last]! += (right - last) * share;
}

/** `color` laid over the raster where `cover` says, its own colour over what is there (source over). */
function lay(raster: Raster, cover: Float32Array, color: string): void {
  const [r, g, b] = parseHex(color);
  const { pixels } = raster;
  for (let i = 0; i < cover.length; i += 1) {
    const alpha = Math.min(1, cover[i]!);
    if (alpha <= 0) continue;
    const at = i * 4;
    const under = (pixels[at + 3]! / 255) * (1 - alpha);
    const out = alpha + under;
    pixels[at] = (r * alpha + pixels[at]! * under) / out;
    pixels[at + 1] = (g * alpha + pixels[at + 1]! * under) / out;
    pixels[at + 2] = (b * alpha + pixels[at + 2]! * under) / out;
    pixels[at + 3] = out * 255;
  }
}

/** A path filled in one colour. */
export function fillPath(raster: Raster, d: string, place: Placement, color: string, rule: 'nonzero' | 'evenodd' = 'nonzero'): void {
  lay(raster, coverage(pathPolygons(d, place), raster.width, raster.height, rule), color);
}

/** Lets the work give way now and then (a phone's interface keeps answering while a large picture is made). */
export type Pause = () => Promise<void>;

/** How many rows are painted between two pauses. */
const ROWS_PER_PAUSE = 64;

/** Where `t` falls between a gradient's stops, as premultiplied red, green, blue and the alpha (CSS blends stops premultiplied). */
function stopAt(stops: readonly GradientStop[], channels: readonly (readonly [number, number, number])[], t: number, out: Float64Array): void {
  const lastIndex = stops.length - 1;
  let index = 0;
  while (index < lastIndex && t > stops[index + 1]!.at) index += 1;
  const a = stops[index]!;
  const b = stops[Math.min(index + 1, lastIndex)]!;
  const reach = b.at - a.at;
  const f = t <= a.at || reach <= 0 ? (t <= a.at ? 0 : 1) : Math.min(1, (t - a.at) / reach);
  const ca = channels[index]!;
  const cb = channels[Math.min(index + 1, lastIndex)]!;
  const alpha = a.alpha + (b.alpha - a.alpha) * f;
  out[3] = alpha;
  for (let c = 0; c < 3; c += 1) out[c] = ca[c]! * a.alpha + (cb[c]! * b.alpha - ca[c]! * a.alpha) * f;
}

/** A gradient's stops looked up along its length: 1024 steps is finer than any picture here shows. */
const TABLE_STEPS = 1024;

/** A gradient sampled once along its length (premultiplied colour, then alpha, per step), so painting it is a lookup. */
function gradientTable(stops: readonly GradientStop[]): Float64Array {
  const channels = stops.map(stop => parseHex(stop.color));
  const table = new Float64Array((TABLE_STEPS + 1) * 4);
  const sample = new Float64Array(4);
  for (let step = 0; step <= TABLE_STEPS; step += 1) {
    stopAt(stops, channels, step / TABLE_STEPS, sample);
    table.set(sample, step * 4);
  }
  return table;
}

/** The ground's film grain as the screens lay it: each grain black or white, as many of each, its strength a soft bell (`tools/textures/build_grain.py`). */
export interface Grain {
  /** The spread of the strengths, out of 255. */
  readonly sigma: number;
  /** Pixels a grain covers on each side. */
  readonly size: number;
  readonly seed: number;
}

/** A ground drawn into the whole raster, opaque: its flat colour, its layers (the last one first, as CSS stacks them), then its grain, each grain darkening or lightening what it covers by its own strength. */
export async function drawGround(raster: Raster, paint: GroundPaint, grain: Grain | null, pause?: Pause): Promise<void> {
  const { width, height, pixels } = raster;
  const [baseR, baseG, baseB] = parseHex(paint.base);
  const layers = [...paint.gradients].reverse().map(gradient => ({ gradient, table: gradientTable(gradient.stops) }));
  const row = new Float64Array(width * 3);
  const size = grain?.size ?? 1;
  // One row of grains at a time (each grain's strength, then its tone), drawn as the texture's are.
  const grains = grain ? new Float64Array(Math.ceil(width / size) * 2) : null;
  const draw = seededRandom(grain?.seed ?? 0);
  for (let y = 0; y < height; y += 1) {
    if (pause && y > 0 && y % ROWS_PER_PAUSE === 0) await pause();
    for (let x = 0; x < width * 3; x += 3) {
      row[x] = baseR;
      row[x + 1] = baseG;
      row[x + 2] = baseB;
    }
    const cy = y + 0.5;
    for (const { gradient, table } of layers) {
      if (gradient.kind === 'linear') {
        const step = Math.round(Math.min(1, cy / height) * TABLE_STEPS) * 4;
        const keep = 1 - table[step + 3]!;
        const [r, g, b] = [table[step]!, table[step + 1]!, table[step + 2]!];
        for (let x = 0; x < width * 3; x += 3) {
          row[x] = row[x]! * keep + r;
          row[x + 1] = row[x + 1]! * keep + g;
          row[x + 2] = row[x + 2]! * keep + b;
        }
        continue;
      }
      const centreX = gradient.x * width;
      const centreY = gradient.y * height;
      // `circle` with no size reaches the farthest corner.
      const radius = Math.max(Math.hypot(centreX, centreY), Math.hypot(width - centreX, centreY), Math.hypot(centreX, height - centreY), Math.hypot(width - centreX, height - centreY));
      const scale = TABLE_STEPS / radius;
      const dy2 = (cy - centreY) * (cy - centreY);
      for (let x = 0; x < width; x += 1) {
        const dx = x + 0.5 - centreX;
        const step = Math.min(TABLE_STEPS, Math.round(Math.sqrt(dx * dx + dy2) * scale)) * 4;
        const alpha = table[step + 3]!;
        if (alpha <= 0) continue;
        const keep = 1 - alpha;
        const at = x * 3;
        row[at] = row[at]! * keep + table[step]!;
        row[at + 1] = row[at + 1]! * keep + table[step + 1]!;
        row[at + 2] = row[at + 2]! * keep + table[step + 2]!;
      }
    }
    if (grain && grains) {
      if (y % size === 0) {
        for (let at = 0; at < grains.length; at += 2) {
          // A normal draw (Box and Muller), cut to whole steps of 255 as the texture holds them.
          const bell = Math.sqrt(-2 * Math.log(1 - draw())) * Math.cos(2 * Math.PI * draw());
          grains[at] = Math.min(255, Math.floor(Math.abs(bell * grain.sigma))) / 255;
          grains[at + 1] = draw() < 0.5 ? 255 : 0;
        }
      }
      for (let at = 0, left = 0; left < width; at += 2, left += size) {
        const alpha = grains[at]!;
        if (alpha === 0) continue;
        const tone = grains[at + 1]!;
        for (let x = left * 3, end = Math.min(width, left + size) * 3; x < end; x += 3) {
          row[x] = row[x]! + (tone - row[x]!) * alpha;
          row[x + 1] = row[x + 1]! + (tone - row[x + 1]!) * alpha;
          row[x + 2] = row[x + 2]! + (tone - row[x + 2]!) * alpha;
        }
      }
    }
    for (let x = 0, at = y * width * 4; x < width * 3; x += 3, at += 4) {
      pixels[at] = row[x]!;
      pixels[at + 1] = row[x + 1]!;
      pixels[at + 2] = row[x + 2]!;
      pixels[at + 3] = 255;
    }
  }
}
