/**
 * The board's motion in script, on the page's own tokens (`--ease-*`, `--duration-*` in base.css,
 * the phone's `src/ui/theme/motion.ts`): the wall's moves and a card's swipe run on the Web
 * Animations API, so they stay off the main thread and can be read back mid-flight. Where the page
 * cannot animate (tests), everything lands at once; reduced motion keeps the fades alone.
 */

export const CAN_ANIMATE = typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';

/** The phone's Wall: a card new to the wall settles in once the others have made room. */
const ARRIVE_MS = 200;
const ARRIVE_DELAY_MS = 120;
/** The exit's animation id: a card already fading is never started again. */
export const LEAVE = 'leave';
/** The spring is laid out as positions this far apart, and played back straight between them. */
export const FRAME_MS = 1000 / 120;
/** M3's spatial spring, the phone's `spatial` (damping ratio 0.9). */
const SPRING = { stiffness: 700, damping: 47.6, mass: 1 } as const;
/** `Easing.out(Easing.quad)` exactly (the quadratic through (0.5, 1), raised to a cubic): a throw starts at twice its average speed. */
const FLING = 'cubic-bezier(0.3333, 0.6667, 0.6667, 1)';

export interface MotionTokens {
  readonly standard: string;
  readonly decelerate: string;
  readonly accelerate: string;
  readonly short: number;
  readonly medium: number;
  readonly exit: number;
}

let tokens: MotionTokens | null = null;

/** Read once from the page: the tokens never change while it lives. */
export function motionTokens(): MotionTokens {
  if (tokens) return tokens;
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback;
  const ms = (name: string, fallback: number): number => {
    const value = parseFloat(read(name, ''));
    return Number.isFinite(value) ? value : fallback;
  };
  tokens = {
    standard: read('--ease-standard', 'cubic-bezier(0.2, 0, 0, 1)'),
    decelerate: read('--ease-decelerate', 'cubic-bezier(0.05, 0.7, 0.1, 1)'),
    accelerate: read('--ease-accelerate', 'cubic-bezier(0.3, 0, 0.8, 0.15)'),
    short: ms('--duration-short', 150),
    medium: ms('--duration-medium', 250),
    exit: ms('--duration-exit', 200),
  };
  return tokens;
}

export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Closing ranks: from where it stood to its new place; added to a move still running, so an interrupted one never jumps. */
export function slide(node: HTMLElement, dx: number, dy: number): void {
  const { medium, standard } = motionTokens();
  node.animate({ translate: [`${dx}px ${dy}px`, '0px 0px'] }, { duration: medium, easing: standard, composite: 'add' });
}

/** A card new to the wall (back from the archive, a view just opened), from 0.94 as the phone's. */
export function settleIn(node: HTMLElement): void {
  const frames = reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, scale: '0.94' }, { opacity: 1, scale: '1' }];
  node.animate(frames, { duration: ARRIVE_MS, delay: ARRIVE_DELAY_MS, easing: motionTokens().decelerate, fill: 'backwards' });
}

/** A card taken off the wall without a swipe fades where it was. */
export function fadeOut(node: HTMLElement): void {
  const { short, accelerate } = motionTokens();
  const frames = reducedMotion() ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, scale: '1' }, { opacity: 0, scale: '0.96' }];
  node.animate(frames, { id: LEAVE, duration: short, easing: accelerate, fill: 'forwards' });
}

/** Where a spring let go at `from` with `velocity` (px/s) stands, `FRAME_MS` apart, until it rests at 0. */
export function springPath(from: number, velocity: number): number[] {
  const w0 = Math.sqrt(SPRING.stiffness / SPRING.mass);
  const zeta = SPRING.damping / (2 * Math.sqrt(SPRING.stiffness * SPRING.mass));
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  const b = (velocity + zeta * w0 * from) / wd;
  const reach = Math.abs(from) + Math.abs(b);
  const path = [from];
  for (let t = FRAME_MS / 1000; t < 1; t += FRAME_MS / 1000) {
    const envelope = Math.exp(-zeta * w0 * t);
    path.push(envelope * (from * Math.cos(wd * t) + b * Math.sin(wd * t)));
    if (envelope * reach < 0.5) break;
  }
  path.push(0);
  return path;
}

/** The phone's `throwTo`: thrown fast it keeps the hand's speed; let go slowly it is pushed off on M3's exit. */
export function throwTiming(distance: number, velocity: number): { readonly duration: number; readonly easing: string } {
  const { exit, accelerate } = motionTokens();
  if (Math.abs(velocity) <= 1000 || Math.sign(velocity) !== Math.sign(distance)) return { duration: exit, easing: accelerate };
  const speed = Math.max(Math.abs(velocity), 1200);
  return { duration: Math.min(280, Math.max(120, ((2 * Math.abs(distance)) / speed) * 1000)), easing: FLING };
}
