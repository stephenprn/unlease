/**
 * The world clocks' comparison: a ruler of the hours here, a day either way, slid under a fixed
 * needle. The hour under the needle is « now » at rest; slid, every city below shows its time at that
 * moment (« À 18:00 ici »), in quarter hours, each hour passing a click under the finger, so « when is
 * it a good time to call Tokyo? » is one gesture. Let go, it settles on the nearest quarter (150
 * decelerate); « Maintenant » brings it back. TalkBack: an adjustable control, a quarter hour a step.
 */
import React, { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { t } from '@unlease/core/i18n';
import { hourLabel } from '@unlease/calendar/services/eventText';
import { instantToWall } from '@unlease/calendar/services/time';
import { offsetWords, snapShift } from '@unlease/clock/services/worldClocks';
import { haptic } from '@shared/platform/haptics';
import { AppText } from '@shared/ui/components';
import { decelerate, duration } from '@shared/ui/theme/motion';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

/** An hour's width on the ruler. */
const HOUR = 64;
const PER_MINUTE = HOUR / 60;
const SPAN_HOURS = 24;
const HEIGHT = 52;

interface Props {
  /** The time now (to the minute). */
  readonly now: number;
  /** Minutes from now the needle points at (quarter hours). */
  readonly shift: number;
  readonly onShift: (minutes: number) => void;
  readonly twelveHours: boolean;
  readonly width: number;
}

function TimeRulerComponent({ now, shift, onShift, twelveHours, width }: Props) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const still = useReducedMotion();
  // The ruler's hours are this hour and a day either way; the needle's place is minutes from this hour's start.
  const wall = instantToWall(now, '');
  const hour = Number(wall.slice(11, 13));
  const minute = Number(wall.slice(14, 16));
  const pointer = useSharedValue(minute + shift);
  const start = useSharedValue(0);
  const last = useSharedValue(shift);

  // Moved from outside (« Maintenant », the minute turning): the needle follows.
  useEffect(() => {
    pointer.value = withTiming(minute + shift, { duration: still ? 0 : duration.short, easing: decelerate });
    last.value = shift;
  }, [minute, shift, still, pointer, last]);

  const clicked = (): void => haptic('tick');
  useAnimatedReaction(
    () => Math.floor(pointer.value / 60),
    (next, previous) => {
      if (previous !== null && next !== previous) runOnJS(clicked)();
    },
  );

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-14, 14])
    .onStart(() => {
      start.value = pointer.value;
    })
    .onUpdate(event => {
      const most = SPAN_HOURS * 60;
      pointer.value = Math.max(minute - most, Math.min(minute + most, start.value - event.translationX / PER_MINUTE));
      const snapped = Math.max(-most, Math.min(most, Math.round((pointer.value - minute) / 15) * 15));
      if (snapped !== last.value) {
        last.value = snapped;
        runOnJS(onShift)(snapped);
      }
    })
    .onEnd(() => {
      pointer.value = withTiming(minute + last.value, { duration: duration.short, easing: decelerate });
    });

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: width / 2 - (pointer.value + SPAN_HOURS * 60) * PER_MINUTE }] }));

  const hours = Array.from({ length: SPAN_HOURS * 2 + 1 }, (_, index) => index - SPAN_HOURS);
  const label = shift === 0 ? t('Now') : t('{gap} from now', { gap: offsetWords(shift) });

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[styles.ruler, { width }]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('Compare the time')}
        accessibilityValue={{ text: label }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={event => onShift(snapShift(shift + (event.nativeEvent.actionName === 'increment' ? 15 : -15)))}
      >
        <Animated.View style={[styles.track, { width: (SPAN_HOURS * 2 + 1) * HOUR }, slide]}>
          {hours.map(offset => {
            const at = (hour + offset + 48) % 24;
            const major = at % 3 === 0;
            return (
              <View key={offset} style={styles.hour}>
                <View style={[styles.tick, major && styles.major, at === 0 && styles.midnight]} />
                <View style={[styles.minor, { left: HOUR / 4 }]} />
                <View style={[styles.minor, styles.half, { left: HOUR / 2 }]} />
                <View style={[styles.minor, { left: (HOUR * 3) / 4 }]} />
                {major ? (
                  <AppText variant="labelSmall" color={at === 0 ? theme.color.ink : theme.color.inkMuted} style={styles.hourLabel} numberOfLines={1}>
                    {hourLabel(at, twelveHours)}
                  </AppText>
                ) : null}
              </View>
            );
          })}
        </Animated.View>
        <View pointerEvents="none" style={[styles.needle, { left: width / 2 - 1 }]} />
        <View pointerEvents="none" style={[styles.knob, { left: width / 2 - 5 }]} />
      </View>
    </GestureDetector>
  );
}

export const TimeRuler = memo(TimeRulerComponent);

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    ruler: { height: HEIGHT, overflow: 'hidden' },
    track: { flexDirection: 'row', height: HEIGHT },
    hour: { width: HOUR, height: HEIGHT },
    tick: { position: 'absolute', left: 0, top: 0, width: 1.5, height: 14, backgroundColor: theme.color.edge },
    major: { height: 20, backgroundColor: theme.color.inkMuted },
    midnight: { height: 24, width: 2, backgroundColor: theme.color.ink },
    minor: { position: 'absolute', top: 0, width: 1, height: 7, backgroundColor: theme.color.edge, opacity: 0.6 },
    half: { height: 10 },
    hourLabel: { position: 'absolute', top: 32, left: -24, width: 48, textAlign: 'center', fontVariant: ['tabular-nums'] },
    // The needle: the primary's deep ink, a pebble's dot at its foot.
    // Over the ticks only, the hours' labels left clear under it.
    needle: { position: 'absolute', top: 0, width: 2, height: 22, backgroundColor: theme.color.focus },
    knob: { position: 'absolute', top: 18, width: 10, height: 10, borderRadius: 5, backgroundColor: theme.color.focus },
  });
}
