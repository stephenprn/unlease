/**
 * What rings, as a beacon: its glyph (the alarm clock, the hourglass) in the accent's ink on the
 * brand's pebble, filled in the accent, with two echoes of the pebble rippling out of it, one after
 * the other, as a sound spreads. The alarm clock shakes in short bursts, as a bell clock does; the
 * hourglass turns over, then waits, as one does on a kitchen shelf. The ringing windows' one authored
 * moment, shared by the alarm's and the timer's. Reduce Motion: still, no echo.
 */
import React, { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';

import type { GlyphName } from '@unlease/design/glyphs';
import { Icon, Organic } from '@shared/ui/components';
import { decelerate, standard } from '@shared/ui/theme/motion';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

/** The pebble: the capture pebble's proportions, a size up. */
const WIDTH = 104;
const HEIGHT = 96;
/** An echo's life, and how far it spreads. */
const ECHO_MS = 2400;
const ECHO_SCALE = 1.9;

interface Props {
  readonly glyph: Extract<GlyphName, 'alarm' | 'timer'>;
  readonly motion: 'shake' | 'turn';
  /** Still once answered (snoozed, stopped). */
  readonly active: boolean;
}

function Echo({ phase, delay, active, still }: { readonly phase: SharedValue<number>; readonly delay: number; readonly active: boolean; readonly still: boolean }) {
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
  const style = useAnimatedStyle(() => ({ opacity: phase.value === 0 ? 0 : 0.55 * (1 - phase.value), transform: [{ scale: 1 + (ECHO_SCALE - 1) * phase.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Organic pebble={0} style={[StyleSheet.absoluteFill, { borderWidth: 2, borderColor: theme.color.action }]} />
    </Animated.View>
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
      <Echo phase={first} delay={0} active={active} still={still} />
      <Echo phase={second} delay={ECHO_MS / 2} active={active} still={still} />
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
});
