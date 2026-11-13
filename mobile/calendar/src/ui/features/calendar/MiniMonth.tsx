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
import { VARIANTS } from '@shared/ui/theme/typography';

/** A busy day's dot: its side, and its room under the number's line (the digits' foot lies a little above the line's). */
const DOT = 4;
const DOT_GAP = 1;

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
  const side = cell - 2 * inset;
  // The dot sits under the number, never on it: where the pebble is too small to hold both (the year's), the row grows under it.
  const dotTop = (side + VARIANTS.label.lineHeight) / 2 + DOT_GAP;
  const below = marked ? Math.max(0, Math.ceil(dotTop + DOT + 1 - side - inset)) : 0;
  const pebble = { width: side, height: side, margin: inset, marginBottom: inset + below };
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
                accessibilityLabel={isToday ? t('{day}, today', { day: longDay(day) }) : longDay(day)}
                accessibilityState={{ selected: isChosen }}
              >
                <AppText
                  variant={isToday ? 'labelStrong' : 'label'}
                  color={isChosen ? theme.color.onAction : isToday ? theme.color.link : own ? theme.color.ink : theme.color.inkFaint}
                >
                  {Number(day.slice(8, 10))}
                </AppText>
                {marked?.has(day) && !isChosen ? <View style={[styles.dot, { top: dotTop, backgroundColor: theme.color.inkMuted }]} /> : null}
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
    // Centred under the number, inside the day's pebble or just under it.
    dot: { position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2 },
  });
