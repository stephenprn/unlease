/**
 * A gesture follows the finger 1:1 and hands its speed on (DESIGN.md, Motion), with the phone's
 * numbers (src/ui/theme/motion.ts): let go short, it goes back to rest on M3's spatial spring; let
 * go far or fast, it is thrown off keeping the hand's speed. Both play on the Web Animations API;
 * where it is missing (tests) things land where they are going at once.
 */

export interface Spring {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: number;
}

/** M3's spatial spring (damping ratio 0.9): something small going back under the hand (the slip). */
export const SPATIAL: Spring = { stiffness: 700, damping: 47.6, mass: 1 };
/** The same for a large surface (a sheet). */
export const SPATIAL_SLOW: Spring = { stiffness: 300, damping: 31.2, mass: 1 };

/** An ease-out whose first speed is twice its average (the phone's `fling`, `Easing.out(Easing.quad)`, exactly). */
const FLING = 'cubic-bezier(0.3333, 0.6667, 0.6667, 1)';
const FRAME_MS = 1000 / 60;

/** A motion token from base.css (`--ease-*`, `--duration-*`), so the web keeps one source for them. */
function token(name: string, fallback: string): string {
  const value = typeof document === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function tokenMs(name: string, fallback: number): number {
  const value = token(name, `${fallback}ms`);
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return fallback;
  return value.endsWith('ms') ? number : number * 1000;
}

export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Where a spring let go at `from` (px from rest) with `velocity` (px/s) is, frame by frame, until it rests at 0. */
export function springPath(from: number, velocity: number, spring: Spring): number[] {
  const path = [from];
  const steps = 8;
  const dt = FRAME_MS / 1000 / steps;
  let x = from;
  let v = velocity;
  for (let frame = 0; frame < 90; frame += 1) {
    for (let step = 0; step < steps; step += 1) {
      v += ((-spring.stiffness * x - spring.damping * v) / spring.mass) * dt;
      x += v * dt;
    }
    path.push(x);
    if (Math.abs(x) < 0.5 && Math.abs(v) < 20) break;
  }
  path[path.length - 1] = 0;
  return path;
}

/** The spring's path as keyframes of `frame(x)`, and how long it runs. */
export function springFrames(path: readonly number[], frame: (x: number) => Keyframe): { keyframes: Keyframe[]; duration: number } {
  return { keyframes: path.map(frame), duration: (path.length - 1) * FRAME_MS };
}

/**
 * The phone's `throwTo`: flung fast toward where it goes, it keeps the hand's speed (an ease-out
 * that starts at twice its average speed, 120 to 280ms); let go slowly, it is pushed away on M3's exit.
 */
export function throwTiming(distance: number, velocity: number): { readonly duration: number; readonly easing: string } {
  const flung = Math.abs(velocity) > 1000 && Math.sign(velocity) === Math.sign(distance);
  if (!flung) return { duration: tokenMs('--duration-exit', 200), easing: token('--ease-accelerate', 'cubic-bezier(0.3, 0, 0.8, 0.15)') };
  const speed = Math.max(Math.abs(velocity), 1200);
  return { duration: Math.min(280, Math.max(120, ((2 * Math.abs(distance)) / speed) * 1000)), easing: FLING };
}

/** The hand's speed (px/s) over its last 100ms, as Android reads a fling; a pause before letting go reads as still. */
export function velocityTracker(): { add: (position: number) => void; velocity: () => number } {
  const samples: { t: number; p: number }[] = [];
  return {
    add(position) {
      const t = performance.now();
      samples.push({ t, p: position });
      while (samples.length > 2 && t - samples[0]!.t > 100) samples.shift();
    },
    velocity() {
      const first = samples[0];
      const last = samples[samples.length - 1];
      if (!first || !last || last.t <= first.t) return 0;
      return ((last.p - first.p) / (last.t - first.t)) * 1000;
    },
  };
}

/** Plays keyframes where the browser can; null where it cannot, the end state then shows at once. */
export function play(element: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions): Animation | null {
  return typeof element.animate === 'function' ? element.animate(keyframes, options) : null;
}

/** An element's `translate` as `[x, y]` px, mid-animation included. */
export function translation(element: Element): [number, number] {
  const value = getComputedStyle(element).translate;
  if (!value || value === 'none') return [0, 0];
  const [x = 0, y = 0] = value.split(/\s+/).map(part => Number.parseFloat(part) || 0);
  return [x, y];
}
