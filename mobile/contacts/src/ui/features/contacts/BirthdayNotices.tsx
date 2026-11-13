/**
 * « Notifications d’anniversaire »: on or off (turning them on asks Android first), the day itself or
 * the day before too, and the hour they come at: a sunken track like the choice above it, an hour
 * earlier at one end, later at the other, the hour between them (the new one slides in from the
 * side it came from). In Réglages, and at the head of the birthdays.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Keyframe } from 'react-native-reanimated';

import { SHAPES } from '@unlease/design/shapes';
import { t, tc } from '@unlease/core/i18n';
import { formatClock } from '@unlease/core/services/format';
import { turnBirthdaysOn } from '@app/birthdayAlerts';
import { later } from '@app/later';
import { selectBirthdays, setBirthdaySettings, useContactsUiStore } from '@app/store/contactsUi';

import { AppText, Icon, Organic, Segmented, Tappable } from '@shared/ui/components';
import { SwitchRow } from '@shared/ui/features/appearance/SwitchRow';
import { decelerate, duration } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

/** The hour as the language writes it (« 9:00 », « 9:00 AM »). */
const hourWords = (hour: number): string => formatClock(new Date(2000, 0, 1, hour, 0, 0, 0).getTime());

/** As the segmented choice: 44 high ends in a track padded by 4. */
const INSET = 4;
const END = 44;

/** A later hour comes up from below, an earlier one down from above. */
const LATER_IN = new Keyframe({ 0: { opacity: 0, transform: [{ translateY: 8 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }], easing: decelerate } }).duration(duration.short);
const EARLIER_IN = new Keyframe({ 0: { opacity: 0, transform: [{ translateY: -8 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }], easing: decelerate } }).duration(duration.short);

function HourStepper({ hour, onChange }: { hour: number; onChange: (hour: number) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  // Which way the hour last went, so the new one comes from that side.
  const [last, setLast] = useState({ hour, rising: true });
  if (last.hour !== hour) setLast({ hour, rising: hour > last.hour });
  const end = (glyph: 'minus' | 'plus', label: string, next: number, turn: number) => {
    const off = next < 0 || next > 23;
    return (
      <Tappable accessibilityLabel={label} accessibilityState={{ disabled: off }} disabled={off} ownDisabled onPress={() => onChange(next)} pebble={turn} style={styles.end}>
        <Icon name={glyph} size={20} color={off ? theme.color.inkMuted : theme.color.ink} />
      </Tappable>
    );
  };
  return (
    <Organic role="group" accessibilityLabel={t('Notification time')} style={styles.track}>
      {end('minus', t('An hour earlier'), hour - 1, 0)}
      <View style={styles.value}>
        <Icon name="bell" size={18} color={theme.color.inkMuted} />
        <Animated.View key={hour} entering={last.rising ? LATER_IN : EARLIER_IN}>
          <AppText variant="bodyStrong" style={styles.hour} accessibilityLiveRegion="polite">
            {t('At {hour}', { hour: hourWords(hour) })}
          </AppText>
        </Animated.View>
      </View>
      {end('plus', t('An hour later'), hour + 1, 2)}
    </Organic>
  );
}

export function BirthdayNotices() {
  const settings = useContactsUiStore(selectBirthdays);
  return (
    <>
      <SwitchRow title={tc('contact', 'Birthday notifications')} supporting={t('A notification on the day, on this phone.')} value={settings.enabled} onChange={on => later(turnBirthdaysOn(on))} />
      {settings.enabled ? (
        <View style={staticStyles.fields}>
          <Segmented
            value={settings.dayBefore ? 'before' : 'day'}
            onChange={value => setBirthdaySettings({ dayBefore: value === 'before' })}
            options={[
              { value: 'day', label: t('On the day') },
              { value: 'before', label: t('The day before too') },
            ]}
          />
          <HourStepper hour={settings.hour} onChange={hour => setBirthdaySettings({ hour })} />
        </View>
      ) : null}
    </>
  );
}

const staticStyles = StyleSheet.create({
  fields: { gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
});

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // The segmented choice's track: its colour, its corners, its inset.
    track: { flexDirection: 'row', alignItems: 'center', padding: INSET, backgroundColor: theme.color.track, ...corners(SHAPES.track) },
    end: { width: END, height: END, alignItems: 'center', justifyContent: 'center' },
    value: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden' },
    hour: { fontVariant: ['tabular-nums'] },
  });
