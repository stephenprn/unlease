/**
 * The month, as Google draws it: its weeks, each day a cell with its number, the events and the
 * layers' items as bars across the days they cover (`layoutBars`, timed ones too), « +2 » for what
 * does not fit. A day pressed opens that day; a bar its event.
 */
import React, { memo, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@unlease/core/i18n';
import { formatClock } from '@unlease/core/services/format';
import { SHAPES } from '@unlease/design/shapes';
import { monthGrid, addDays, weekdayOf } from '@unlease/calendar/services/time';
import { clockWords, longDay, narrowWeekday, weekNumberShort, weekNumberWords } from '@unlease/calendar/services/eventText';
import { layoutBars } from '@unlease/calendar/services/layout';
import { eventItem, itemOn, type AgendaItem } from '@app/agenda';
import { useAgenda } from '@app/hooks/useAgenda';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, Organic, PressSurface, Tappable, useArrivals } from '@shared/ui/components';
import { listIn, listPressDelay } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { EDGE_ROOM, EventEdge } from './EventEdge';
import { itemColor, itemTitle, paintOf } from './paint';

const LANE = 18;
/** A bar's room on each side in its days: two days' bars, or a bar and the next day's line, keep clear of each other. */
const BAR_INSET = 2;
const HEAD = 26;

export interface MonthViewProps {
  readonly month: string;
  readonly today: string;
  readonly weekStart: number;
  readonly hideWeekends: boolean;
  readonly weekNumbers: boolean;
  readonly labelId: string | null;
  /** Hours on 12 (« 2 PM »), as the Réglages say. */
  readonly twelveHours: boolean;
  readonly onOpen: (item: AgendaItem, day: string) => void;
  readonly onDay: (day: string) => void;
}

function MonthViewComponent({ month, today, weekStart, hideWeekends, weekNumbers, labelId, twelveHours, onOpen, onDay }: MonthViewProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const weeks = useMemo(() => monthGrid(month, weekStart).map(week => (hideWeekends ? week.filter(day => weekdayOf(day) !== 0 && weekdayOf(day) !== 6) : week)), [month, weekStart, hideWeekends]);
  const first = weeks[0]![0]!;
  const lastWeek = weeks[weeks.length - 1]!;
  const agenda = useAgenda(first, addDays(lastWeek[lastWeek.length - 1]!, 1), labelId);
  const gutter = weekNumbers ? 28 : 0;
  const columns = weeks[0]!.length;
  const cell = size.width > gutter ? (size.width - gutter) / columns : 0;
  // The weeks run down to the gesture bar, as Google's do: the capture pebble floats over the last one's end.
  const insets = useSafeAreaInsets();
  const clear = insets.bottom + 8;
  const rowHeight = size.height > 0 ? (size.height - 24 - clear) / weeks.length : 0;
  const lanes = Math.max(1, Math.floor((rowHeight - HEAD - LANE) / LANE));
  const inMonth = month.slice(0, 7);

  const rows = useMemo(() => {
    const state = useLibraryStore.getState();
    return weeks.map(week => {
      const occurrences = layoutBars(agenda.occurrences, week, { timed: true, maxLanes: lanes });
      const used = Math.min(lanes, Math.max(0, ...occurrences.bars.map(bar => bar.lane + 1)));
      const extras = week.map(day => agenda.extras.filter(item => itemOn(item, day)));
      return { week, bars: occurrences.bars.map(bar => ({ ...bar, item: eventItem(state, bar.occurrence) })), hidden: occurrences.hidden, used, extras };
    });
  }, [agenda, weeks, lanes]);
  // An event made, brought back or moved into the month on screen settles in; a month turned shows whole.
  const arrived = useArrivals(
    rows.flatMap(row => [...row.bars.map(bar => `${bar.occurrence.key}@${row.week[0]}`), ...row.extras.flatMap((list, index) => list.map(item => `${item.key}@${row.week[index]}`))]),
    `${inMonth}:${weekStart}:${hideWeekends ? 1 : 0}:${labelId ?? ''}:${lanes}`,
  );

  return (
    <View style={styles.fill} onLayout={(event: LayoutChangeEvent) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
      <View style={[styles.weekdays, { paddingLeft: gutter }]}>
        {weeks[0]!.map(day => (
          <View key={day} style={[styles.weekday, { width: cell }]}>
            <AppText variant="labelSmall" color={theme.color.inkMuted}>
              {narrowWeekday(weekdayOf(day))}
            </AppText>
          </View>
        ))}
      </View>
      {cell > 0
        ? rows.map(row => (
            <View key={row.week[0]} style={[styles.week, { height: rowHeight }]}>
              {weekNumbers ? (
                <AppText variant="labelSmall" color={theme.color.inkFaint} style={[styles.weekNumber, { width: gutter }]} accessibilityLabel={weekNumberWords(row.week[0]!)}>
                  {weekNumberShort(row.week[0]!)}
                </AppText>
              ) : null}
              {row.week.map((day, index) => {
                const isToday = day === today;
                const room = lanes - row.used;
                const shown = row.extras[index]!.slice(0, Math.max(0, room));
                const more = row.hidden[index]! + row.extras[index]!.length - shown.length;
                return (
                  <Tappable key={day} noTint unstable_pressDelay={listPressDelay} onPress={() => onDay(day)} style={[styles.cell, { left: gutter + index * cell, width: cell, height: rowHeight }]} accessibilityRole="button" accessibilityLabel={longDay(day)}>
                    {/* The press lies 2 inside the day's lines, never over a neighbour's. */}
                    <PressSurface style={styles.cellPress} />
                    <Organic pebble={isToday ? Number(day.slice(8, 10)) % 4 : null} style={[styles.number, isToday ? { backgroundColor: theme.color.action } : null]}>
                      <AppText variant="labelSmall" color={isToday ? theme.color.onAction : day.slice(0, 7) === inMonth ? theme.color.ink : theme.color.inkFaint}>
                        {Number(day.slice(8, 10))}
                      </AppText>
                    </Organic>
                    {shown.map((item, at) => {
                      const paint = paintOf(theme, itemColor(item));
                      const key = `${item.key}@${day}`;
                      return (
                        <Animated.View key={item.key} entering={arrived.has(key) ? listIn : undefined} style={[styles.barSlot, { top: HEAD + (row.used + at) * LANE, left: BAR_INSET, width: cell - 2 * BAR_INSET }]}>
                          <Tappable onPress={() => onOpen(item, day)} style={[styles.bar, { backgroundColor: paint.tint }]} accessibilityRole="button" accessibilityLabel={itemTitle(item)}>
                            <AppText variant="labelSmall" color={paint.text} numberOfLines={1}>
                              {itemTitle(item)}
                            </AppText>
                          </Tappable>
                        </Animated.View>
                      );
                    })}
                    {more > 0 ? (
                      <AppText variant="labelSmall" color={theme.color.inkMuted} style={[styles.more, { top: HEAD + lanes * LANE }]}>
                        {t('+{count}', { count: more })}
                      </AppText>
                    ) : null}
                  </Tappable>
                );
              })}
              {row.bars.map(bar => {
                const paint = paintOf(theme, bar.item.kind === 'event' ? bar.item.color : null);
                const timed = !bar.occurrence.allDay && bar.occurrence.firstDay === bar.occurrence.lastDay;
                return (
                  <Animated.View
                    key={bar.occurrence.key}
                    entering={arrived.has(`${bar.occurrence.key}@${row.week[0]}`) ? listIn : undefined}
                    style={[styles.barSlot, { top: HEAD + bar.lane * LANE, left: gutter + bar.column * cell + BAR_INSET, width: bar.span * cell - 2 * BAR_INSET }]}
                  >
                    <Tappable
                      onPress={() => onOpen(bar.item, row.week[bar.column]!)}
                      style={[styles.bar, timed ? null : { paddingLeft: EDGE_ROOM }, { backgroundColor: timed ? 'transparent' : paint.tint }]}
                      accessibilityRole="button"
                      accessibilityLabel={itemTitle(bar.item)}
                    >
                      {timed ? null : <EventEdge color={paint.fill} />}
                      {timed ? <View style={[styles.dot, { backgroundColor: paint.fill }]} /> : null}
                      <AppText variant="labelSmall" color={theme.color.ink} numberOfLines={1} style={styles.barText}>
                        {timed ? `${clockWords(formatClock(bar.occurrence.startAt), twelveHours)} ${itemTitle(bar.item)}` : itemTitle(bar.item)}
                      </AppText>
                    </Tappable>
                  </Animated.View>
                );
              })}
            </View>
          ))
        : null}
    </View>
  );
}

export const MonthView = memo(MonthViewComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    fill: { flex: 1 },
    weekdays: { flexDirection: 'row', height: 24, alignItems: 'center' },
    weekday: { alignItems: 'center' },
    week: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.color.hairline },
    weekNumber: { position: 'absolute', top: 6, left: 0, textAlign: 'center' },
    cell: { position: 'absolute', top: 0, alignItems: 'center', paddingTop: 2 },
    number: { minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
    cellPress: { position: 'absolute', top: 2, left: 2, right: 2, bottom: 2, ...corners(SHAPES.small) },
    // Each bar's place in its week (where it settles in), the bar filling it.
    barSlot: { position: 'absolute', height: LANE - 2 },
    bar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 3, ...corners(SHAPES.chip) },
    barText: { flexShrink: 1 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    more: { position: 'absolute', left: 4 },
  });
