/**
 * Motion: Material 3's curves, durations and springs, one set for every screen. Arrivals decelerate;
 * departures accelerate and take less time; a gesture hands its speed to a spring or a fling.
 * Reduce Motion (Android's "Remove animations") skips layout animations and ends springs at once.
 */
import { Easing, withTiming, type AnimationCallback } from 'react-native-reanimated';

export const standard = Easing.bezier(0.2, 0, 0, 1);
/** M3 emphasized decelerate: things arriving. */
export const decelerate = Easing.bezier(0.05, 0.7, 0.1, 1);
/** M3 emphasized accelerate: things leaving. */
export const accelerate = Easing.bezier(0.3, 0, 0.8, 0.15);

export const duration = {
  short: 150,
  medium: 250,
  /** Something large arriving (a sheet, the drawer, the slip): long enough to follow, short enough never to wait on. */
  long: 300,
  /** A sheet, the drawer or the slip leaving: M3's exit, shorter than any arrival. */
  exit: 200,
  /** The snip: one stroke of the scissors along the cut line. */
  transfer: 900,
} as const;

/** M3's spatial spring (damping ratio 0.9): something that travels settles once the hand lets go. */
export const spatial = { stiffness: 700, damping: 47.6, mass: 1 } as const;
/** The same for a large surface (a sheet, the drawer) going back under the hand. */
export const spatialSlow = { stiffness: 300, damping: 31.2, mass: 1 } as const;

/** A row in a scrolling list takes its press tint once the touch is clearly a tap (Android's tap timeout), so a scroll or a swipe starting on it never flashes it. */
export const listPressDelay = 100;

/** A cut-out pinned in place: a short overshoot, then still. */
export const land = { damping: 12, stiffness: 240, mass: 0.6 } as const;

/** A press on paper: it gives a little under the finger. */
export const squeeze = { damping: 16, stiffness: 420, mass: 0.5 } as const;

/** An ease-out whose first speed is twice its average: with `flingDuration`, a thrown thing keeps the hand's speed. */
export const fling = Easing.out(Easing.quad);

/** How long something thrown at `velocity` (px/s) takes to cover `distance` on `fling`, without stalling or crawling. */
export function flingDuration(distance: number, velocity: number): number {
  'worklet';
  const speed = Math.max(Math.abs(velocity), 1200);
  return Math.min(280, Math.max(120, ((2 * Math.abs(distance)) / speed) * 1000));
}

/** Sends something off once the hand lets go: thrown fast, it keeps the hand's speed; let go slowly, it is pushed away (M3's exit). */
export function throwTo(target: number, from: number, velocity: number, callback?: AnimationCallback): number {
  'worklet';
  const thrown = Math.abs(velocity) > 1000 && Math.sign(velocity) === Math.sign(target - from);
  return thrown
    ? withTiming(target, { duration: flingDuration(target - from, velocity), easing: fling }, callback)
    : withTiming(target, { duration: duration.exit, easing: accelerate }, callback);
}
