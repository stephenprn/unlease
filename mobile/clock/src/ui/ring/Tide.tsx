/**
 * The ringing windows' tide (Clock's wave, `design/waves.ts`), over the night ground, under everything
 * else, touching nothing. Grainy gradients, printed as a risograph is: Safran melting into the accent
 * and down into the night's dark, each layer a little out of register with the next, and the ink's
 * tooth over every shape and every glow (`riso-grain.png`, `tools/textures/build_grain.py`), fading
 * out with the light, the paper showing through.
 *
 * - **Dawn** (the alarm's): a sun cut by hand rising out of a choppy sea, Safran at its top melting
 *   into the accent, its Safran under-print showing a little apart, its far side shaded, a grainy halo
 *   round it. Three bands of water drift across one another at their own paces, each lit at its crest
 *   and darkening as it deepens, each crest printed again a little above itself in Safran; over the first forty seconds, as the volume rises, the sun comes up to
 *   stand half out of the sea, the water rising with it. Answered, the sea calms and holds.
 * - **Slosh** (the timer's): no sun, the water tipped one way and the other as a glass carried across
 *   a kitchen, in time with the hourglass turning over above it (`RingBeacon`).
 *
 * Both lie on a grainy glow at the foot. The sea is drawn on the UI thread each frame; the sun is
 * carried up whole, only its edge redrawn. Reduce Motion: the scene still, risen.
 */
import React, { memo, useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Mask, Path, RadialGradient, Stop } from 'react-native-svg';

import { organicRing, waveBand } from '@unlease/design/waves';
import { standard } from '@shared/ui/theme/motion';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

import { Tooth } from '../features/riso';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** How long the dawn takes to come up: about as long as the volume's rise. */
const RISE_MS = 40_000;
/** The hourglass's cycle (`RingBeacon`: 900 still, 700 over, 1500 still, 700 over): the water tips with it. */
const SLOSH_MS = 3800;
const TAU = Math.PI * 2;
/** How far one ink lands from the next. */
const MISREGISTER = { x: -5, y: -4 };

interface Band {
  /** Rest line as a share of the height, before and once risen. */
  readonly low: number;
  readonly high: number;
  readonly amplitude: number;
  /** Crest to crest, as a share of the width. */
  readonly wavelength: number;
  /** Radians per millisecond; the sign is its direction. */
  readonly speed: number;
}

const DAWN_BANDS: readonly Band[] = [
  { low: 0.88, high: 0.8, amplitude: 12, wavelength: 1.15, speed: TAU / 9000 },
  { low: 0.92, high: 0.85, amplitude: 9, wavelength: 0.78, speed: -TAU / 7000 },
  { low: 0.96, high: 0.9, amplitude: 7, wavelength: 0.56, speed: TAU / 5200 },
];

const SLOSH_BANDS: readonly Band[] = [
  { low: 0.8, high: 0.8, amplitude: 9, wavelength: 0.9, speed: TAU / 6000 },
  { low: 0.86, high: 0.86, amplitude: 7, wavelength: 0.62, speed: -TAU / 4600 },
  { low: 0.92, high: 0.92, amplitude: 6, wavelength: 0.5, speed: TAU / 3900 },
];

interface Props {
  readonly kind: 'dawn' | 'slosh';
  /** Still rising, still sloshing: false once answered, and it calms. */
  readonly active: boolean;
}

function TideComponent({ kind, active }: Props) {
  const theme = useTheme();
  const still = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const bands = kind === 'dawn' ? DAWN_BANDS : SLOSH_BANDS;

  /** Milliseconds the sea has run, slowed as it calms. */
  const clock = useSharedValue(0);
  /** 1 while ringing, falling to a quiet swell once answered. */
  const pace = useSharedValue(1);
  /** The dawn's rise, 0 to 1. */
  const rise = useSharedValue(still || kind === 'slosh' ? 1 : 0);

  const frame = useFrameCallback(info => {
    'worklet';
    clock.value += (info.timeSincePreviousFrame ?? 16) * pace.value;
  }, false);
  useEffect(() => {
    frame.setActive(!still);
    return () => frame.setActive(false);
  }, [still, frame]);
  useEffect(() => {
    if (still) return;
    pace.value = withTiming(active ? 1 : 0.3, { duration: 1200, easing: standard });
    if (kind === 'dawn') rise.value = active ? withTiming(1, { duration: RISE_MS * (1 - rise.value), easing: Easing.out(Easing.cubic) }) : withTiming(rise.value, { duration: 0 });
  }, [active, still, kind, pace, rise]);

  const band0 = useBandProps(bands[0]!, 0, clock, pace, rise, kind, width, height);
  const band1 = useBandProps(bands[1]!, 1, clock, pace, rise, kind, width, height);
  const band2 = useBandProps(bands[2]!, 2, clock, pace, rise, kind, width, height);

  const sea = theme.color.wall;
  const inks = kind === 'dawn' ? [theme.color.waiting, theme.color.action, sea] : [theme.color.waiting, theme.color.action, theme.color.action];
  const strength = kind === 'dawn' ? [0.62, 0.78, 1] : [0.3, 0.42, 0.62];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <GrainyGlow width={width} height={height} color={kind === 'dawn' ? theme.color.action : theme.color.waiting} />
      {kind === 'dawn' ? <RisoSun width={width} height={height} rise={rise} clock={clock} /> : null}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <Tooth id="seaTooth" />
          {/* Each band lit at its crest, darkening as it deepens. */}
          {inks.map((ink, index) => (
            <LinearGradient key={index} id={`sea${index}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={ink} stopOpacity={strength[index]!} />
              <Stop offset="0.35" stopColor={index === 2 && kind === 'dawn' ? sea : ink} stopOpacity={strength[index]! * 0.8} />
              <Stop offset="1" stopColor={sea} stopOpacity={kind === 'dawn' ? 1 : strength[index]!} />
            </LinearGradient>
          ))}
        </Defs>
        {[band0, band1, band2].map((band, index) => (
          <G key={index}>
            {/* Under a translucent ink, the sea's own dark first: what is under the water stays under it. */}
            {kind === 'dawn' && index < 2 ? <AnimatedPath animatedProps={band} fill={sea} /> : null}
            <AnimatedPath animatedProps={band} fill={`url(#sea${index})`} />
            <AnimatedPath animatedProps={band} fill="url(#seaTooth)" opacity={index === 2 && kind === 'dawn' ? 0.45 : 0.8} />
            {/* Its crest printed again in Safran, a little above itself: the second pass off register. */}
            {index < 2 ? <AnimatedPath animatedProps={band} fill="none" stroke={theme.color.waiting} strokeOpacity={0.75} strokeWidth={2} transform={`translate(${MISREGISTER.x} ${MISREGISTER.y})`} /> : null}
          </G>
        ))}
      </Svg>
    </View>
  );
}

/** A warm light from the foot, its grain thinning with it: a gradient, then the tooth through a mask of the same light. */
function GrainyGlow({ width, height, color }: { readonly width: number; readonly height: number; readonly color: string }) {
  const top = height * 0.42;
  const tall = height - top;
  return (
    <Svg width={width} height={tall} style={[styles.glow, { top }]}>
      <Defs>
        <RadialGradient id="footGlow" cx="50%" cy="100%" rx="75%" ry="100%" fx="50%" fy="100%">
          <Stop offset="0" stopColor={color} stopOpacity={0.55} />
          <Stop offset="0.45" stopColor={color} stopOpacity={0.2} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="footFade" cx="50%" cy="100%" rx="75%" ry="100%" fx="50%" fy="100%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
        <Mask id="footMask" x="0" y="0" width={width} height={tall} maskUnits="userSpaceOnUse">
          <Ellipse cx={width / 2} cy={tall} rx={width * 0.75} ry={tall} fill="url(#footFade)" />
        </Mask>
        <Tooth id="glowTooth" />
      </Defs>
      <Ellipse cx={width / 2} cy={tall} rx={width * 0.75} ry={tall} fill="url(#footGlow)" />
      <Ellipse cx={width / 2} cy={tall} rx={width * 0.75} ry={tall} fill="url(#glowTooth)" opacity={0.7} mask="url(#footMask)" />
    </Svg>
  );
}

/**
 * The sun: Safran at its top melting into the accent, its Safran under-print a little apart, its far
 * side shaded toward the night, the ink's tooth over it, a grainy halo round it; cut by hand, its edge
 * wavering slowly as it climbs. Only its edge is drawn each frame; the rest is carried up whole.
 */
function RisoSun({ width, height, rise, clock }: { readonly width: number; readonly height: number; readonly rise: SharedValue<number>; readonly clock: SharedValue<number> }) {
  const theme = useTheme();
  const radius = width * 0.3;
  const size = Math.ceil(radius * 4.4);
  const c = size / 2;
  // From just under the sea line to half out of it, behind the water (the panel and the buttons stand over it).
  const from = height * 0.86 + radius * 1.05;
  const to = height * 0.8;
  const carried = useAnimatedStyle(() => ({ transform: [{ translateY: from + (to - from) * rise.value - c }] }));
  const edge = useAnimatedProps(() => ({ d: organicRing({ cx: c, cy: c, radius, amplitude: 2.2, waves: 6, phase: clock.value * 0.00035, seed: 2.6 }, 64) }));
  const under = useAnimatedProps(() => ({ d: organicRing({ cx: c + MISREGISTER.x, cy: c + MISREGISTER.y, radius: radius + 1, amplitude: 2.6, waves: 6, phase: clock.value * 0.0003 + 0.8, seed: 4.1 }, 64) }));
  const halo = radius * 2.1;

  return (
    <Animated.View style={[styles.sun, { left: width / 2 - c, width: size, height: size }, carried]}>
      {/* The halo: a gradient, its grain fading with it. */}
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="haloGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0.4" stopColor={theme.color.waiting} stopOpacity={0.5} />
            <Stop offset="0.62" stopColor={theme.color.action} stopOpacity={0.18} />
            <Stop offset="1" stopColor={theme.color.action} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="haloFade" cx="50%" cy="50%" r="50%">
            <Stop offset="0.4" stopColor="#FFFFFF" stopOpacity={1} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
          <Mask id="haloMask" x="0" y="0" width={size} height={size} maskUnits="userSpaceOnUse">
            <Circle cx={c} cy={c} r={halo} fill="url(#haloFade)" />
          </Mask>
          <Tooth id="haloTooth" />
        </Defs>
        <Circle cx={c} cy={c} r={halo} fill="url(#haloGlow)" />
        <Circle cx={c} cy={c} r={halo} fill="url(#haloTooth)" opacity={0.75} mask="url(#haloMask)" />
      </Svg>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="sunInk" x1="0.3" y1="0" x2="0.6" y2="1">
            <Stop offset="0" stopColor={theme.color.waiting} />
            <Stop offset="0.55" stopColor={theme.color.action} />
            <Stop offset="1" stopColor={theme.color.action} />
          </LinearGradient>
          {/* The far side, turned from the light, toward the night's dark. */}
          <LinearGradient id="sunShade" x1="0.2" y1="0.15" x2="0.9" y2="0.95">
            <Stop offset="0.45" stopColor={theme.color.wall} stopOpacity={0} />
            <Stop offset="1" stopColor={theme.color.wall} stopOpacity={0.55} />
          </LinearGradient>
          <Tooth id="sunTooth" />
        </Defs>
        <AnimatedPath animatedProps={under} fill={theme.color.waiting} opacity={0.9} />
        <AnimatedPath animatedProps={edge} fill="url(#sunInk)" opacity={0.94} />
        <AnimatedPath animatedProps={edge} fill="url(#sunShade)" />
        <AnimatedPath animatedProps={edge} fill="url(#sunTooth)" opacity={0.85} />
      </Svg>
    </Animated.View>
  );
}

/** A band's path each frame: its crests running at its pace, risen with the dawn, tipped with the slosh. */
function useBandProps(band: Band, index: number, clock: SharedValue<number>, pace: SharedValue<number>, rise: SharedValue<number>, kind: Props['kind'], width: number, height: number) {
  return useAnimatedProps(() => {
    const t = clock.value;
    const baseline = height * (band.low + (band.high - band.low) * rise.value);
    // Sloshing: tipped one way then the other with the hourglass, each band a beat behind the one before.
    const tilt = kind === 'slosh' ? 34 * Math.sin((TAU * t) / SLOSH_MS - index * 0.6) : 0;
    const swell = band.amplitude * (0.55 + 0.45 * pace.value);
    // Its foot well under the screen, so its outline (the crest's second pass) never shows there.
    return { d: waveBand({ width, height: height + 40, baseline, amplitude: swell, wavelength: width * band.wavelength, phase: t * band.speed + index * 1.7, tilt, seed: index * 1.9 + 0.4, steps: 32 }) };
  });
}

export const Tide = memo(TideComponent);

const styles = StyleSheet.create({
  glow: { position: 'absolute', left: 0 },
  sun: { position: 'absolute', top: 0 },
});
