/**
 * A switch drawn as the web's (`controls.module.css`): a capsule track 52 by 32 edged 2px, and a
 * dot that slides across it, growing from 16 to 24 as it goes (Material 3's). Off: the well edged
 * in `edge`, the dot in the second ink. On: the primary's focus, the dot in the action's own ink.
 * The capsule and the circle are the toggle everyone reads, the one control allowed them (the Soft
 * Sheet Control Rule), so plain views draw them.
 *
 * `SwitchMark` is the picture alone, for a row that is the switch itself (its words its label);
 * `Switch` is a control of its own. Never React Native's: Android draws its own, off the system.
 */
import React, { memo, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { duration, standard } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import { Tappable } from './Tappable';

const WIDTH = 52;
const HEIGHT = 32;
const EDGE = 2;
const DOT = 24;
/** Inside the edge, the dot keeps 2 to the track on every side once it is full size. */
const INSET = 2;
/** From its place off to its place on. */
const TRAVEL = WIDTH - EDGE * 2 - INSET * 2 - DOT;
/** Off, the dot is 16 of its 24. */
const OFF_SCALE = 16 / DOT;
/** 32 tall: the slop reaches Material's 48. */
const SLOP = { top: 8, bottom: 8, left: 4, right: 4 };

function SwitchMarkComponent({ checked }: { checked: boolean }) {
  const theme = useTheme();
  const { paperHigh, edge, focus, inkFaint, onAction } = theme.color;
  // The colours change in 150, the dot travels in 250 (the web's two transitions).
  const tone = useSharedValue(checked ? 1 : 0);
  const slide = useSharedValue(checked ? 1 : 0);
  useEffect(() => {
    tone.value = withTiming(checked ? 1 : 0, { duration: duration.short, easing: standard });
    slide.value = withTiming(checked ? 1 : 0, { duration: duration.medium, easing: standard });
  }, [checked, tone, slide]);
  const track = useAnimatedStyle(
    () => ({ backgroundColor: interpolateColor(tone.value, [0, 1], [paperHigh, focus]), borderColor: interpolateColor(tone.value, [0, 1], [edge, focus]) }),
    [paperHigh, edge, focus],
  );
  const dot = useAnimatedStyle(
    () => ({
      backgroundColor: interpolateColor(tone.value, [0, 1], [inkFaint, onAction]),
      transform: [{ translateX: slide.value * TRAVEL }, { scale: OFF_SCALE + slide.value * (1 - OFF_SCALE) }],
    }),
    [inkFaint, onAction],
  );
  return (
    <Animated.View style={[styles.track, track]} importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <Animated.View style={[styles.dot, dot]} />
    </Animated.View>
  );
}

/** The picture of a switch, for a row that is the switch itself. */
export const SwitchMark = memo(SwitchMarkComponent);

export interface SwitchProps {
  readonly value: boolean;
  readonly onValueChange: (value: boolean) => void;
  readonly accessibilityLabel: string;
  readonly disabled?: boolean;
}

/** A switch of its own, beside words that are not pressable. Its feedback is the dot moving. */
function SwitchComponent({ value, onValueChange, accessibilityLabel, disabled = false }: SwitchProps) {
  return (
    <Tappable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      ownDisabled
      noTint
      hitSlop={SLOP}
      style={styles.target}
    >
      <SwitchMark checked={value} />
    </Tappable>
  );
}

export const Switch = memo(SwitchComponent);

const styles = StyleSheet.create({
  target: { width: WIDTH, height: HEIGHT },
  track: { width: WIDTH, height: HEIGHT, borderWidth: EDGE, borderRadius: HEIGHT / 2 },
  dot: { position: 'absolute', top: INSET, left: INSET, width: DOT, height: DOT, borderRadius: DOT / 2 },
});
