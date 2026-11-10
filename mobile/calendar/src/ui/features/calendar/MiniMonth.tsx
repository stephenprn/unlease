/**
 * A month as a small grid (the drawer's, the year's, the date picker's): the weekdays' initials, each
 * day a tap; today ringed, the chosen day on the primary's pebble, the days holding something dotted.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { longDay, monthTitle, narrowWeekday } from '@unlease/calendar/services/eventText';
import { monthGrid } from '@unlease/calendar/services/time';

import { AppText, Tappable } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

export interface MiniMonthProps {
  /** Any day of the month. */
  readonly month: string;
  readonly weekStart: number;
  readonly today: string;
  readonly chosen?: string | null;
  /** The days holding something. */
  readonly marked?: ReadonlySet<string>;
  readonly onDay: (day: string) => void;
  /** Its title above the grid (the year view's months). */
  readonly titled?: boolean;
  readonly onTitle?: () => void;
  readonly cell?: number;
}

function MiniMonthComponent({ month, weekStart, today, chosen = null, marked, onDay, titled = false, onTitle, cell = 36 }: MiniMonthProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const weeks = monthGrid(month, weekStart);
  const inMonth = month.slice(0, 7);
  // Each day presses on its own pebble, a little inside its cell: a press never meets a neighbour's, nor the chosen day's.
  const inset = cell >= 30 ? 3 : 2;
  const pebble = { width: cell - 2 * inset, height: cell - 2 * inset, margin: inset };
  return (
    <View style={styles.month}>
      {titled ? (
        <Tappable onPress={onTitle} disabled={!onTitle} style={styles.title} accessibilityRole="button" accessibilityLabel={monthTitle(month)}>
          <AppText variant="labelStrong" color={month.slice(0, 7) === today.slice(0, 7) ? theme.color.link : undefined}>
            {monthTitle(month)}
          </AppText>
        </Tappable>
      ) : null}
      <View style={styles.row}>
        {Array.from({ length: 7 }, (_, index) => (
          <View key={index} style={[styles.cell, { width: cell, height: cell * 0.7 }]}>
            <AppText variant="labelSmall" color={theme.color.inkMuted}>
              {narrowWeekday((weekStart + index) % 7)}
            </AppText>
          </View>
        ))}
      </View>
      {weeks.map(week => (
        <View key={week[0]} style={styles.row}>
          {week.map(day => {
            const own = day.slice(0, 7) === inMonth;
            const isChosen = day === chosen;
            const isToday = day === today;
            return (
              <Tappable
                key={day}
                onPress={() => onDay(day)}
                pebble={Number(day.slice(8, 10)) % 4}
                style={[styles.cell, pebble, isChosen ? { backgroundColor: theme.color.action } : null]}
                accessibilityRole="button"
                accessibilityLabel={isToday ? t('{day}, aujourd’hui', { day: longDay(day) }) : longDay(day)}
                accessibilityState={{ selected: isChosen }}
              >
                <AppText
                  variant={isToday ? 'labelStrong' : 'label'}
                  color={isChosen ? theme.color.onAction : isToday ? theme.color.link : own ? theme.color.ink : theme.color.inkFaint}
                >
                  {Number(day.slice(8, 10))}
                </AppText>
                {marked?.has(day) && !isChosen ? <View style={[styles.dot, { bottom: 4 - inset, backgroundColor: theme.color.inkMuted }]} /> : null}
              </Tappable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export const MiniMonth = memo(MiniMonthComponent);

const makeStyles = (_theme: Theme) =>
  StyleSheet.create({
    month: { alignSelf: 'center' },
    title: { paddingHorizontal: 8, paddingVertical: 6, alignSelf: 'flex-start' },
    row: { flexDirection: 'row' },
    cell: { alignItems: 'center', justifyContent: 'center' },
    // Where it lay in the cell, inside the day's pebble.
    dot: { position: 'absolute', width: 4, height: 4, borderRadius: 2 },
  });
