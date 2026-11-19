/**
 * The stopwatch's face: a ring that ripples (Clock's wave, `design/waves.ts`) round its figure, drawn
 * by a hand: a little lopsided as a pebble is, its line gone over twice, its crests uneven and changing
 * as they run; twelve dots outside it, not quite in line, as a watch's five seconds. As a minute runs,
 * Safran melting into the accent is laid over it with a brush, clockwise, grainy as a print, landing
 * thin and swelling unevenly, a warm light inside while it runs, a bead riding
 * at its tip as the seconds hand; the minute done, it empties and fills again.
 * Running, the crests run round the ring; paused, the swell calms and holds; at zero the ring lies
 * flat, and « Démarrer » raises the wave. A lap sends a ripple through it. Drawn on the UI thread from
 * the stopwatch's own numbers (the figure is JavaScript's): nothing redraws while hidden. Reduce
 * Motion: the crests stand still, the fill still counts.
 */
import React, { memo, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, useFrameCallback, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
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
/** The swell running, paused and as a lap passes through. */
const RUN_SWELL = 5;
const HELD_SWELL = 2;
const LAP_SWELL = 10;
/** Radians the crests run per millisecond: one crest's travel in about 1.3 s. */
const RUN_SPEED = (Math.PI * 2) / WAVES / 1300;
/** Room outside the ring for its swell, its stroke and the dots. */
const MARGIN = 22;
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

function minuteShare(watch: Stopwatch, now: number): number {
  const total = watch.banked + (watch.startedAt === null ? 0 : Math.max(0, now - watch.startedAt));
  return total === 0 ? 0 : (total % MINUTE) / MINUTE;
}

function StopwatchDialComponent({ size, watch, active, children }: Props) {
  const theme = useTheme();
  const still = useReducedMotion();
  const running = watch.startedAt !== null;
  const reset = isReset(watch);
  const centre = size / 2;
  const radius = centre - MARGIN;

  const startedAt = useSharedValue(watch.startedAt ?? 0);
  const banked = useSharedValue(watch.banked);
  const share = useSharedValue(minuteShare(watch, Date.now()));
  const phase = useSharedValue(0);
  const swell = useSharedValue(reset ? 0 : running ? RUN_SWELL : HELD_SWELL);

  // Each frame while it runs and shows: the minute's share from the engine's numbers, the crests running on.
  const frame = useFrameCallback(info => {
    'worklet';
    const total = banked.value + Math.max(0, Date.now() - startedAt.value);
    share.value = (total % MINUTE) / MINUTE;
    if (!still) phase.value = (phase.value + (info.timeSincePreviousFrame ?? 16) * RUN_SPEED) % (Math.PI * 2);
  }, false);
  useEffect(() => {
    startedAt.value = watch.startedAt ?? 0;
    banked.value = watch.banked;
    if (!running || !active) share.value = minuteShare(watch, Date.now());
    frame.setActive(running && active);
  }, [watch, running, active, frame, startedAt, banked, share]);

  // Started, the wave rises; paused, it calms; reset, it lies flat.
  useEffect(() => {
    const to = reset ? 0 : running ? RUN_SWELL : HELD_SWELL;
    swell.value = still ? to : withTiming(to, { duration: duration.medium, easing: running ? decelerate : standard });
  }, [reset, running, still, swell]);
  // A lap: a ripple through the ring, settling back.
  const laps = useRef(watch.laps.length);
  useEffect(() => {
    if (watch.laps.length > laps.current && !still) swell.value = withSequence(withTiming(LAP_SWELL, { duration: 120, easing: decelerate }), withSpring(RUN_SWELL, spatialSlow));
    laps.current = watch.laps.length;
  }, [watch.laps.length, still, swell]);

  const track = useAnimatedProps(() => ({ d: organicRing({ cx: centre, cy: centre, radius, amplitude: swell.value, waves: WAVES, phase: phase.value, seed: SEED }) }));
  // The line gone over a second time, not quite where the first was.
  const sketch = useAnimatedProps(() => ({ d: organicRing({ cx: centre, cy: centre, radius: radius + 1.5, amplitude: swell.value * 0.85, waves: WAVES, phase: phase.value * 0.92 + 0.35, seed: SEED + 2.1 }) }));
  const filled = useAnimatedProps(() => {
    const path = brushRing({ cx: centre, cy: centre, radius, amplitude: swell.value, waves: WAVES, phase: phase.value, seed: SEED }, BRUSH, 0, share.value);
    return { d: path || `M${centre} ${centre - radius}`, fillOpacity: path ? 1 : 0 };
  });
  const bead = useAnimatedProps(() => {
    const point = ringPoint({ cx: centre, cy: centre, radius, amplitude: swell.value, waves: WAVES, phase: phase.value, seed: SEED }, share.value);
    return { cx: point.x, cy: point.y };
  });

  // Twelve dots outside the ring, set down by hand: a little in or out of line, a little larger or smaller, the top one the largest.
  const dots = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2;
        const at = organicRadius({ cx: 0, cy: 0, radius: radius + RUN_SWELL + 13, amplitude: 0, waves: WAVES, phase: 0, seed: SEED }, angle) + 1.6 * Math.sin(index * 2.7 + SEED);
        return { key: index, x: centre + at * Math.sin(angle), y: centre - at * Math.cos(angle), r: index === 0 ? 3 : 1.6 + 0.5 * Math.abs(Math.sin(index * 1.9)) };
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
          {/* A warm light inside the ring while it runs. */}
          <RadialGradient id="dialGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={theme.color.action} stopOpacity={0.16} />
            <Stop offset="1" stopColor={theme.color.action} stopOpacity={0} />
          </RadialGradient>
          <Tooth id="brushTooth" />
        </Defs>
        {running ? <Circle cx={centre} cy={centre} r={radius} fill="url(#dialGlow)" /> : null}
        {dots.map(dot => (
          <Circle key={dot.key} cx={dot.x} cy={dot.y} r={dot.r} fill={theme.color.inkFaint} />
        ))}
        <AnimatedPath animatedProps={sketch} fill="none" stroke={theme.color.edge} strokeOpacity={0.45} strokeWidth={1.2} />
        <AnimatedPath animatedProps={track} fill="none" stroke={theme.color.edge} strokeOpacity={0.85} strokeWidth={2.4} />
        <AnimatedPath animatedProps={filled} fill="url(#brushInk)" />
        <AnimatedPath animatedProps={filled} fill="url(#brushTooth)" opacity={0.75} />
        {/* The seconds hand: a bead at the wave's tip, ringed in the wall's tone. */}
        <AnimatedCircle animatedProps={bead} r={BEAD} fill={running ? theme.color.action : theme.color.inkMuted} stroke={theme.color.wall} strokeWidth={2.5} />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.heart]}>{children}</View>
    </View>
  );
}

export const StopwatchDial = memo(StopwatchDialComponent);

const styles = StyleSheet.create({
  heart: { alignItems: 'center', justifyContent: 'center' },
});
