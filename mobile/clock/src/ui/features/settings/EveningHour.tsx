/**
 * The evening check's hour, as Contacts' birthday hour is set: a sunken track like a segmented
 * choice, an hour earlier at one end, later at the other, « Vérifier à 21:00 » between them (the new
 * hour slides in from the side it came from).
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Keyframe } from 'react-native-reanimated';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { clockWords } from '@unlease/calendar/services/eventText';

import { AppText, Icon, Organic, Tappable } from '@shared/ui/components';
import { decelerate, duration } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

/** As the segmented choice: 44 high ends in a track padded by 4. */
const INSET = 4;
const END = 44;

/** A later hour comes up from below, an earlier one down from above. */
const LATER_IN = new Keyframe({ 0: { opacity: 0, transform: [{ translateY: 8 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }], easing: decelerate } }).duration(duration.short);
const EARLIER_IN = new Keyframe({ 0: { opacity: 0, transform: [{ translateY: -8 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }], easing: decelerate } }).duration(duration.short);

const clockOfHour = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

export function EveningHour({ at, twelveHours, onChange }: { at: string; twelveHours: boolean; onChange: (at: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const hour = Number(at.slice(0, 2));
  // Which way the hour last went, so the new one comes from that side.
  const [last, setLast] = useState({ hour, rising: true });
  if (last.hour !== hour) setLast({ hour, rising: hour > last.hour });
  const end = (glyph: 'minus' | 'plus', label: string, next: number, turn: number) => {
    const off = next < 0 || next > 23;
    return (
      <Tappable accessibilityLabel={label} accessibilityState={{ disabled: off }} disabled={off} ownDisabled onPress={() => onChange(clockOfHour(next))} pebble={turn} style={styles.end}>
        <Icon name={glyph} size={20} color={off ? theme.color.inkMuted : theme.color.ink} />
      </Tappable>
    );
  };
  return (
    <Organic role="group" accessibilityLabel={t('Check at')} style={styles.track}>
      {end('minus', t('An hour earlier'), hour - 1, 0)}
      <View style={styles.value}>
        <Icon name="moon" size={18} color={theme.color.inkMuted} />
        <Animated.View key={hour} entering={last.rising ? LATER_IN : EARLIER_IN}>
          <AppText variant="bodyStrong" style={styles.hour} accessibilityLiveRegion="polite">
            {t('Check at {time}', { time: clockWords(clockOfHour(hour), twelveHours) })}
          </AppText>
        </Animated.View>
      </View>
      {end('plus', t('An hour later'), hour + 1, 2)}
    </Organic>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // The segmented choice's track: its colour, its corners, its inset.
    track: { flexDirection: 'row', alignItems: 'center', padding: INSET, backgroundColor: theme.color.track, ...corners(SHAPES.track) },
    end: { width: END, height: END, alignItems: 'center', justifyContent: 'center' },
    value: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden' },
    hour: { fontVariant: ['tabular-nums'] },
  });
