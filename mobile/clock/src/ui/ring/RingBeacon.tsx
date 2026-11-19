/**
 * What rings, as a beacon: its glyph (the alarm clock, the hourglass) in the accent's ink on the
 * brand's pebble, filled in the accent, with two echoes rippling out of it one after the other as a
 * sound spreads: wavy rings drawn by a hand (Clock's wave), lopsided, their uneven crests turning
 * as they go, swelling as they fade. The alarm clock shakes in short bursts, as a bell clock does; the
 * hourglass turns over, then waits, as one does on a kitchen shelf. The ringing windows' one authored
 * moment, shared by the alarm's and the timer's. Reduce Motion: still, no echo.
 */
import React, { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import type { GlyphName } from '@unlease/design/glyphs';
import { organicRing } from '@unlease/design/waves';
import { Icon, Organic } from '@shared/ui/components';
import { decelerate, standard } from '@shared/ui/theme/motion';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

/** The pebble: the capture pebble's proportions, a size up. */
const WIDTH = 104;
const HEIGHT = 96;
/** An echo's life, and how far it spreads. */
const ECHO_MS = 2400;
const ECHO_SCALE = 1.9;
/** The echoes' room: the beacon's, grown to their widest. */
const ROOM = Math.ceil(WIDTH * ECHO_SCALE) + 16;
const AnimatedPath = Animated.createAnimatedComponent(Path);

interface Props {
  readonly glyph: Extract<GlyphName, 'alarm' | 'timer'>;
  readonly motion: 'shake' | 'turn';
  /** Still once answered (snoozed, stopped). */
  readonly active: boolean;
}

function Echo({ phase, delay, turn, active, still }: { readonly phase: SharedValue<number>; readonly delay: number; readonly turn: 1 | -1; readonly active: boolean; readonly still: boolean }) {
  const theme = useTheme();
  useEffect(() => {
    if (!active || still) {
      cancelAnimation(phase);
      phase.value = 0;
      return;
    }
    phase.value = 0;
    phase.value = withDelay(delay, withRepeat(withTiming(1, { duration: ECHO_MS, easing: Easing.out(Easing.quad) }), -1, false));
  }, [active, still, delay, phase]);
  // From the pebble's edge outward, its swell growing from 2 to 7 and its crests turning a third of a crest each way.
  const props = useAnimatedProps(() => ({
    d: organicRing({ cx: ROOM / 2, cy: ROOM / 2, radius: (HEIGHT / 2 + 2) * (1 + (ECHO_SCALE - 1) * phase.value), amplitude: 1.5 + 6 * phase.value, waves: 7, phase: turn * phase.value * 2.6, seed: turn === 1 ? 0.7 : 3.4 }, 64),
    strokeOpacity: phase.value === 0 ? 0 : 0.7 * (1 - phase.value),
    strokeWidth: 2.5 - phase.value,
  }));
  return (
    <Svg pointerEvents="none" width={ROOM} height={ROOM} style={styles.echo}>
      <AnimatedPath animatedProps={props} fill="none" stroke={theme.color.action} strokeLinejoin="round" />
    </Svg>
  );
}

function RingBeaconComponent({ glyph, motion, active }: Props) {
  const theme = useTheme();
  const still = useReducedMotion();
  const turn = useSharedValue(0);
  const first = useSharedValue(0);
  const second = useSharedValue(0);

  useEffect(() => {
    if (!active || still) {
      cancelAnimation(turn);
      turn.value = withTiming(motion === 'turn' ? Math.round(turn.value / 180) * 180 : 0, { duration: 150, easing: decelerate });
      return;
    }
    if (motion === 'shake') {
      // A bell clock's burst: six quick swings, fading, then a breath.
      const swing = (to: number, ms: number) => withTiming(to, { duration: ms, easing: standard });
      turn.value = withRepeat(withSequence(swing(-14, 70), swing(13, 110), swing(-11, 100), swing(9, 90), swing(-6, 80), swing(0, 70), withDelay(900, swing(0, 1))), -1, false);
    } else {
      // The hourglass turned over, then left to run; turned again. At 360 it is as at 0: the loop never jumps.
      const over = (to: number) => withTiming(to, { duration: 700, easing: Easing.inOut(Easing.cubic) });
      turn.value = 0;
      turn.value = withRepeat(withSequence(withDelay(900, over(180)), withDelay(1500, over(360)), withTiming(0, { duration: 0 })), -1, false);
    }
  }, [active, still, motion, turn]);

  const glyphStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));

  return (
    <View style={styles.beacon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Echo phase={first} delay={0} turn={1} active={active} still={still} />
      <Echo phase={second} delay={ECHO_MS / 2} turn={-1} active={active} still={still} />
      <Organic pebble={0} style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: theme.color.action }]}>
        <Animated.View style={glyphStyle}>
          <Icon name={glyph} solid size={48} color={theme.color.onAction} />
        </Animated.View>
      </Organic>
    </View>
  );
}

export const RingBeacon = memo(RingBeaconComponent);

const styles = StyleSheet.create({
  beacon: { width: WIDTH, height: HEIGHT, alignSelf: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  echo: { position: 'absolute', left: (WIDTH - ROOM) / 2, top: (HEIGHT - ROOM) / 2 },
});
