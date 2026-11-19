/**
 * The stopwatch's face: a ring that ripples (Clock's wave, `design/waves.ts`) round its figure, drawn
 * by a hand: a little lopsided as a pebble is, its line gone over twice, its crests uneven and changing
 * as they run; twelve dots outside it, not quite in line, as a watch's five seconds, each lit in the
 * accent as the brush passes it. As a minute runs, Safran melting into the accent is laid over the ring
 * with a brush, clockwise, grainy as a print, landing thin and swelling unevenly, a warm light inside,
 * a bead riding at its tip as the seconds hand.
 *
 * Always a little sea: at zero it breathes, slow and low; started, the wave rises and its crests run
 * round; paused, it calms and drifts. A minute done rolls over instead of snapping: the full stroke and
 * its dots fade as the new minute's begins, and a wavy ripple runs out from the ring. A lap sends a
 * swell through it. Drawn on the UI thread from the stopwatch's own numbers (the figure is
 * JavaScript's), only while its place is shown. Reduce Motion: no drift, no ripple; the fill still counts.
 */
import React, { memo, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, useFrameCallback, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import { isReset, type Stopwatch } from '@unlease/clock/models/stopwatch';
import { brushRing, organicRadius, organicRing, ringPoint } from '@unlease/design/waves';
import { decelerate, duration, spatialSlow, standard } from '@shared/ui/theme/motion';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

import { Tooth } from '../riso';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const MINUTE = 60_000;
/** Crests round the ring. */
const WAVES = 12;
/** The swell at rest, running, paused and as a lap passes through. */
const REST_SWELL = 1.3;
const RUN_SWELL = 5;
const HELD_SWELL = 2.2;
const LAP_SWELL = 10;
/** Radians the crests run per millisecond running (a crest's travel in about 1.3 s), and drifting at rest or paused. */
const RUN_SPEED = (Math.PI * 2) / WAVES / 1300;
const DRIFT_SPEED = RUN_SPEED / 7;
/** How long a minute done takes to fade, and its ripple to run out. */
const ROLL_FADE_MS = 700;
const RIPPLE_MS = 1100;
/** Room outside the ring for its swell, its stroke, the dots and the ripple. */
const MARGIN = 24;
const BEAD = 7;
/** The hand that drew this dial (and its second pass over the line). */
const SEED = 1.3;
const BRUSH = 11;

interface Props {
  readonly size: number;
  readonly watch: Stopwatch;
  /** The place shown: hidden, nothing is drawn each frame. */
  readonly active: boolean;
  readonly children: React.ReactNode;
}

const totalAt = (watch: Stopwatch, now: number): number => watch.banked + (watch.startedAt === null ? 0 : Math.max(0, now - watch.startedAt));

function StopwatchDialComponent({ size, watch, active, children }: Props) {
  const theme = useTheme();
  const still = useReducedMotion();
  const running = watch.startedAt !== null;
  const reset = isReset(watch);
  const centre = size / 2;
  const radius = centre - MARGIN;

  const startedAt = useSharedValue(watch.startedAt ?? 0);
  const banked = useSharedValue(watch.banked);
  const runningSV = useSharedValue(running);
  /** Milliseconds counted, as of the last frame drawn. */
  const total = useSharedValue(totalAt(watch, Date.now()));
  const phase = useSharedValue(0);
  const swell = useSharedValue(reset ? REST_SWELL : running ? RUN_SWELL : HELD_SWELL);

  // Each frame while shown: the time from the engine's numbers, the crests running on (fast running, a drift otherwise).
  const frame = useFrameCallback(info => {
    'worklet';
    if (runningSV.value) total.value = banked.value + Math.max(0, Date.now() - startedAt.value);
    // Never wrapped: the wave's shape turns with several multiples of its phase that are not whole, so a wrap would make it jump.
    if (!still) phase.value += (info.timeSincePreviousFrame ?? 16) * (runningSV.value ? RUN_SPEED : DRIFT_SPEED);
  }, false);
  useEffect(() => {
    startedAt.value = watch.startedAt ?? 0;
    banked.value = watch.banked;
    runningSV.value = watch.startedAt !== null;
    total.value = totalAt(watch, Date.now());
    // Running, it draws every frame; still, only while it drifts (never under Reduce Motion).
    frame.setActive(active && (watch.startedAt !== null || !still));
  }, [watch, active, still, frame, startedAt, banked, runningSV, total]);

  // Started, the wave rises; paused, it calms; reset, it settles to a breath.
  useEffect(() => {
    const to = reset ? REST_SWELL : running ? RUN_SWELL : HELD_SWELL;
    swell.value = still ? to : withTiming(to, { duration: running ? duration.long : duration.medium, easing: running ? decelerate : standard });
  }, [reset, running, still, swell]);
  // A lap: a swell through the ring, settling back.
  const laps = useRef(watch.laps.length);
  useEffect(() => {
    if (watch.laps.length > laps.current && !still) swell.value = withSequence(withTiming(LAP_SWELL, { duration: 120, easing: decelerate }), withSpring(RUN_SWELL, spatialSlow));
    laps.current = watch.laps.length;
  }, [watch.laps.length, still, swell]);

  const track = useAnimatedProps(() => ({ d: organicRing({ cx: centre, cy: centre, radius, waves: WAVES, seed: SEED, amplitude: swell.value, phase: phase.value }) }));
  // The line gone over a second time, not quite where the first was.
  const sketch = useAnimatedProps(() => ({ d: organicRing({ cx: centre, cy: centre, radius: radius + 1.5, waves: WAVES, seed: SEED + 2.1, amplitude: swell.value * 0.85, phase: phase.value * 0.92 + 0.35 }) }));
  const filled = useAnimatedProps(() => {
    const share = total.value === 0 ? 0 : (total.value % MINUTE) / MINUTE;
    const path = brushRing({ cx: centre, cy: centre, radius, waves: WAVES, seed: SEED, amplitude: swell.value, phase: phase.value }, BRUSH, 0, share);
    return { d: path || `M${centre} ${centre - radius}`, fillOpacity: path ? 1 : 0 };
  });
  // The minute just done: its whole stroke fading as the new one begins.
  const done = useAnimatedProps(() => {
    const into = total.value % MINUTE;
    const fade = total.value >= MINUTE && !still ? Math.max(0, 1 - into / ROLL_FADE_MS) : 0;
    const path = fade > 0 ? brushRing({ cx: centre, cy: centre, radius, waves: WAVES, seed: SEED, amplitude: swell.value, phase: phase.value }, BRUSH, 0, 0.9999) : '';
    return { d: path || `M${centre} ${centre - radius}`, fillOpacity: fade };
  });
  // ...and a wavy ripple running out from the ring.
  const ripple = useAnimatedProps(() => {
    const into = total.value % MINUTE;
    const t = total.value >= MINUTE && !still ? into / RIPPLE_MS : 1;
    if (t >= 1) return { d: `M${centre} ${centre - radius}`, strokeOpacity: 0 };
    const eased = 1 - (1 - t) * (1 - t);
    return { d: organicRing({ cx: centre, cy: centre, radius: radius + 4 + (MARGIN - 4) * eased, waves: WAVES, seed: SEED + 4.4, amplitude: 2 + 4 * eased, phase: phase.value * 1.4 + 1 }, 96), strokeOpacity: 0.7 * (1 - t) };
  });
  const bead = useAnimatedProps(() => {
    const share = total.value === 0 ? 0 : (total.value % MINUTE) / MINUTE;
    const point = ringPoint({ cx: centre, cy: centre, radius, waves: WAVES, seed: SEED, amplitude: swell.value, phase: phase.value }, share);
    return { cx: point.x, cy: point.y };
  });

  // Twelve dots outside the ring, set down by hand: a little in or out of line, a little larger or smaller, the top one the largest.
  const dots = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2;
        const at = organicRadius({ cx: 0, cy: 0, radius: radius + RUN_SWELL + 10, amplitude: 0, waves: WAVES, phase: 0, seed: SEED }, angle) + 1.6 * Math.sin(index * 2.7 + SEED);
        return { index, x: centre + at * Math.sin(angle), y: centre - at * Math.cos(angle), r: index === 0 ? 3 : 1.6 + 0.5 * Math.abs(Math.sin(index * 1.9)) };
      }),
    [centre, radius],
  );

  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* The brush's ink: Safran where the minute begins, melting into the accent, the tooth over it. */}
          <LinearGradient id="brushInk" x1="0.5" y1="0" x2="0.5" y2="1">
            <Stop offset="0" stopColor={theme.color.waiting} />
            <Stop offset="0.6" stopColor={theme.color.action} />
            <Stop offset="1" stopColor={theme.color.action} />
          </LinearGradient>
          {/* A warm light inside the ring. */}
          <RadialGradient id="dialGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={theme.color.action} stopOpacity={0.16} />
            <Stop offset="1" stopColor={theme.color.action} stopOpacity={0} />
          </RadialGradient>
          <Tooth id="brushTooth" />
        </Defs>
        <Circle cx={centre} cy={centre} r={radius} fill="url(#dialGlow)" opacity={reset ? 0.45 : 1} />
        {dots.map(dot => (
          <Dot key={dot.index} dot={dot} total={total} />
        ))}
        <AnimatedPath animatedProps={ripple} fill="none" stroke={theme.color.action} strokeWidth={2} />
        <AnimatedPath animatedProps={sketch} fill="none" stroke={theme.color.edge} strokeOpacity={0.45} strokeWidth={1.2} />
        <AnimatedPath animatedProps={track} fill="none" stroke={theme.color.edge} strokeOpacity={0.85} strokeWidth={2.4} />
        <AnimatedPath animatedProps={done} fill="url(#brushInk)" />
        <AnimatedPath animatedProps={filled} fill="url(#brushInk)" />
        <AnimatedPath animatedProps={filled} fill="url(#brushTooth)" opacity={0.75} />
        {/* The seconds hand: a bead at the wave's tip, ringed in the wall's tone. */}
        <AnimatedCircle animatedProps={bead} r={BEAD} fill={running ? theme.color.action : theme.color.inkMuted} stroke={theme.color.wall} strokeWidth={2.5} />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.heart]}>{children}</View>
    </View>
  );
}

/** A five seconds' dot: faint, then lit in the accent as the brush passes it, fading with the minute done. */
function Dot({ dot, total }: { readonly dot: { readonly index: number; readonly x: number; readonly y: number; readonly r: number }; readonly total: SharedValue<number> }) {
  const theme = useTheme();
  const lit = useAnimatedProps(() => {
    const into = total.value % MINUTE;
    const share = total.value === 0 ? 0 : into / MINUTE;
    // Lit a moment after the brush reaches it (the top one once the minute is done), gone with the minute's stroke.
    const now = dot.index === 0 ? 0 : Math.min(1, Math.max(0, (share - dot.index / 12) * 40));
    const before = total.value >= MINUTE ? Math.max(0, 1 - into / ROLL_FADE_MS) : 0;
    const on = Math.max(now, before);
    return { fillOpacity: on, r: dot.r + on * 0.9 };
  });
  return (
    <>
      <Circle cx={dot.x} cy={dot.y} r={dot.r} fill={theme.color.inkFaint} />
      <AnimatedCircle animatedProps={lit} cx={dot.x} cy={dot.y} fill={theme.color.action} />
    </>
  );
}

export const StopwatchDial = memo(StopwatchDialComponent);

const styles = StyleSheet.create({
  heart: { alignItems: 'center', justifyContent: 'center' },
});
