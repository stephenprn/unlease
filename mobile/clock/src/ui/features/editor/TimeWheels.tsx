/**
 * The alarm's time, set with a thumb: two wheels, hours and minutes (and AM / PM on a 12-hour clock),
 * in Signika's tabular figures at the screen's largest size. The chosen row lies on the primary's
 * wash, a sheet across the wheels; the rows around it shrink and fade as they leave it, so the time
 * reads at a glance. A wheel snaps to each row, clicks as each value passes, comes round again (59
 * then 00), and a row above or below is a tap away. AM / PM is two rows a tap moves, never a scroller:
 * a drag on it is the page's. TalkBack adjusts each wheel by one (`adjustable`).
 *
 * A wheel sits in the editor's page, which scrolls too: Android hands a wheel's drag to the page only
 * once the wheel can go no further, so a wheel always has a whole turn of rows on either side. It is
 * set on the middle of its three copies as it starts (its offset given once, never again: React
 * Native scrolls a ScrollView to its `contentOffset` each time that prop changes, under the finger),
 * as each drag starts, and as it comes to rest, every move made between copies of the same rows.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import Animated, { Extrapolation, interpolate, runOnJS, scrollTo, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { clockOf, clockParts } from '@unlease/clock/services/editor';
import { haptic } from '@shared/platform/haptics';

import { AppText, Organic, Tappable } from '@shared/ui/components';
import { duration, standard } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

/** One row of a wheel; three show, the chosen one in the middle. */
const ROW = 64;
const SHOWN = 3;
/** A wheel holds its values three times over, kept on the middle ones as a drag starts and once it settles. */
const COPIES = 3;

const HOURS_24 = Array.from({ length: 24 }, (_, hour) => hour);
const HOURS_12 = [12, ...Array.from({ length: 11 }, (_, index) => index + 1)];
const MINUTES = Array.from({ length: 60 }, (_, minute) => minute);
const HALVES = [0, 1];

const two = (value: number): string => String(value).padStart(2, '0');

const WheelRow = memo(function WheelRow({ index, offset, text, onPress }: { index: number; offset: SharedValue<number>; text: string; onPress: (index: number) => void }) {
  const styles = useThemedStyles(makeStyles);
  // Shrinking and fading as it leaves the middle: the chosen time reads alone.
  const look = useAnimatedStyle(() => {
    const away = Math.abs(offset.value / ROW - index);
    return {
      opacity: interpolate(away, [0, 1, 2], [1, 0.38, 0.1], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(away, [0, 1, 2], [1, 0.66, 0.5], Extrapolation.CLAMP) }],
    };
  });
  return (
    <Tappable noTint accessible={false} onPress={() => onPress(index)} style={styles.row}>
      <Animated.View style={look}>
        <AppText variant="display" style={styles.figures}>
          {text}
        </AppText>
      </Animated.View>
    </Tappable>
  );
});

interface WheelProps {
  readonly values: readonly number[];
  readonly value: number;
  readonly format: (value: number) => string;
  /** What TalkBack calls it (« Heures »). */
  readonly label: string;
  readonly width: number;
  readonly onChange: (value: number) => void;
}

/** A wheel that comes round again past its last value (59 then 00). */
function Wheel({ values, value, format, label, width, onChange }: WheelProps) {
  const styles = useThemedStyles(makeStyles);
  const count = values.length;
  // Its rows start on the middle copy.
  const first = count;
  const rows = useMemo(() => Array.from({ length: count * COPIES }, (_, index) => values[index % count]!), [values, count]);
  const at = Math.max(0, values.indexOf(value));
  const scroller = useAnimatedRef<Animated.ScrollView>();
  // Where it opens, given once: a later value reaches it through `scrollTo`, never through this prop.
  const [start] = useState(() => ({ x: 0, y: (first + at) * ROW }));
  const offset = useSharedValue(start.y);
  // The value this wheel last said: a change from outside (the clock's format, a draft handed in) turns it there.
  const said = useRef(value);

  useEffect(() => {
    if (value === said.current) return;
    said.current = value;
    scroller.current?.scrollTo({ y: (first + Math.max(0, values.indexOf(value))) * ROW, animated: true });
  }, [value, values, first, scroller]);

  const landed = useCallback(
    (index: number) => {
      const next = rows[Math.min(rows.length - 1, Math.max(0, index))];
      if (next === undefined || next === said.current) return;
      said.current = next;
      haptic('tick');
      onChange(next);
    },
    [rows, onChange],
  );

  // Each value passing the middle, as the finger turns it.
  useAnimatedReaction(
    () => Math.round(offset.value / ROW),
    (index, before) => {
      if (before !== null && index !== before) runOnJS(landed)(index);
    },
    [landed],
  );
  const turn = count * ROW;
  const onScroll = useAnimatedScrollHandler({
    onScroll: event => {
      offset.value = event.contentOffset.y;
    },
    // A finger takes it: onto the middle copy, at the same point of the same row, before it moves
    // (a drag scrolls by how far the finger goes from there, so nothing shows). A whole turn lies on
    // either side then, and the page never takes the rest of the drag.
    onBeginDrag: event => {
      const y = event.contentOffset.y;
      const copy = Math.min(COPIES - 1, Math.max(0, Math.floor((y + ROW / 2) / turn)));
      if (copy !== 1) scrollTo(scroller, 0, y - (copy - 1) * turn, false);
    },
  });

  // Settled: back on the middle copy of the same value, where it can turn either way again (nothing moves on screen).
  const recentre = (y: number): void => {
    const index = Math.round(y / ROW);
    const middle = count + (((index % count) + count) % count);
    if (middle !== index) scroller.current?.scrollTo({ y: middle * ROW, animated: false });
  };
  const goTo = useCallback((index: number) => scroller.current?.scrollTo({ y: index * ROW, animated: true }), [scroller]);

  const step = (by: number): void => {
    const next = values[(at + by + count) % count];
    if (next === undefined) return;
    said.current = next;
    onChange(next);
    scroller.current?.scrollTo({ y: (first + values.indexOf(next)) * ROW, animated: true });
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: format(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event: AccessibilityActionEvent) => step(event.nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={[styles.wheel, { width }]}
    >
      <Animated.ScrollView
        ref={scroller}
        onScroll={onScroll}
        scrollEventThrottle={16}
        snapToInterval={ROW}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        nestedScrollEnabled
        contentOffset={start}
        contentContainerStyle={styles.wheelContent}
        onMomentumScrollEnd={event => recentre(event.nativeEvent.contentOffset.y)}
        // TalkBack meets the wheel as one adjustable control, never its hundred rows (most of them off screen).
        importantForAccessibility="no-hide-descendants"
      >
        {rows.map((row, index) => (
          <WheelRow key={index} index={index} offset={offset} text={format(row)} onPress={goTo} />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

/**
 * AM above PM, the one chosen on the wheels' sheet: a tap on the other slides it there. Two rows are
 * no wheel to turn, and a scroller this short would hand nearly all of a drag to the page.
 */
function HalfColumn({ pm, width, onChange }: { pm: boolean; width: number; onChange: (half: number) => void }) {
  const styles = useThemedStyles(makeStyles);
  const reduced = useReducedMotion();
  const at = pm ? 1 : 0;
  const offset = useSharedValue(at * ROW);
  useEffect(() => {
    offset.value = withTiming(at * ROW, { duration: reduced ? 0 : duration.short, easing: standard });
  }, [at, offset, reduced]);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: ROW - offset.value }] }));
  const choose = useCallback(
    (half: number) => {
      if (half === at) return;
      haptic('tick');
      onChange(half);
    },
    [at, onChange],
  );
  const name = (half: number): string => (half === 1 ? 'PM' : 'AM');
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t('Morning or afternoon')}
      accessibilityValue={{ text: name(at) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={() => onChange(1 - at)}
      style={[styles.wheel, styles.half, { width }]}
    >
      <Animated.View style={slide} importantForAccessibility="no-hide-descendants">
        {HALVES.map(half => (
          <WheelRow key={half} index={half} offset={offset} text={name(half)} onPress={choose} />
        ))}
      </Animated.View>
    </View>
  );
}

export interface TimeWheelsProps {
  /** `07:30`. */
  readonly time: string;
  readonly twelveHours: boolean;
  readonly onTime: (time: string) => void;
}

function TimeWheelsComponent({ time, twelveHours, onTime }: TimeWheelsProps) {
  const styles = useThemedStyles(makeStyles);
  const parts = clockParts(time, twelveHours);
  // The latest time, so a wheel's change keeps what the other one holds.
  const latest = useRef(parts);
  latest.current = parts;
  const set = useCallback((patch: Partial<typeof parts>) => onTime(clockOf({ ...latest.current, ...patch }, twelveHours)), [onTime, twelveHours]);
  const onHour = useCallback((hour: number) => set({ hour }), [set]);
  const onMinute = useCallback((minute: number) => set({ minute }), [set]);
  const onHalf = useCallback((half: number) => set({ pm: half === 1 }), [set]);
  return (
    <View style={styles.wheels} accessibilityLabel={t('Time')}>
      {/* The chosen row's sheet, across every wheel. */}
      <Organic style={styles.chosen} pointerEvents="none" />
      <Wheel key={twelveHours ? '12' : '24'} values={twelveHours ? HOURS_12 : HOURS_24} value={parts.hour} format={twelveHours ? String : two} label={t('Hours')} width={104} onChange={onHour} />
      <AppText variant="display" style={[styles.figures, styles.colon]} importantForAccessibility="no">
        :
      </AppText>
      <Wheel values={MINUTES} value={parts.minute} format={two} label={t('Minutes')} width={104} onChange={onMinute} />
      {twelveHours ? <HalfColumn pm={parts.pm} width={84} onChange={onHalf} /> : null}
    </View>
  );
}

export const TimeWheels = memo(TimeWheelsComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wheels: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', paddingHorizontal: 12, height: ROW * SHOWN },
    // A sheet of the primary's wash at the row's corner, 12 past the wheels on either side.
    chosen: { position: 'absolute', left: 0, right: 0, top: ROW, height: ROW, backgroundColor: theme.color.actionContainer, ...corners(SHAPES.tab) },
    wheel: { height: ROW * SHOWN },
    half: { overflow: 'hidden' },
    wheelContent: { paddingVertical: ROW },
    row: { height: ROW, alignItems: 'center', justifyContent: 'center' },
    // The screen's largest words: the time is what the alarm is.
    figures: { fontSize: 52, lineHeight: 60, letterSpacing: -1, fontVariant: ['tabular-nums'], color: theme.color.ink },
    colon: { marginHorizontal: 2, marginTop: -6 },
  });
