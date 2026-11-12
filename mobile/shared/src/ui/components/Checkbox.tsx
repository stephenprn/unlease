/**
 * The checkbox (`design/checkbox`, the web's drawing): a box with the continuous corner, its edge in
 * the second ink while open; checked, filled in ink with the tick punched through, so the note's
 * paper, wash or gradient shows in the tick. `recede` fills it in the second ink instead, for an
 * item done (a checklist's, a to-do, an ingredient cooked) that steps back with its words. Neutral
 * on any note colour, never matcha. The fill presses in from a little smaller in 150 (Reduce Motion
 * ends it at once); the edge stays put under it, so the box never loses its line mid-change.
 *
 * `CheckMark` is the picture alone, for a row that is the checkbox itself (its words its label);
 * `Checkbox` is a control of its own, its tint on a pebble round the box. Disabled (a note in the
 * bin) it reads the same and does nothing. `compact` (a page's to-dos, a line apart) presses on a
 * pebble just round its box, so stacked boxes keep clear of each other; its reach stays a finger
 * wide and a row tall.
 */
import React, { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { CHECK_EDGE, CHECK_EDGE_PATH, CHECK_FILL_PATH, CHECK_GRID, CHECK_VIEWBOX } from '@unlease/design/checkbox';

import { duration, standard } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import { Tappable } from './Tappable';

/** Unchecked, the fill waits this much smaller: checking presses it into the box. */
const FILL_FROM = 0.7;
/** A compact box's pebble: 26 across, so to-dos 30 apart keep 4 clear between their tints. */
const COMPACT = 26;
/** A compact box's reach: 44 wide, and 30 high, a page's to-do's pitch, so it never reaches into the next one's. */
const COMPACT_SLOP = { top: 2, bottom: 2, left: 9, right: 9 } as const;

export interface CheckMarkProps {
  readonly checked: boolean;
  readonly recede?: boolean;
  readonly size?: number;
}

function CheckMarkComponent({ checked, recede = false, size = CHECK_GRID }: CheckMarkProps) {
  const theme = useTheme();
  const on = useSharedValue(checked ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(checked ? 1 : 0, { duration: duration.short, easing: standard });
  }, [checked, on]);
  const filled = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ scale: FILL_FROM + (1 - FILL_FROM) * on.value }] }));
  return (
    <View style={{ width: size, height: size }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox={CHECK_VIEWBOX} style={StyleSheet.absoluteFill}>
        <Path d={CHECK_EDGE_PATH} fill="none" stroke={theme.color.inkMuted} strokeWidth={CHECK_EDGE} />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, filled]}>
        <Svg width={size} height={size} viewBox={CHECK_VIEWBOX}>
          <Path d={CHECK_FILL_PATH} fill={recede ? theme.color.inkMuted : theme.color.ink} fillRule="evenodd" />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** The picture of a checkbox, for a row that is the checkbox itself. */
export const CheckMark = memo(CheckMarkComponent);

export interface CheckboxProps {
  readonly checked: boolean;
  readonly onToggle: () => void;
  readonly label: string;
  readonly disabled?: boolean;
  readonly compact?: boolean;
  readonly recede?: boolean;
}

function CheckboxComponent({ checked, onToggle, label, disabled = false, compact = false, recede = false }: CheckboxProps) {
  return (
    <Tappable accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} accessibilityLabel={label} onPress={onToggle} disabled={disabled} ownDisabled hitSlop={compact ? COMPACT_SLOP : 4} pebble={1} style={compact ? styles.compact : styles.target}>
      <CheckMark checked={checked} recede={recede} />
    </Tappable>
  );
}

const styles = StyleSheet.create({
  target: { width: 40, height: 40, margin: 2, alignItems: 'center', justifyContent: 'center' },
  compact: { width: COMPACT, height: COMPACT, alignItems: 'center', justifyContent: 'center' },
});

export const Checkbox = memo(CheckboxComponent);
