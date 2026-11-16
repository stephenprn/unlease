/**
 * The days of a week, each turned on or off: seven round toggles in the week's order (from
 * `weekStart`), each its day's letter, its name read out. A day on lies on the primary's wash within
 * the primary's edge (matcha chooses), its letter in that wash's ink; off, the control's edge on the
 * field's veil. Round toggles are controls, never the brand's pebble: the letter sits on a plain
 * circle. Clock's alarm days and Agenda's working days.
 */
import React, { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { t } from '@unlease/core/i18n';
import { weekdayNames } from '@unlease/core/services/format';

import { duration, standard } from '../theme/motion';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { AppText } from './AppText';
import { Tappable } from './Tappable';

const DOT = 42;
/** Material's 48 to the finger. */
const SLOP = { top: 3, bottom: 3, left: 3, right: 3 };

/** The week's days from `weekStart` (1 Monday: 1 2 3 4 5 6 0). */
const weekOrder = (weekStart: number): number[] => Array.from({ length: 7 }, (_, index) => (weekStart + index) % 7);

/** A day's letter (« L », « M »; English « M », « T »): its name's first. */
const letterOf = (day: number): string => weekdayNames()[day]!.charAt(0).toLocaleUpperCase();

function DayToggle({ day, on, disabled, onPress }: { day: number; on: boolean; disabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { fieldVeil, edge, actionContainer, focus } = theme.color;
  const [pressed, setPressed] = useState(false);
  // The colours change hands in 150, as a switch's.
  const tone = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    tone.value = withTiming(on ? 1 : 0, { duration: duration.short, easing: standard });
  }, [on, tone]);
  const paint = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(tone.value, [0, 1], [fieldVeil, actionContainer]),
    borderColor: interpolateColor(tone.value, [0, 1], [edge, focus]),
    borderWidth: 1 + tone.value,
  }));
  return (
    <Tappable
      noTint
      hitSlop={SLOP}
      accessibilityRole="checkbox"
      accessibilityLabel={weekdayNames()[day]}
      accessibilityState={{ checked: on, disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={styles.target}
    >
      <Animated.View style={[styles.dot, paint]}>
        {/* The press, inside the circle. */}
        {pressed ? <View style={[styles.press, { backgroundColor: theme.press.tint }]} /> : null}
        <AppText variant={on ? 'labelStrong' : 'label'} color={on ? theme.color.onActionContainer : theme.color.ink}>
          {letterOf(day)}
        </AppText>
      </Animated.View>
    </Tappable>
  );
}

export interface WeekdayTogglesProps {
  readonly days: readonly number[];
  /** 0 Sunday, 1 Monday, 6 Saturday. */
  readonly weekStart: number;
  /** The days, each once, sorted. */
  readonly onChange: (days: number[]) => void;
  readonly disabled?: boolean;
  /** What the group is read out as (« Jours », « Jours travaillés »). */
  readonly label?: string;
}

function WeekdayTogglesComponent({ days, weekStart, onChange, disabled = false, label }: WeekdayTogglesProps) {
  const styles = useThemedStyles(makeStyles);
  const toggle = (day: number): void => onChange((days.includes(day) ? days.filter(each => each !== day) : [...days, day]).sort((a, b) => a - b));
  return (
    <View style={styles.week} accessibilityRole="none" accessibilityLabel={label ?? t('Days')}>
      {weekOrder(weekStart).map(day => (
        <DayToggle key={day} day={day} on={days.includes(day)} disabled={disabled} onPress={() => toggle(day)} />
      ))}
    </View>
  );
}

export const WeekdayToggles = memo(WeekdayTogglesComponent);

const makeStyles = (_theme: Theme) =>
  StyleSheet.create({
    week: { flexDirection: 'row', justifyContent: 'space-between' },
    target: { width: DOT, height: DOT },
    dot: { width: DOT, height: DOT, borderRadius: DOT / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    press: { ...StyleSheet.absoluteFill },
  });
