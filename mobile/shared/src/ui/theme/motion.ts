/**
 * Motion: Material 3's curves, durations and springs, one set for every screen. Arrivals decelerate;
 * departures accelerate and take less time; a gesture hands its speed to a spring or a fling.
 * Reduce Motion (Android's "Remove animations") skips layout animations and ends springs at once.
 */
import { Easing, FadeIn, FadeOut, Keyframe, LinearTransition, withTiming, type AnimationCallback } from 'react-native-reanimated';

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
  /** A menu growing from the corner it was opened from, a card settling into its place: quicker than a sheet. */
  grow: 200,
  /** A small overlay fading back into where it came from (a menu, the capture's actions, the letter's bubble): quicker than any exit. */
  fadeBack: 120,
  /** The beat something waits before settling in: the others make room first, and a list that fills at once never shows it. */
  beat: 120,
} as const;

/** M3's spatial spring (damping ratio 0.9): something that travels settles once the hand lets go. */
export const spatial = { stiffness: 700, damping: 47.6, mass: 1 } as const;
/** The same for a large surface (a sheet, the drawer) going back under the hand. */
export const spatialSlow = { stiffness: 300, damping: 31.2, mass: 1 } as const;

/** Faster than this (px/s), a hand let go has thrown what it held: a swipe, a sheet, a page turned. Short of it, where it was let go decides. */
export const FLING_SPEED = 1000;

/**
 * A sideways swipe's threshold, as a share of the width: crossing it clicks (`haptic('threshold')`, and
 * `release` back short of it). A row that acts in place (a link stamped, a contact called) acts only
 * when let go past it, never on a throw, and under Reduce Motion stays still while its action fades in;
 * what goes away (a period turned, the slip) goes past it or flung, clicking when flung short of it.
 */
export const SWIPE_SHARE = 0.3;

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
  const thrown = Math.abs(velocity) > FLING_SPEED && Math.sign(velocity) === Math.sign(target - from);
  return thrown
    ? withTiming(target, { duration: flingDuration(target - from, velocity), easing: fling }, callback)
    : withTiming(target, { duration: duration.exit, easing: accelerate }, callback);
}

/*
 * A list's motion, the same in every app (DESIGN's Motion): something leaving fades where it was,
 * the rest close ranks (250, standard), something arriving settles in once they have made room.
 * A list replaced whole just goes (`LayoutAnimationConfig skipExiting`), and what is there when it
 * opens or scrolls into its window never animates (`useArrivals`, `skipEnteringExitingAnimations`).
 */

/** The others closing ranks or making room: a row's `layout`, an `Animated.FlatList`'s `itemLayoutAnimation`. */
export const listMove = LinearTransition.duration(duration.medium).easing(standard);
/** Something arriving among the others: from 0.94, once they have made room (Carnet's card, Agenda's event, a row brought back). */
export const listIn = new Keyframe({ 0: { opacity: 0, transform: [{ scale: 0.94 }] }, 100: { opacity: 1, transform: [{ scale: 1 }], easing: decelerate } })
  .duration(duration.grow)
  .delay(duration.beat);
/** A row the hand is making where the caret already is (a checklist's item typed): it fades in at once. */
export const listInAtOnce = FadeIn.duration(duration.medium).easing(decelerate);
/** Something leaving fades where it was, out of the way before the rest close ranks. */
export const listOut = FadeOut.duration(duration.short).easing(accelerate);
