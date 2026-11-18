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
import { clockWords, keepWeekdays, longDay, narrowWeekday, weekNumberShort, weekNumberWords } from '@unlease/calendar/services/eventText';
import { layoutBars } from '@unlease/calendar/services/layout';
import { eventItem, itemOn, type AgendaItem } from '@app/agenda';
import { useAgenda } from '@app/hooks/useAgenda';
import { useLibraryStore } from '@app/store/libraryStore';
import { useCalendarUiStore } from '@app/store/calendarUi';

import { AppText, Icon, Organic, PressSurface, Tappable, useArrivals } from '@shared/ui/components';
import { listIn, listPressDelay } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { EDGE_ROOM, EventEdge } from './EventEdge';
import { isDayOff, itemColor, itemTitle, paintOf } from './paint';

const LANE = 18;
/** Under this, a day's cell holds a few letters: a timed event shows its title alone, never « 09:30 … ». */
export const NARROW_CELL = 72;

/**
 * What a bar of the month says: an event over days or all day is a bar on its wash with its colour's
 * edge; a timed one a dot then its time and title where the day is wide, its title alone on its wash
 * where it is narrow (`NARROW_CELL`). Read out with its time whenever it has one.
 */
export function monthChip(
  title: string,
  occurrence: { readonly allDay: boolean; readonly firstDay: string; readonly lastDay: string; readonly startAt: number },
  width: number,
  twelveHours: boolean,
): { readonly form: 'bar' | 'dot' | 'wash'; readonly text: string; readonly label: string } {
  const timed = !occurrence.allDay && occurrence.firstDay === occurrence.lastDay;
  if (!timed) return { form: 'bar', text: title, label: title };
  const clock = clockWords(formatClock(occurrence.startAt), twelveHours);
  const label = `${title}, ${clock}`;
  return width < NARROW_CELL ? { form: 'wash', text: title, label } : { form: 'dot', text: `${clock} ${title}`, label };
}
/** A bar's room on each side in its days: two days' bars, or a bar and the next day's line, keep clear of each other. */
const BAR_INSET = 2;
const HEAD = 26;

export interface MonthViewProps {
  readonly month: string;
  readonly today: string;
  readonly weekStart: number;
  /** The days of the week shown (« Jours travaillés seulement », `shownWeekdays`); null for all seven. */
  readonly weekdays: readonly number[] | null;
  readonly weekNumbers: boolean;
  readonly labelId: string | null;
  /** Hours on 12 (« 2 PM »), as the Réglages say. */
  readonly twelveHours: boolean;
  readonly onOpen: (item: AgendaItem, day: string) => void;
  readonly onDay: (day: string) => void;
}

function MonthViewComponent({ month, today, weekStart, weekdays, weekNumbers, labelId, twelveHours, onOpen, onDay }: MonthViewProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const weeks = useMemo(() => monthGrid(month, weekStart).map(week => keepWeekdays(week, weekdays)), [month, weekStart, weekdays]);
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

  // « Couleur de vos événements »: a change in Réglages repaints the month at once.
  const own = useCalendarUiStore(s => s.prefs.ownColor);
  const rows = useMemo(() => {
    const state = useLibraryStore.getState();
    return weeks.map(week => {
      const occurrences = layoutBars(agenda.occurrences, week, { timed: true, maxLanes: lanes });
      const used = Math.min(lanes, Math.max(0, ...occurrences.bars.map(bar => bar.lane + 1)));
      const extras = week.map(day => agenda.extras.filter(item => itemOn(item, day)));
      return { week, bars: occurrences.bars.map(bar => ({ ...bar, item: eventItem(state, bar.occurrence, own) })), hidden: occurrences.hidden, used, extras };
    });
  }, [agenda, weeks, lanes, own]);
  // An event made, brought back or moved into the month on screen settles in; a month turned shows whole.
  const arrived = useArrivals(
    rows.flatMap(row => [...row.bars.map(bar => `${bar.occurrence.key}@${row.week[0]}`), ...row.extras.flatMap((list, index) => list.map(item => `${item.key}@${row.week[index]}`))]),
    `${inMonth}:${weekStart}:${weekdays?.join('') ?? 'all'}:${labelId ?? ''}:${lanes}`,
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
                const chip = monthChip(itemTitle(bar.item), bar.occurrence, bar.span * cell, twelveHours);
                const off = isDayOff(bar.item);
                return (
                  <Animated.View
                    key={bar.occurrence.key}
                    entering={arrived.has(`${bar.occurrence.key}@${row.week[0]}`) ? listIn : undefined}
                    style={[styles.barSlot, { top: HEAD + bar.lane * LANE, left: gutter + bar.column * cell + BAR_INSET, width: bar.span * cell - 2 * BAR_INSET }]}
                  >
                    <Tappable
                      onPress={() => onOpen(bar.item, row.week[bar.column]!)}
                      style={[styles.bar, chip.form === 'bar' ? { paddingLeft: EDGE_ROOM } : null, { backgroundColor: chip.form === 'dot' ? 'transparent' : paint.tint }]}
                      accessibilityRole="button"
                      accessibilityLabel={off ? `${chip.label}, ${t('Day off')}` : chip.label}
                    >
                      {chip.form === 'bar' ? <EventEdge color={paint.fill} /> : null}
                      {off ? <Icon name="sun" size={12} color={paint.text} /> : null}
                      {chip.form === 'dot' ? <View style={[styles.dot, { backgroundColor: paint.fill }]} /> : null}
                      {/* A day too narrow for its time and its title: the title alone on its wash, cut at the bar's end rather than dotted; a whole day's bar as narrow is cut the same way, so one day's titles end alike. */}
                      <AppText variant="labelSmall" color={theme.color.ink} numberOfLines={1} ellipsizeMode={chip.form === 'wash' || bar.span * cell < NARROW_CELL ? 'clip' : 'tail'} style={styles.barText}>
                        {chip.text}
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
