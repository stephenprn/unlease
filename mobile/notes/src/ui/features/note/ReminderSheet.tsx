/** Reminder: three quick choices, else a day (next two weeks) and a quarter-hour time. */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import { getLocale, t } from '@unlease/core/i18n';
import { formatDay, formatReminder, weekdayNames } from '@unlease/core/services/format';

import { AppText, Button, ListRow, Sheet, SheetScroll, Tappable } from '../../components';
import { corners } from '../../theme/shape';
import { useTheme } from '../../theme/ThemeProvider';

/** habits-garden's chips: neighbouring days, hours and minutes never share a shape. */
const CUTS = [corners(SHAPES.chip)];
/** A day holds two lines: a calm sheet, not a pebble. */
const DAY_CUTS = [corners(SHAPES.field)];

/** A weekday cut short: "lun.", "Mon". */
function shortDay(day: number): string {
  const name = weekdayNames()[day] ?? '';
  return getLocale() === 'en' ? name.slice(0, 3) : `${name.slice(0, 3)}.`;
}

function at(day: Date, hour: number, minute = 0): number {
  const date = new Date(day);
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
}

export function quickReminders(now: number): { label: string; time: number }[] {
  const today = new Date(now);
  const hour = today.getHours();
  const tomorrow = new Date(now);
  tomorrow.setDate(today.getDate() + 1);
  const monday = new Date(now);
  monday.setDate(today.getDate() + (((8 - today.getDay()) % 7) || 7));
  const options = [];
  if (hour < 17) options.push({ label: t('Plus tard aujourd’hui'), time: at(today, 18) });
  else if (hour < 20) options.push({ label: t('Ce soir'), time: at(today, 21) });
  options.push({ label: t('Demain matin'), time: at(tomorrow, 8) });
  options.push({ label: t('Lundi prochain'), time: at(monday, 8) });
  return options;
}

export interface ReminderSheetProps {
  readonly visible: boolean;
  readonly current: number | null;
  readonly onDismiss: () => void;
  readonly onSet: (time: number | null) => void;
}

export function ReminderSheet({ visible, current, onDismiss, onSet }: ReminderSheetProps) {
  const theme = useTheme();
  const now = useMemo(() => Date.now(), [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const [custom, setCustom] = useState(false);
  const [day, setDay] = useState(0);
  const [time, setTime] = useState<[number, number]>([9, 0]);

  useEffect(() => {
    if (!visible) return;
    setCustom(false);
    const base = current ? new Date(current) : new Date(now + 3600_000);
    setDay(Math.max(0, Math.round((new Date(base).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000)));
    // To the nearest quarter, the hour carried: 18:53 opens on 19:00, never 18:00.
    const quarter = Math.round((base.getHours() * 60 + base.getMinutes()) / 15) * 15;
    setTime([Math.floor(quarter / 60) % 24, quarter % 60]);
  }, [visible, current, now]);

  // Two weeks to pick from, and as far as the reminder already set, so saving never moves it to today.
  const days = Array.from({ length: Math.max(14, day + 1) }, (_, i) => {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    return date;
  });
  const chosenDay = days[day] ?? days[0]!;
  const chosen = at(chosenDay, time[0], time[1]);
  const hours = Array.from({ length: 17 }, (_, i) => i + 6);

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Rappel')} tall={custom}>
      {!custom ? (
        <View>
          {quickReminders(now).map(option => (
            <ListRow
              key={option.label}
              icon="clock"
              title={option.label}
              supporting={formatReminder(option.time, now)}
              onPress={() => {
                onSet(option.time);
                onDismiss();
              }}
            />
          ))}
          <ListRow icon="calendar" title={t('Choisir la date et l’heure')} onPress={() => setCustom(true)} />
          {current !== null ? (
            <ListRow
              icon="bellOff"
              title={t('Supprimer le rappel')}
              supporting={formatReminder(current, now)}
              danger
              onPress={() => {
                onSet(null);
                onDismiss();
              }}
            />
          ) : null}
        </View>
      ) : (
        <SheetScroll contentContainerStyle={styles.custom}>
          <AppText variant="metaStrong">{t('Jour')}</AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
            {days.map((date, index) => {
              const selected = index === day;
              return (
                <Tappable
                  key={index}
                  onPress={() => setDay(index)}
                  accessibilityState={{ selected }}
                  accessibilityLabel={formatDay(date.getTime(), now)}
                  style={[styles.day, DAY_CUTS[index % DAY_CUTS.length], { borderColor: selected ? theme.color.focus : theme.color.hairline, backgroundColor: selected ? theme.color.actionContainer : theme.color.paper }]}
                >
                  <AppText variant="meta" color={selected ? theme.color.onActionContainer : undefined}>
                    {index === 0 ? t('auj.') : index === 1 ? t('dem.') : shortDay(date.getDay())}
                  </AppText>
                  <AppText variant="bodyStrong" color={selected ? theme.color.onActionContainer : undefined}>
                    {date.getDate()}
                  </AppText>
                </Tappable>
              );
            })}
          </ScrollView>
          <AppText variant="metaStrong">{t('Heure')}</AppText>
          <View style={styles.grid}>
            {hours.map(hour => {
              const selected = hour === time[0];
              return (
                <Tappable
                  key={hour}
                  onPress={() => setTime([hour, time[1]])}
                  accessibilityState={{ selected }}
                  style={[styles.cell, CUTS[hour % CUTS.length], { borderColor: selected ? theme.color.focus : theme.color.hairline, backgroundColor: selected ? theme.color.actionContainer : theme.color.paper }]}
                >
                  <AppText variant="label" color={selected ? theme.color.onActionContainer : undefined}>{t('{hour} h', { hour })}</AppText>
                </Tappable>
              );
            })}
          </View>
          <View style={styles.minutes}>
            {[0, 15, 30, 45].map(minute => {
              const selected = minute === time[1];
              return (
                <Tappable
                  key={minute}
                  onPress={() => setTime([time[0], minute])}
                  accessibilityState={{ selected }}
                  style={[styles.minute, CUTS[(minute / 15 + 1) % CUTS.length], { borderColor: selected ? theme.color.focus : theme.color.hairline, backgroundColor: selected ? theme.color.actionContainer : theme.color.paper }]}
                >
                  <AppText variant="label" color={selected ? theme.color.onActionContainer : undefined}>{`:${String(minute).padStart(2, '0')}`}</AppText>
                </Tappable>
              );
            })}
          </View>
          <View style={styles.footer}>
            <AppText variant="bodyStrong">{formatReminder(chosen, now)}</AppText>
            <Button
              label={t('Enregistrer')}
              disabled={chosen <= now}
              onPress={() => {
                onSet(chosen);
                onDismiss();
              }}
            />
          </View>
        </SheetScroll>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  custom: { gap: 12, paddingHorizontal: 8, paddingBottom: 8 },
  days: { gap: 8 },
  day: { width: 56, height: 64, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: 64, height: 48, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  minutes: { flexDirection: 'row', gap: 8 },
  minute: { flex: 1, height: 48, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
});
