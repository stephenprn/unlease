/**
 * Clock's wave: time drawn as something that swells and runs, the app's own illustration beside the
 * suite's pebble (never on a control, never behind words). Never a ruled sine: drawn by a hand, its
 * crests uneven and changing as they go, a ring a little lopsided as a pebble is, a line laid with a
 * brush that lands thin, swells and lifts. The stopwatch's bezel ripples (`organicRing`, `brushRing`),
 * the world clocks ride the day's wave (`dayWaveY`: noon on its crest, midnight in its trough), the
 * ringing windows rise on a choppy sea (`waveBand`). Pure geometry in SVG path data, the same numbers
 * on both clients; each function is a worklet, so the phone draws it on its UI thread every frame (the
 * directive is a plain string anywhere else).
 */

const TAU = Math.PI * 2;

const fixed = (value: number): string => {
  'worklet';
  return (Math.round(value * 10) / 10).toString();
};

/** Points joined by soft curves (each point a control, the curve through the midpoints): no corner anywhere. `start` 'L' carries on a path already begun. */
export function smoothPath(xs: readonly number[], ys: readonly number[], closed = false, start: 'M' | 'L' = 'M'): string {
  'worklet';
  const count = xs.length;
  if (count === 0) return '';
  if (count < 3) return `${start}${fixed(xs[0]!)} ${fixed(ys[0]!)}L${fixed(xs[count - 1]!)} ${fixed(ys[count - 1]!)}`;
  if (closed) {
    let path = `M${fixed((xs[count - 1]! + xs[0]!) / 2)} ${fixed((ys[count - 1]! + ys[0]!) / 2)}`;
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count;
      path += `Q${fixed(xs[index]!)} ${fixed(ys[index]!)} ${fixed((xs[index]! + xs[next]!) / 2)} ${fixed((ys[index]! + ys[next]!) / 2)}`;
    }
    return `${path}Z`;
  }
  let path = `${start}${fixed(xs[0]!)} ${fixed(ys[0]!)}`;
  for (let index = 1; index < count - 1; index += 1) {
    path += `Q${fixed(xs[index]!)} ${fixed(ys[index]!)} ${fixed((xs[index]! + xs[index + 1]!) / 2)} ${fixed((ys[index]! + ys[index + 1]!) / 2)}`;
  }
  return `${path}L${fixed(xs[count - 1]!)} ${fixed(ys[count - 1]!)}`;
}

export interface Ring {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  /** How far the crests swell in and out. */
  readonly amplitude: number;
  /** Crests round the whole ring (about: they are uneven). */
  readonly waves: number;
  /**
   * Where the crests stand, in radians: advancing it runs them round, and changes their shape as they
   * go. Keep it running on, never wrapped at a turn: its shape turns at other paces than its crests,
   * so a wrap shows as a jump.
   */
  readonly phase: number;
  /** Which hand drew it: two seeds, two rings that never match. */
  readonly seed?: number;
}

/**
 * The ring's radius at an angle (0 at the top, clockwise): its crests uneven (each swell and its
 * chop drift apart as the phase runs), and the ring itself a little lopsided, as a pebble is, even
 * when the sea is flat.
 */
export function organicRadius(ring: Ring, angle: number): number {
  'worklet';
  const seed = ring.seed ?? 0;
  const swell = Math.sin(ring.waves * angle + ring.phase) * (0.7 + 0.3 * Math.sin(2 * angle + ring.phase * 0.37 + seed));
  const chop = 0.26 * Math.sin((ring.waves + 3) * angle - ring.phase * 0.61 + seed * 1.7);
  const lean = 0.55 * Math.sin(angle + seed * 2.3) + 0.3 * Math.sin(2 * angle - seed + 0.8) + 0.12 * Math.sin(3 * angle + seed * 0.9);
  return ring.radius + ring.amplitude * (swell + chop) + ring.radius * 0.028 * lean;
}

/** A point of the ring at a share of its turn (0 the top). */
export function ringPoint(ring: Ring, share: number): { readonly x: number; readonly y: number } {
  'worklet';
  const angle = share * TAU;
  const r = organicRadius(ring, angle);
  return { x: ring.cx + r * Math.sin(angle), y: ring.cy - r * Math.cos(angle) };
}

/** The whole ring as one soft closed line. */
export function organicRing(ring: Ring, steps = 72): string {
  'worklet';
  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = 0; index < steps; index += 1) {
    const angle = (index / steps) * TAU;
    const r = organicRadius(ring, angle);
    xs.push(ring.cx + r * Math.sin(angle));
    ys.push(ring.cy - r * Math.cos(angle));
  }
  return smoothPath(xs, ys, true);
}

/**
 * An arc of the ring laid with a brush, clockwise from `from` to `to` (shares of the turn), as a
 * filled shape: it lands thin, swells and thins unevenly along its way, and keeps its width at its tip
 * (where a bead sits). Empty when there is nothing to lay.
 */
export function brushRing(ring: Ring, width: number, from: number, to: number, steps = 96): string {
  'worklet';
  const span = to - from;
  if (span <= 0.002) return '';
  const count = Math.max(4, Math.ceil(steps * span));
  const seed = ring.seed ?? 0;
  const outerX: number[] = [];
  const outerY: number[] = [];
  const innerX: number[] = [];
  const innerY: number[] = [];
  const length = span * TAU * ring.radius;
  for (let index = 0; index <= count; index += 1) {
    const share = from + (span * index) / count;
    const angle = share * TAU;
    const r = organicRadius(ring, angle);
    // Landing: thin over its first few widths, the brush pressing in.
    const along = (index / count) * length;
    const land = Math.min(1, 0.2 + along / (width * 3.5));
    const half = (width / 2) * land * (0.8 + 0.2 * Math.sin(5 * angle + seed * 3 + ring.phase * 0.15) + 0.08 * Math.sin(11 * angle - seed));
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    outerX.push(ring.cx + (r + half) * sin);
    outerY.push(ring.cy - (r + half) * cos);
    innerX.push(ring.cx + (r - half) * sin);
    innerY.push(ring.cy - (r - half) * cos);
  }
  innerX.reverse();
  innerY.reverse();
  // Out along the outer edge, round the tip, back along the inner one.
  const outer = smoothPath(outerX, outerY);
  const inner = smoothPath(innerX, innerY, false, 'L');
  return `${outer}${inner}Z`;
}

export interface WaveBand {
  readonly width: number;
  /** The bottom of the band (it is filled down to it). */
  readonly height: number;
  /** The wave's rest line, from the top. */
  readonly baseline: number;
  readonly amplitude: number;
  /** About one crest to the next: a longer swell carries shorter chop. */
  readonly wavelength: number;
  /** In radians: advancing it runs the crests to the left, the chop at its own pace. */
  readonly phase: number;
  /** How far the rest line leans, from its left end to its right (liquid tipped one way). */
  readonly tilt?: number;
  readonly seed?: number;
  /** Points across. */
  readonly steps?: number;
}

/** The sea's height at a point across a band, from its rest line (swell and chop). */
export function bandHeight(band: WaveBand, x: number): number {
  'worklet';
  const seed = band.seed ?? 0;
  const swell = Math.sin((TAU * x) / band.wavelength + band.phase);
  const chop = 0.38 * Math.sin((TAU * x) / (band.wavelength * 0.43) - band.phase * 1.3 + seed);
  const ripple = 0.16 * Math.sin((TAU * x) / (band.wavelength * 0.19) + band.phase * 0.7 + seed * 2.1);
  return band.amplitude * (swell + chop + ripple);
}

/** A band of water: its top an uneven sea, filled down to the bottom, as a closed path. */
export function waveBand(band: WaveBand): string {
  'worklet';
  const steps = band.steps ?? 36;
  const tilt = band.tilt ?? 0;
  const xs: number[] = [];
  const ys: number[] = [];
  // A little past both edges, so a crest never ends square at the screen's side.
  for (let index = 0; index <= steps; index += 1) {
    const x = -8 + ((band.width + 16) * index) / steps;
    xs.push(x);
    ys.push(band.baseline + tilt * (x / band.width - 0.5) + bandHeight(band, x));
  }
  return `${smoothPath(xs, ys)}L${fixed(band.width + 8)} ${fixed(band.height)}L-8 ${fixed(band.height)}Z`;
}

/**
 * The day's wave: across `width`, midnight to midnight; its height at a share of the day (0 midnight,
 * 0.5 noon), from the top: noon about the crest, midnight in the trough, the morning's slope not quite
 * the evening's. It crosses the horizon (`middle`) at 6:00 and 18:00 whatever its mood: the sun is up
 * while it lies above it, a picture of the day, not an almanac. `breath` (radians) lets it swell and
 * settle a little, alive.
 */
export function dayWaveY(share: number, middle: number, amplitude: number, breath = 0): number {
  'worklet';
  const angle = share * TAU;
  const mood = 1 + 0.13 * Math.sin(2 * angle + 0.4 + breath) + 0.06 * Math.sin(3 * angle + 2.3 - breath);
  return middle + amplitude * Math.cos(angle) * mood;
}

/** The day's wave from one share of the day to another, as an open soft line. */
export function dayWave(width: number, middle: number, amplitude: number, from = 0, to = 1, steps = 48, breath = 0): string {
  'worklet';
  const count = Math.max(2, Math.ceil(steps * (to - from)));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = 0; index <= count; index += 1) {
    const share = from + ((to - from) * index) / count;
    xs.push(share * width);
    ys.push(dayWaveY(share, middle, amplitude, breath));
  }
  return smoothPath(xs, ys);
}

/**
 * The day's wave as a brush stroke from one share to another: a ribbon `width` thick at most, thinner
 * where the brush lifts (its ends, and unevenly along the way).
 */
export function dayBrush(width: number, middle: number, amplitude: number, thickness: number, from: number, to: number, breath = 0, steps = 40): string {
  'worklet';
  const count = Math.max(3, Math.ceil(steps * (to - from)));
  const topX: number[] = [];
  const topY: number[] = [];
  const bottomX: number[] = [];
  const bottomY: number[] = [];
  for (let index = 0; index <= count; index += 1) {
    const t = index / count;
    const share = from + (to - from) * t;
    const y = dayWaveY(share, middle, amplitude, breath);
    const lift = Math.min(1, 0.35 + Math.min(t, 1 - t) * 6);
    const half = (thickness / 2) * lift * (0.75 + 0.25 * Math.sin(share * TAU * 7 + 1.1));
    topX.push(share * width);
    topY.push(y - half);
    bottomX.push(share * width);
    bottomY.push(y + half);
  }
  bottomX.reverse();
  bottomY.reverse();
  return `${smoothPath(topX, topY)}${smoothPath(bottomX, bottomY, false, 'L')}Z`;
}

/** The share of the day a wall time stands at (`2026-11-19T14:30` → 0.604). */
export function dayShare(wall: string): number {
  const hours = Number(wall.slice(11, 13));
  const minutes = Number(wall.slice(14, 16));
  return (hours * 60 + minutes) / 1440;
}

/**
 * A halftone screen as one path of dots (a riso print's shading): a grid `spacing` apart, turned by
 * `angle` (radians) as a screen is, each dot as large as `size` says there (0 none, 1 touching its
 * neighbours). Drawn once and kept: one shape, however many dots.
 */
export function halftone(width: number, height: number, spacing: number, angle: number, size: (x: number, y: number) => number): string {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const reach = Math.hypot(width, height);
  const cx = width / 2;
  const cy = height / 2;
  let path = '';
  for (let u = -reach / 2; u <= reach / 2; u += spacing) {
    for (let v = -reach / 2; v <= reach / 2; v += spacing) {
      const x = cx + u * cos - v * sin;
      const y = cy + u * sin + v * cos;
      if (x < -spacing || y < -spacing || x > width + spacing || y > height + spacing) continue;
      const share = Math.min(1, Math.max(0, size(x, y)));
      const r = (share * spacing) / 2;
      if (r < 0.35) continue;
      path += `M${fixed(x - r)} ${fixed(y)}a${fixed(r)} ${fixed(r)} 0 1 0 ${fixed(r * 2)} 0a${fixed(r)} ${fixed(r)} 0 1 0 ${fixed(-r * 2)} 0`;
    }
  }
  return path;
}
