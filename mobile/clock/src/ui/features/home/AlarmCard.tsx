/**
 * An alarm in the home's list: one paper card, its time at 34 in Signika (the second ink while it is
 * off), its name over its days, a skipped morning in Safran, its switch at the end. A press opens its
 * editor; the switch turns it on or off (a one-time alarm switched on takes its next day).
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { weekdayDay } from '@unlease/calendar/services/eventText';
import type { Alarm } from '@unlease/clock/models/alarm';
import { isOn, skippedDay } from '@unlease/clock/services/schedule';
import { alarmClock, daysWords } from '@unlease/clock/services/words';
import { AppText, Organic, Switch, Tappable } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { fontFamily } from '@shared/ui/theme/typography';
import { switchAlarm } from '@app/store/actions';

interface Props {
  /** As it rings (`useRingingAlarms`). */
  readonly alarm: Alarm;
  readonly now: number;
  readonly twelveHours: boolean;
  readonly weekStart: number;
  readonly onOpen: (id: string) => void;
}

function AlarmCardComponent({ alarm, now, twelveHours, weekStart, onOpen }: Props) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const id = alarm.id;
  if (alarm.deletedAt !== null) return null;
  const on = isOn(alarm, now);
  const time = alarmClock(alarm.time, twelveHours);
  const days = daysWords(alarm, now, weekStart);
  const skipped = skippedDay(alarm, now);
  const name = alarm.label.trim();
  return (
    <Organic outline="card" style={styles.card}>
      <Tappable outline="card" onPress={() => onOpen(id)} accessibilityRole="button" accessibilityHint={t('Opens the alarm')} accessibilityLabel={[time, name, days, on ? '' : t('Off')].filter(Boolean).join(', ')} style={styles.row}>
        <AppText style={[styles.time, !on && styles.off]}>{time}</AppText>
        <View style={styles.words}>
          {name ? (
            <AppText variant="bodyStrong" color={on ? theme.color.ink : theme.color.inkMuted} numberOfLines={1}>
              {name}
            </AppText>
          ) : null}
          <AppText variant="meta" numberOfLines={1}>
            {days}
          </AppText>
          {skipped ? (
            <AppText variant="meta" color={theme.color.waiting} numberOfLines={1}>
              {t('Skipped {day}', { day: weekdayDay(skipped) })}
            </AppText>
          ) : null}
        </View>
        <Switch value={on} onValueChange={value => switchAlarm(id, value)} accessibilityLabel={t('Alarm at {time}', { time })} />
      </Tappable>
    </Organic>
  );
}

export const AlarmCard = memo(AlarmCardComponent);

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    card: { backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline, boxShadow: theme.lift.card },
    row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingLeft: 20, paddingRight: 14, paddingVertical: 12, minHeight: 76 },
    time: { fontFamily: fontFamily(theme, 'SemiBold'), fontSize: 34, lineHeight: 40, letterSpacing: -0.5, color: theme.color.ink, fontVariant: ['tabular-nums'], minWidth: 92 },
    off: { color: theme.color.inkMuted },
    words: { flex: 1, gap: 1 },
  });
}
