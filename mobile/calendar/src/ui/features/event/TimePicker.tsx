/**
 * A time of day as Google picks it on Android: Material's time picker. « Sélectionner l'heure »: the
 * hours and the minutes in two boxes, the one being set on the primary's wash; under them the dial,
 * its hand following the finger. An hour taken (the 24 hours on two rings, 00 to 11 outside, 12 to
 * 23 inside, as Material's research settled them) turns the dial to the minutes; a minute dragged
 * goes one by one, a tap takes the nearest five. The keyboard's button at the foot types the two
 * numbers instead (« Saisir l'heure »). « OK » keeps the time; « Annuler », Back or the scrim leave it.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { clockWords } from '@unlease/calendar/services/eventText';
import { haptic } from '@shared/platform/haptics';

import { AppText, Dialog, IconButton, Tappable } from '@shared/ui/components';
import { duration, standard } from '@shared/ui/theme/motion';
import { fontFamily } from '@shared/ui/theme/typography';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

/** Material's dial: 256 across, a 48 handle; the outer numbers' centres 4 inside the handle's reach, the inner ring 36 in. */
const DIAL = 256;
const CENTER = DIAL / 2;
const HANDLE = 48;
const INNER_HANDLE = 40;
const OUTER = CENTER - HANDLE / 2 - 4;
const INNER = OUTER - 36;

const pad = (value: number): string => String(value).padStart(2, '0');
const clockOf = (hour: number, minute: number): string => `${pad(hour)}:${pad(minute)}`;

type Part = 'hour' | 'minute';

/** Where a number stands on the dial: its angle from the top, clockwise, at its ring's radius. */
const placeOf = (index: number, radius: number): { left: number; top: number } => {
  const angle = (index / 12) * 2 * Math.PI;
  return { left: CENTER + radius * Math.sin(angle), top: CENTER - radius * Math.cos(angle) };
};

export interface TimePickerProps {
  readonly visible: boolean;
  /** `HH:MM`. */
  readonly value: string;
  readonly twelveHours: boolean;
  readonly onDismiss: () => void;
  readonly onTime: (clock: string) => void;
}

export function TimePicker({ visible, value, twelveHours, onDismiss, onTime }: TimePickerProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [hour, setHour] = useState(0);
  const [minute, setMinute] = useState(0);
  const [part, setPart] = useState<Part>('hour');
  const [typing, setTyping] = useState(false);
  const [typedHour, setTypedHour] = useState('');
  const [typedMinute, setTypedMinute] = useState('');
  const [wrong, setWrong] = useState(false);
  const minuteField = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (!visible) return;
    const h = Number(value.slice(0, 2)) || 0;
    const m = Number(value.slice(3, 5)) || 0;
    setHour(h);
    setMinute(m);
    setPart('hour');
    setTyping(false);
    setWrong(false);
  }, [visible, value]);

  const afternoon = hour >= 12;
  const shownHour = (h: number): string => (twelveHours ? String(h % 12 === 0 ? 12 : h % 12) : pad(h));

  // The hand: its angle and its reach, gliding between values, held to the finger while it drags.
  const inner = !twelveHours && part === 'hour' && hour >= 12;
  const target = part === 'hour' ? (hour % 12) * 30 : minute * 6;
  const angle = useSharedValue(target);
  const reach = useSharedValue(inner ? INNER : OUTER);
  const dragging = useRef(false);
  useEffect(() => {
    // The shortest way round: from 330 to 0 goes on to 360, never back the long way.
    const from = angle.value;
    const to = from + ((((target - from) % 360) + 540) % 360) - 180;
    angle.value = dragging.current ? to : withTiming(to, { duration: duration.medium, easing: standard });
    reach.value = withTiming(inner ? INNER : OUTER, { duration: duration.short, easing: standard });
  }, [target, inner, angle, reach]);
  const handStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));
  const lineStyle = useAnimatedStyle(() => ({ top: CENTER - reach.value, height: reach.value }));
  const knobStyle = useAnimatedStyle(() => {
    const size = reach.value < (INNER + OUTER) / 2 ? INNER_HANDLE : HANDLE;
    return { top: CENTER - reach.value - size / 2, left: CENTER - size / 2, width: size, height: size, borderRadius: size / 2 };
  });

  /** A point touched on the dial, read as the part being set. */
  const touch = (x: number, y: number, phase: 'move' | 'tap' | 'end'): void => {
    const dx = x - CENTER;
    const dy = y - CENTER;
    const turn = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const degrees = (turn + 360) % 360;
    if (part === 'hour') {
      const index = Math.round(degrees / 30) % 12;
      const innerRing = !twelveHours && Math.hypot(dx, dy) < (INNER + OUTER) / 2;
      const next = twelveHours ? index + (afternoon ? 12 : 0) : index + (innerRing ? 12 : 0);
      if (next !== hour) {
        haptic('tick');
        setHour(next);
      }
      // Let go, the dial turns to the minutes, as Material's does.
      if (phase !== 'move') setPart('minute');
    } else {
      const exact = Math.round(degrees / 6) % 60;
      const next = phase === 'tap' ? (Math.round(degrees / 30) % 12) * 5 : exact;
      if (next !== minute) {
        if (phase === 'move' || next % 5 === 0) haptic('tick');
        setMinute(next);
      }
    }
  };
  const begin = (): void => {
    dragging.current = true;
  };
  const release = (): void => {
    dragging.current = false;
  };
  const finish = (x: number, y: number, moved: boolean): void => {
    dragging.current = false;
    touch(x, y, moved ? 'end' : 'tap');
  };

  const moved = useSharedValue(false);
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin(() => {
      moved.value = false;
      runOnJS(begin)();
    })
    .onUpdate(event => {
      if (Math.abs(event.translationX) + Math.abs(event.translationY) > 4) moved.value = true;
      if (moved.value) runOnJS(touch)(event.x, event.y, 'move');
    })
    .onEnd(event => {
      runOnJS(finish)(event.x, event.y, moved.value);
    })
    // A finger taken by something else leaves nothing held.
    .onFinalize(() => {
      runOnJS(release)();
    });

  const openTyping = (): void => {
    setTypedHour(shownHour(hour));
    setTypedMinute(pad(minute));
    setWrong(false);
    setTyping(true);
  };
  /** The typed numbers, read as a time, or null when they are not one. */
  const typedTime = (): { hour: number; minute: number } | null => {
    if (!/^\d{1,2}$/.test(typedHour.trim()) || !/^\d{1,2}$/.test(typedMinute.trim())) return null;
    const h = Number(typedHour);
    const m = Number(typedMinute);
    if (m > 59) return null;
    if (twelveHours) return h >= 1 && h <= 12 ? { hour: (h % 12) + (afternoon ? 12 : 0), minute: m } : null;
    return h <= 23 ? { hour: h, minute: m } : null;
  };
  const confirm = (): void => {
    let kept = { hour, minute };
    if (typing) {
      const read = typedTime();
      if (!read) {
        setWrong(true);
        return;
      }
      kept = read;
    }
    const clock = clockOf(kept.hour, kept.minute);
    if (clock !== value) onTime(clock);
    onDismiss();
  };
  const setHalf = (pm: boolean): void => {
    if (pm !== afternoon) setHour((hour % 12) + (pm ? 12 : 0));
  };

  const box = (which: Part, words: string) => {
    const on = part === which;
    return (
      <Tappable
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={which === 'hour' ? t('Hour') : t('Minute')}
        accessibilityValue={{ text: words }}
        onPress={() => setPart(which)}
        style={[styles.box, on ? styles.boxOn : null]}
      >
        <AppText style={styles.boxWords} color={on ? theme.color.onActionContainer : theme.color.ink}>
          {words}
        </AppText>
      </Tappable>
    );
  };

  const field = (which: Part) => {
    const words = which === 'hour' ? typedHour : typedMinute;
    return (
      <View style={styles.inputColumn}>
        <TextInput
          ref={which === 'minute' ? minuteField : undefined}
          value={words}
          onChangeText={text => {
            const digits = text.replace(/\D/g, '').slice(0, 2);
            setWrong(false);
            if (which === 'hour') {
              setTypedHour(digits);
              // Two figures typed, the minutes come next.
              if (digits.length === 2) minuteField.current?.focus();
            } else setTypedMinute(digits);
          }}
          keyboardType="number-pad"
          maxLength={2}
          selectTextOnFocus
          autoFocus={which === 'hour'}
          returnKeyType={which === 'hour' ? 'next' : 'done'}
          onSubmitEditing={() => (which === 'hour' ? minuteField.current?.focus() : confirm())}
          accessibilityLabel={which === 'hour' ? t('Hour') : t('Minute')}
          style={[styles.box, styles.input, wrong ? styles.inputWrong : null]}
          selectionColor={theme.color.focus}
        />
        <AppText variant="meta" color={wrong ? theme.color.danger : theme.color.inkMuted}>
          {which === 'hour' ? t('Hour') : t('Minute')}
        </AppText>
      </View>
    );
  };

  const half = twelveHours ? (
    <View style={styles.half} accessibilityRole="radiogroup">
      {[false, true].map(pm => {
        const on = pm === afternoon;
        return (
          <Tappable key={String(pm)} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setHalf(pm)} style={[styles.halfPart, pm ? styles.halfSecond : null, on ? styles.halfOn : null]}>
            <AppText variant="labelStrong" color={on ? theme.color.onActionContainer : theme.color.inkMuted}>
              {pm ? 'PM' : 'AM'}
            </AppText>
          </Tappable>
        );
      })}
    </View>
  ) : null;

  const numbers = part === 'hour'
    ? [
        ...Array.from({ length: 12 }, (_, index) => {
          const real = twelveHours ? index + (afternoon ? 12 : 0) : index;
          return { key: `o${index}`, index, real, words: twelveHours ? String(index === 0 ? 12 : index) : pad(index), radius: OUTER, small: false };
        }),
        ...(twelveHours ? [] : Array.from({ length: 12 }, (_, index) => ({ key: `i${index}`, index, real: index + 12, words: String(index + 12), radius: INNER, small: true }))),
      ]
    : Array.from({ length: 12 }, (_, index) => ({ key: `m${index}`, index, real: index * 5, words: pad(index * 5), radius: OUTER, small: false }));
  const chosen = part === 'hour' ? hour : minute;

  return (
    <Dialog
      visible={visible}
      title={typing ? t('Enter time') : t('Select time')}
      confirmLabel={t('OK')}
      onConfirm={confirm}
      onCancel={onDismiss}
      lead={<IconButton icon={typing ? 'clock' : 'keyboard'} label={typing ? t('Switch to the dial') : t('Switch to typing')} onPress={() => (typing ? setTyping(false) : openTyping())} />}
    >
      {typing ? (
        <View>
          <View style={styles.selector}>
            {field('hour')}
            <AppText style={[styles.boxWords, styles.colon]}>:</AppText>
            {field('minute')}
            {half}
          </View>
          {wrong ? (
            <AppText variant="meta" color={theme.color.danger} accessibilityLiveRegion="polite" style={styles.problem}>
              {twelveHours ? t('Type an hour from 1 to 12 and minutes from 00 to 59.') : t('Type an hour from 0 to 23 and minutes from 00 to 59.')}
            </AppText>
          ) : null}
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.selector}>
            {box('hour', shownHour(hour))}
            <AppText style={[styles.boxWords, styles.colon]}>:</AppText>
            {box('minute', pad(minute))}
            {half}
          </View>
          <GestureDetector gesture={pan}>
            <View
              style={styles.dial}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={part === 'hour' ? t('Hour') : t('Minute')}
              accessibilityValue={{ text: part === 'hour' ? clockWords(clockOf(hour, 0), twelveHours) : plural(minute, 'minute') }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={event => {
                const step = event.nativeEvent.actionName === 'increment' ? 1 : -1;
                if (part === 'hour') setHour((hour + step + 24) % 24);
                else setMinute((minute + step * 5 + 60) % 60);
              }}
            >
              {/* The hand under the numbers: its handle on the primary's wash, the number it holds in that wash's ink. */}
              <Animated.View pointerEvents="none" style={[styles.hand, handStyle]}>
                <Animated.View style={[styles.line, lineStyle]} />
                <Animated.View style={[styles.knob, knobStyle]}>{part === 'minute' && minute % 5 !== 0 ? <View style={styles.knobDot} /> : null}</Animated.View>
              </Animated.View>
              <View pointerEvents="none" style={styles.centerDot} />
              {numbers.map(number => {
                const at = placeOf(number.index, number.radius);
                const on = number.real === chosen;
                return (
                  <View key={number.key} pointerEvents="none" style={[styles.number, { left: at.left - 20, top: at.top - 12 }]}>
                    <AppText variant={number.small ? 'label' : 'body'} color={on ? theme.color.onActionContainer : number.small ? theme.color.inkMuted : theme.color.ink} style={on ? styles.numberOn : null}>
                      {number.words}
                    </AppText>
                  </View>
                );
              })}
            </View>
          </GestureDetector>
        </View>
      )}
    </Dialog>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { alignItems: 'center', gap: 24 },
    selector: { flexDirection: 'row', alignItems: 'flex-start', alignSelf: 'stretch', justifyContent: 'center' },
    // Material's 96 by 80 at the field's corners; narrower dialogs share the width.
    box: { flex: 1, maxWidth: 96, height: 80, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.paperHigh, borderWidth: 2, borderColor: 'transparent' },
    boxOn: { backgroundColor: theme.color.actionContainer, borderColor: theme.color.focus },
    // Its ink comes from `color` (the wash's when chosen): never set here, where it would win.
    boxWords: { fontFamily: fontFamily(theme, 'Regular'), fontSize: 50, lineHeight: 60 },
    colon: { width: 24, height: 80, textAlign: 'center', textAlignVertical: 'center', lineHeight: 76 },
    inputColumn: { flex: 1, maxWidth: 96, gap: 6 },
    input: { flex: 0, maxWidth: undefined, textAlign: 'center', padding: 0, fontFamily: fontFamily(theme, 'Regular'), fontSize: 46, color: theme.color.ink },
    inputWrong: { borderColor: theme.color.danger },
    problem: { marginTop: 8 },
    half: { width: 52, height: 80, marginLeft: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.color.outline, overflow: 'hidden' },
    halfPart: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    halfSecond: { borderTopWidth: 1, borderTopColor: theme.color.outline },
    halfOn: { backgroundColor: theme.color.actionContainer },
    dial: { width: DIAL, height: DIAL, borderRadius: CENTER, backgroundColor: theme.color.paperHigh },
    hand: { ...StyleSheet.absoluteFill },
    line: { position: 'absolute', left: CENTER - 1, width: 2, backgroundColor: theme.color.focus },
    knob: { position: 'absolute', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.actionContainer, borderWidth: 2, borderColor: theme.color.focus },
    knobDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.color.focus },
    centerDot: { position: 'absolute', left: CENTER - 4, top: CENTER - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: theme.color.focus },
    number: { position: 'absolute', width: 40, height: 24, alignItems: 'center', justifyContent: 'center' },
    numberOn: { fontFamily: fontFamily(theme, 'SemiBold') },
  });
