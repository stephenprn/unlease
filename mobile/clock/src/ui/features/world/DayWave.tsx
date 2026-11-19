/**
 * The world clocks' day wave (`clock/services/dayWave.ts`): one wave of the day across the screen,
 * drawn with a brush, its day's swell a grainy gradient (Safran melting into the accent), midnight at both ends, noon about its crest, the horizon through it. It breathes:
 * its swell rises and settles a little, slowly, and every mark rides it. The day's swell is washed in
 * Safran, the night's hollows in the second ink. Here rides it as the accent's mark, a ring rippling
 * out of it every few seconds (« you are here »); each city as a smaller mark, the sun's colour by day,
 * the accent at dusk, hollow at night, its name over it. Slid on the ruler, they all ride along; the
 * hours stand under the horizon. TalkBack skips it: the cards below say each city's time. Reduce
 * Motion: no breath, no ripple.
 */
import React, { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Line, Mask, Path, Rect, Stop } from 'react-native-svg';

import { clockWords } from '@unlease/calendar/services/eventText';
import { deviceZone } from '@unlease/calendar/services/time';
import type { WorldClock } from '@unlease/clock/models/worldClock';
import { placeMarks, waveMarks, type PlacedMark } from '@unlease/clock/services/dayWave';
import { withAlpha } from '@unlease/design/color';
import { dayBrush, dayWave, dayWaveY } from '@unlease/design/waves';
import { AppText } from '@shared/ui/components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

import { Tooth } from '../riso';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const HEIGHT = 176;
const MIDDLE = 100;
const AMPLITUDE = 44;
/** The wave's ends sit in from the screen's edges, so a mark at midnight stays whole. */
const SIDE = 20;
const LINE = 16;
const RIPPLE_MS = 2600;
/** One breath of the wave, in and out. */
const BREATH_MS = 14_000;
const TAU = Math.PI * 2;

interface Props {
  readonly clocks: readonly WorldClock[];
  /** The moment shown: now, or where the ruler points. */
  readonly at: number;
  readonly width: number;
  readonly twelveHours: boolean;
  /** The place shown: hidden, it rests. */
  readonly active: boolean;
}

function DayWaveComponent({ clocks, at, width, twelveHours, active }: Props) {
  const theme = useTheme();
  const still = useReducedMotion();
  const inner = Math.max(1, width - SIDE * 2);
  const marks = useMemo(() => placeMarks(waveMarks(clocks, at, deviceZone()), { width: inner, middle: MIDDLE, amplitude: AMPLITUDE, line: LINE, charWidth: 7.2 }), [clocks, at, inner]);
  const here = marks.find(mark => mark.here);

  const breath = useSharedValue(0);
  const ripple = useSharedValue(0);
  useEffect(() => {
    if (still || !active) {
      cancelAnimation(breath);
      cancelAnimation(ripple);
      ripple.value = 0;
      return;
    }
    breath.value = withRepeat(withTiming(breath.value + TAU, { duration: BREATH_MS, easing: Easing.linear }), -1, false);
    ripple.value = withRepeat(withTiming(1, { duration: RIPPLE_MS, easing: Easing.out(Easing.quad) }), -1, false);
  }, [still, active, breath, ripple]);

  // The day's swell (6:00 to 18:00) above the horizon, the night's hollows under it, each filled to it; then the brush over them.
  const dayFill = useAnimatedProps(() => ({ d: `${dayWave(inner, MIDDLE, AMPLITUDE, 0.25, 0.75, 32, breath.value)}Z` }));
  const morningFill = useAnimatedProps(() => ({ d: `${dayWave(inner, MIDDLE, AMPLITUDE, 0, 0.25, 16, breath.value)}L0 ${MIDDLE}Z` }));
  const eveningFill = useAnimatedProps(() => ({ d: `${dayWave(inner, MIDDLE, AMPLITUDE, 0.75, 1, 16, breath.value)}L${inner * 0.75} ${MIDDLE}Z` }));
  const dayLine = useAnimatedProps(() => ({ d: dayBrush(inner, MIDDLE, AMPLITUDE, 4.5, 0.235, 0.765, breath.value) }));
  const morningLine = useAnimatedProps(() => ({ d: dayBrush(inner, MIDDLE, AMPLITUDE, 3, 0, 0.26, breath.value, 16) }));
  const eveningLine = useAnimatedProps(() => ({ d: dayBrush(inner, MIDDLE, AMPLITUDE, 3, 0.74, 1, breath.value, 16) }));

  const hours = [0.25, 0.5, 0.75].map(share => ({ share, words: clockWords(`${String(share * 24).padStart(2, '0')}:00`, twelveHours) }));
  const night = withAlpha(theme.color.inkMuted, 0.1);

  return (
    <View style={[styles.frame, { width, height: HEIGHT }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <Svg width={width} height={HEIGHT}>
        <Defs>
          {/* The day's swell: Safran at the crest, melting into the accent and gone by the horizon, grainy. */}
          <LinearGradient id="dayInk" x1="0" y1={MIDDLE - AMPLITUDE * 1.25} x2="0" y2={MIDDLE} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={theme.color.waiting} stopOpacity={0.55} />
            <Stop offset="0.6" stopColor={theme.color.action} stopOpacity={0.22} />
            <Stop offset="1" stopColor={theme.color.action} stopOpacity={0.04} />
          </LinearGradient>
          <LinearGradient id="dayFade" x1="0" y1={MIDDLE - AMPLITUDE * 1.25} x2="0" y2={MIDDLE} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.1} />
          </LinearGradient>
          <Mask id="dayMask" x="0" y="0" width={width} height={HEIGHT} maskUnits="userSpaceOnUse">
            <Rect x={0} y={0} width={width} height={HEIGHT} fill="url(#dayFade)" />
          </Mask>
          <Tooth id="dayTooth" />
        </Defs>
        <AnimatedPath animatedProps={dayFill} transform={`translate(${SIDE} 0)`} fill="url(#dayInk)" />
        <AnimatedPath animatedProps={dayFill} transform={`translate(${SIDE} 0)`} fill="url(#dayTooth)" opacity={0.6} mask="url(#dayMask)" />
        <AnimatedPath animatedProps={morningFill} transform={`translate(${SIDE} 0)`} fill={night} />
        <AnimatedPath animatedProps={eveningFill} transform={`translate(${SIDE} 0)`} fill={night} />
        <Line x1={6} x2={width - 6} y1={MIDDLE} y2={MIDDLE} stroke={theme.color.hairline} strokeWidth={1} />
        <AnimatedPath animatedProps={morningLine} transform={`translate(${SIDE} 0)`} fill={theme.color.inkFaint} />
        <AnimatedPath animatedProps={eveningLine} transform={`translate(${SIDE} 0)`} fill={theme.color.inkFaint} />
        <AnimatedPath animatedProps={dayLine} transform={`translate(${SIDE} 0)`} fill={theme.color.waiting} />
        {here ? <Ripple mark={here} breath={breath} ripple={ripple} /> : null}
        {marks.map(mark => (
          <Mark key={mark.key} mark={mark} breath={breath} />
        ))}
      </Svg>
      {hours.map(hour => (
        <AppText key={hour.share} variant="labelSmall" color={theme.color.inkFaint} style={[styles.hour, { left: SIDE + hour.share * inner - 30 }]}>
          {hour.words}
        </AppText>
      ))}
      {marks.map(mark => (
        <Name key={mark.key} mark={mark} breath={breath} />
      ))}
    </View>
  );
}

/** How far the breathing wave has carried a mark from where it was placed. */
function useRide(mark: PlacedMark, breath: SharedValue<number>) {
  return useAnimatedStyle(() => ({ transform: [{ translateY: dayWaveY(mark.share, MIDDLE, AMPLITUDE, breath.value) - mark.y }] }));
}

/** A mark on the wave: here the accent's, larger; a city the sun's colour by day, the accent at dusk, hollow at night. */
function Mark({ mark, breath }: { readonly mark: PlacedMark; readonly breath: SharedValue<number> }) {
  const theme = useTheme();
  const fill = mark.here ? theme.color.action : mark.light === 'day' ? theme.color.waiting : mark.light === 'dusk' ? theme.color.action : theme.color.paper;
  const ring = mark.here || mark.light !== 'night' ? theme.color.wall : theme.color.inkMuted;
  const props = useAnimatedProps(() => ({ cy: dayWaveY(mark.share, MIDDLE, AMPLITUDE, breath.value) }));
  return <AnimatedCircle animatedProps={props} cx={SIDE + mark.x} r={mark.here ? 8 : 6} fill={fill} stroke={ring} strokeWidth={mark.here || mark.light !== 'night' ? 2.5 : 2} />;
}

/** Here, a ring rippling out of its mark. */
function Ripple({ mark, breath, ripple }: { readonly mark: PlacedMark; readonly breath: SharedValue<number>; readonly ripple: SharedValue<number> }) {
  const theme = useTheme();
  const props = useAnimatedProps(() => ({ cy: dayWaveY(mark.share, MIDDLE, AMPLITUDE, breath.value), r: 8 + 16 * ripple.value, strokeOpacity: ripple.value === 0 ? 0 : 0.6 * (1 - ripple.value) }));
  return <AnimatedCircle animatedProps={props} cx={SIDE + mark.x} fill="none" stroke={theme.color.action} strokeWidth={2} />;
}

/** A name over its mark, riding with it. */
function Name({ mark, breath }: { readonly mark: PlacedMark; readonly breath: SharedValue<number> }) {
  const theme = useTheme();
  const ride = useRide(mark, breath);
  return (
    <Animated.View style={[styles.name, { left: SIDE + mark.labelX - mark.labelWidth / 2 - 8, top: mark.labelTop, width: mark.labelWidth + 16 }, ride]}>
      <AppText variant={mark.here ? 'labelStrong' : 'labelSmall'} color={mark.here ? theme.color.action : theme.color.inkMuted} numberOfLines={1} style={styles.center}>
        {mark.name}
      </AppText>
    </Animated.View>
  );
}

/** A small wave of the day, a card's own, drawn with the same brush: its mark where the city's hour is. */
export const MiniDayWave = memo(function MiniDayWave({ share, light }: { readonly share: number; readonly light: PlacedMark['light'] }) {
  const theme = useTheme();
  const width = 48;
  const middle = 16;
  const amplitude = 9;
  const fill = light === 'day' ? theme.color.waiting : light === 'dusk' ? theme.color.action : theme.color.paper;
  return (
    <Svg width={width + 12} height={32} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Line x1={1} x2={width + 11} y1={middle} y2={middle} stroke={theme.color.hairline} strokeWidth={1} />
      <Path d={dayBrush(width, middle, amplitude, 2.2, 0, 1, 0, 24)} transform="translate(6 0)" fill={theme.color.inkFaint} />
      <Circle cx={6 + share * width} cy={dayWaveY(share, middle, amplitude)} r={4.5} fill={fill} stroke={light === 'night' ? theme.color.inkMuted : theme.color.paper} strokeWidth={light === 'night' ? 1.5 : 2} />
    </Svg>
  );
});

export const DayWave = memo(DayWaveComponent);

const styles = StyleSheet.create({
  frame: { alignSelf: 'center' },
  hour: { position: 'absolute', width: 60, textAlign: 'center', top: HEIGHT - 20 },
  name: { position: 'absolute' },
  center: { textAlign: 'center' },
});
