/**
 * A month to pick a day from, as a table's date cell and a date in the words both open it: the
 * month between its arrows, the weekdays Monday first, today ringed, the chosen day on matcha. It
 * shows the chosen day's month, and follows it when it changes elsewhere (a quick choice).
 */
import React, { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { dayStart, monthWeeks } from '@unlease/core/services/dates';
import { monthNames, weekdayNames } from '@unlease/core/services/format';

import { AppText, IconButton, Tappable } from '../../components';
import { corners } from '../../theme/shape';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';

/** The weekdays' initials, Monday first, as a French (and a British) calendar. */
const weekdayInitials = (): string[] => {
  const names = weekdayNames();
  return [...names.slice(1), names[0]!].map(name => name.charAt(0).toUpperCase());
};

/** A stored day's year and month (1 to 12). */
function monthOf(iso: string): { readonly year: number; readonly month: number } {
  const [year, month] = iso.split('-').map(Number) as [number, number];
  return { year, month };
}

export interface MonthCalendarProps {
  /** The day chosen, `2026-10-28`, or null. */
  readonly chosen: string | null;
  readonly today: string;
  readonly onPick: (day: string) => void;
}

function MonthCalendarComponent({ chosen, today, onPick }: MonthCalendarProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const [shown, setShown] = useState(() => monthOf(chosen ?? today));
  useEffect(() => {
    if (chosen) setShown(monthOf(chosen));
  }, [chosen]);
  const months = monthNames();
  const weekdays = weekdayNames();
  const step = (by: -1 | 1) => setShown(({ year, month }) => ({ year: month + by < 1 ? year - 1 : month + by > 12 ? year + 1 : year, month: ((month - 1 + by + 12) % 12) + 1 }));
  return (
    <View>
      <View style={styles.monthHead}>
        {/* The back chevron is the forward one turned round: Onde draws one. */}
        <View style={styles.flip}>
          <IconButton icon="chevronRight" label={t('Mois précédent')} onPress={() => step(-1)} shape={1} />
        </View>
        <AppText variant="bodyStrong" style={styles.monthName} accessibilityRole="header">
          {`${months[shown.month - 1]} ${shown.year}`}
        </AppText>
        <IconButton icon="chevronRight" label={t('Mois suivant')} onPress={() => step(1)} shape={2} />
      </View>
      <View style={styles.week}>
        {weekdayInitials().map((day, index) => (
          <AppText key={index} variant="metaStrong" style={styles.weekday}>
            {day}
          </AppText>
        ))}
      </View>
      {monthWeeks(shown.year, shown.month).map((week, row) => (
        <View key={row} style={styles.week}>
          {week.map((iso, index) => {
            if (iso === null) return <View key={index} style={styles.dayCell} />;
            const day = Number(iso.slice(8));
            const picked = iso === chosen;
            const isToday = iso === today;
            return (
              <View key={index} style={styles.dayCell}>
                <Tappable
                  accessibilityRole="button"
                  accessibilityState={{ selected: picked }}
                  accessibilityLabel={`${weekdays[dayStart(iso).getDay()]} ${day} ${months[shown.month - 1]} ${shown.year}`}
                  onPress={() => onPick(iso)}
                  style={[styles.day, picked ? styles.dayChosen : null, isToday ? styles.dayToday : null]}
                >
                  <AppText variant={picked || isToday ? 'labelStrong' : 'label'} color={picked ? theme.color.onActionContainer : undefined}>
                    {String(day)}
                  </AppText>
                </Tappable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    monthHead: { flexDirection: 'row', alignItems: 'center' },
    flip: { transform: [{ scaleX: -1 }] },
    monthName: { flex: 1, textAlign: 'center' },
    week: { flexDirection: 'row' },
    weekday: { flex: 1, textAlign: 'center', paddingVertical: 4 },
    dayCell: { flex: 1, alignItems: 'center', paddingVertical: 2 },
    // A day holds a number: a calm sheet, never a pebble.
    day: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', ...corners(SHAPES.small) },
    dayChosen: { backgroundColor: theme.color.actionContainer },
    dayToday: { borderWidth: 1.5, borderColor: theme.color.focus },
  });

export const MonthCalendar = memo(MonthCalendarComponent);
