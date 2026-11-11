/**
 * The day, three days and the week, as Google draws them: the days' heads, a strip for what lasts all
 * day (bars across the days they cover, birthdays, pages' days, notes' reminders), then the hours, each
 * timed event a box in its day's column, side by side where they overlap (`layoutDay`), the present
 * a line across today. A long press on a column makes an event at that quarter hour.
 */
import React, { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Animated, { runOnUI, scrollTo, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@unlease/core/i18n';
import { formatClock } from '@unlease/core/services/format';
import { SHAPES } from '@unlease/design/shapes';
import { clockWords, hourLabel, longDay, shortWeekday, weekNumberShort, weekNumberWords } from '@unlease/calendar/services/eventText';
import { layoutBars, layoutDay, minuteAt } from '@unlease/calendar/services/layout';
import { addDays, dayToInstant, weekdayOf } from '@unlease/calendar/services/time';
import { eventItem, itemOn, type AgendaItem } from '@app/agenda';
import { useAgenda } from '@app/hooks/useAgenda';
import { useMinute } from '@shared/app/hooks/useMinute';
import { useLibraryStore } from '@app/store/libraryStore';
import { haptic } from '@shared/platform/haptics';

import { AppText, FAB_CLEARANCE, Organic, ScrollEdges, Tappable, useArrivals, usePullToSync } from '@shared/ui/components';
import { listIn } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { EDGE_ROOM, EventEdge } from './EventEdge';
import { itemColor, itemTitle, paintOf } from './paint';
import { usePeriodScroll } from './PeriodPager';

export const HOUR_HEIGHT = 52;
const GUTTER = 48;
const LANE = 24;
const MAX_LANES = 3;

export interface TimeGridViewProps {
  readonly days: readonly string[];
  readonly today: string;
  readonly labelId: string | null;
  readonly twelveHours: boolean;
  readonly weekNumbers: boolean;
  readonly onOpen: (item: AgendaItem, day: string) => void;
  /** A long press on a column: an event there (a time of day). */
  readonly onCreate: (start: string) => void;
  /** A day's head pressed: that day alone. */
  readonly onDay: (day: string) => void;
}

function TimeGridViewComponent({ days, today, labelId, twelveHours, weekNumbers, onOpen, onCreate, onDay }: TimeGridViewProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const now = useMinute();
  const [width, setWidth] = useState(0);
  const scroll = useAnimatedRef<Animated.ScrollView>();
  // In the pager, the grids beside the one on screen keep its hours, so a swipe shows them at the same time of day.
  const sync = usePeriodScroll();
  const syncY = sync?.y;
  const syncShown = sync?.shown;
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const agenda = useAgenda(first, addDays(last, 1), labelId);
  const column = width > GUTTER ? (width - GUTTER) / days.length : 0;

  const { bars, extras, more, stripHeight } = useMemo(() => {
    const state = useLibraryStore.getState();
    const row = layoutBars(agenda.occurrences, days, { timed: false, maxLanes: MAX_LANES });
    const perDay = days.map(day => agenda.extras.filter(item => itemOn(item, day)));
    const most = Math.max(0, ...perDay.map(list => list.length));
    // What a day holds past its lanes: its hidden bars and what the other apps bring past three, said « +N » in a lane of its own.
    const left = perDay.map((list, index) => (row.hidden[index] ?? 0) + Math.max(0, list.length - 3));
    const lanes = Math.min(MAX_LANES, row.lanes) + Math.min(3, most) + (left.some(count => count > 0) ? 1 : 0);
    return { bars: row.bars.map(bar => ({ ...bar, item: eventItem(state, bar.occurrence) })), extras: perDay, more: left, stripHeight: Math.max(0, lanes) * LANE + (lanes > 0 ? 6 : 0) };
  }, [agenda, days]);
  const barLanes = Math.min(MAX_LANES, Math.max(0, ...bars.map(bar => bar.lane + 1)));

  const boxes = useMemo(() => days.map(day => layoutDay(agenda.occurrences, day)), [agenda, days]);
  // An event made, brought back or moved into the days on screen settles in; the days turned show whole.
  const arrived = useArrivals(
    [...bars.map(bar => bar.occurrence.key), ...extras.flatMap((list, index) => list.map(item => `${item.key}@${days[index]}`)), ...boxes.flatMap(list => list.map(box => box.occurrence.key))],
    `${first}:${days.length}:${labelId ?? ''}`,
  );
  // The day scrolls up from under the bottom bar, which lies over the screen's foot.
  const insets = useSafeAreaInsets();
  const pullToSync = usePullToSync();
  const state = useLibraryStore.getState();

  // Opens on the morning, or on now when today shows and it is later; turning the period keeps the hours where they were, as a page turned keeps its line.
  // A grid beside the one on screen opens on that one's hours instead (and follows them, below).
  useEffect(() => {
    if (syncY && syncShown) {
      const follow = (): void => {
        'worklet';
        if (!syncShown() && syncY.value >= 0) scrollTo(scroll, 0, syncY.value, false);
      };
      runOnUI(follow)();
    }
    if (syncShown && !syncShown()) return undefined;
    const hour = days.includes(today) ? Math.max(7, new Date().getHours() - 2) : 7;
    const timer = setTimeout(() => scroll.current?.scrollTo({ y: hour * HOUR_HEIGHT, animated: false }), 0);
    return () => clearTimeout(timer);
    // Once, as the grid opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onScroll = useAnimatedScrollHandler(event => {
    if (syncY && syncShown && syncShown()) syncY.value = event.contentOffset.y;
  });
  useAnimatedReaction(
    () => (syncY ? syncY.value : -1),
    (y, before) => {
      if (y < 0 || y === before || !syncShown || syncShown()) return;
      scrollTo(scroll, 0, y, false);
    },
  );

  const create = (day: string, event: GestureResponderEvent): void => {
    // A long press that takes hold clicks, as Carnet's do.
    haptic('pick');
    const minute = minuteAt(event.nativeEvent.locationY, HOUR_HEIGHT * 24);
    onCreate(`${day}T${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
  };

  const nowTop = ((now - dayToInstant(today)) / 60_000 / 60) * HOUR_HEIGHT;

  return (
    <View style={styles.fill} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
      <View style={styles.heads}>
        <View style={[styles.gutter, styles.weekCell]}>
          {weekNumbers ? (
            <AppText variant="labelSmall" color={theme.color.inkMuted} numberOfLines={1} accessibilityLabel={weekNumberWords(first)}>
              {weekNumberShort(first)}
            </AppText>
          ) : null}
        </View>
        {days.map(day => {
          const isToday = day === today;
          return (
            <Tappable key={day} onPress={() => onDay(day)} style={[styles.head, { width: column }]} accessibilityRole="button" accessibilityLabel={longDay(day)}>
              <AppText variant="labelSmall" color={isToday ? theme.color.link : theme.color.inkMuted}>
                {shortWeekday(weekdayOf(day))}
              </AppText>
              <Organic pebble={isToday ? Number(day.slice(8, 10)) % 4 : null} style={[styles.date, isToday ? { backgroundColor: theme.color.action } : null]}>
                <AppText variant="title" color={isToday ? theme.color.onAction : theme.color.ink}>
                  {Number(day.slice(8, 10))}
                </AppText>
              </Organic>
            </Tappable>
          );
        })}
      </View>
      {stripHeight > 0 && column > 0 ? (
        <View style={[styles.strip, { height: stripHeight }]}>
          {bars.map(bar => {
            const paint = paintOf(theme, bar.item.kind === 'event' ? bar.item.color : null);
            return (
              <Animated.View key={bar.occurrence.key} entering={arrived.has(bar.occurrence.key) ? listIn : undefined} style={[styles.barSlot, { left: GUTTER + bar.column * column + 2, width: bar.span * column - 4, top: bar.lane * LANE + 2 }]}>
                <Tappable onPress={() => onOpen(bar.item, days[bar.column]!)} style={[styles.bar, styles.edged, { backgroundColor: paint.tint }]} accessibilityRole="button" accessibilityLabel={itemTitle(bar.item)}>
                  <EventEdge color={paint.fill} />
                  <AppText variant="labelSmall" color={theme.color.ink} numberOfLines={1}>
                    {itemTitle(bar.item)}
                  </AppText>
                </Tappable>
              </Animated.View>
            );
          })}
          {extras.map((list, index) =>
            list.slice(0, 3).map((item, row) => {
              const paint = paintOf(theme, itemColor(item));
              const key = `${item.key}@${days[index]}`;
              return (
                <Animated.View key={key} entering={arrived.has(key) ? listIn : undefined} style={[styles.barSlot, { left: GUTTER + index * column + 2, width: column - 4, top: (barLanes + row) * LANE + 2 }]}>
                  <Tappable onPress={() => onOpen(item, days[index]!)} style={[styles.bar, { backgroundColor: paint.tint }]} accessibilityRole="button" accessibilityLabel={itemTitle(item)}>
                    <AppText variant="labelSmall" color={paint.text} numberOfLines={1}>
                      {item.kind === 'reminder' ? `${clockWords(formatClock(item.reminder.at), twelveHours)} ${itemTitle(item)}` : itemTitle(item)}
                    </AppText>
                  </Tappable>
                </Animated.View>
              );
            }),
          )}
          {more.map((count, index) =>
            count > 0 ? (
              <Tappable
                key={`more@${days[index]}`}
                onPress={() => onDay(days[index]!)}
                style={[styles.barSlot, styles.more, { left: GUTTER + index * column + 2, width: column - 4, top: (barLanes + Math.min(3, extras[index]!.length)) * LANE + 2 }]}
                accessibilityRole="button"
                accessibilityLabel={t('+{count}', { count })}
                accessibilityHint={longDay(days[index]!)}
              >
                <AppText variant="labelSmall" color={theme.color.inkMuted} numberOfLines={1}>
                  {t('+{count}', { count })}
                </AppText>
              </Tappable>
            ) : null,
          )}
        </View>
      ) : null}
      {/* The hours soften as they slide under the day heads and the screen's foot. */}
      <ScrollEdges>
      <Animated.ScrollView ref={scroll} onScroll={onScroll} scrollEventThrottle={16} style={styles.fill} contentContainerStyle={{ height: HOUR_HEIGHT * 24 + 24 + FAB_CLEARANCE + insets.bottom }} refreshControl={pullToSync}>
        {Array.from({ length: 24 }, (_, hour) => (
          <View key={hour} style={[styles.hour, { top: hour * HOUR_HEIGHT }]}>
            <AppText variant="labelSmall" color={theme.color.inkMuted} style={styles.hourLabel}>
              {hour === 0 ? '' : hourLabel(hour, twelveHours)}
            </AppText>
            <View style={[styles.line, { backgroundColor: theme.color.hairline }]} />
          </View>
        ))}
        {column > 0
          ? days.map((day, index) => (
              <Tappable
                key={day}
                noTint
                onLongPress={event => create(day, event)}
                delayLongPress={350}
                style={[styles.column, { left: GUTTER + index * column, width: column, height: HOUR_HEIGHT * 24 }]}
                accessibilityLabel={t('Créer un événement le {day}', { day: longDay(day) })}
              >
                {boxes[index]!.map(box => {
                  const item = eventItem(state, box.occurrence);
                  const paint = paintOf(theme, item.kind === 'event' ? item.color : null);
                  // 1 under its start's line and 1 short of its end, 2 inside its column's lines: back to back, side by side or by a line, events keep clear of each other.
                  const height = ((box.bottom - box.top) / 60) * HOUR_HEIGHT - 2;
                  const part = column / box.columns;
                  // Its room in lines of 16: one puts its time after its title, more wrap the title over its time and place.
                  const lines = Math.max(1, Math.floor((height - 4) / 16));
                  // A week's column on a phone holds a few letters a line: the title alone, cut rather than dotted line after line.
                  const narrow = part * box.span < 64;
                  const clock = clockWords(formatClock(box.occurrence.startAt), twelveHours);
                  const place = box.occurrence.event.place.trim();
                  return (
                    <Animated.View
                      key={box.occurrence.key}
                      entering={arrived.has(box.occurrence.key) ? listIn : undefined}
                      style={[styles.boxSlot, { top: (box.top / 60) * HOUR_HEIGHT + 1, height, left: box.column * part + 2, width: part * box.span - 4 }]}
                    >
                      <Tappable
                        onPress={() => onOpen(item, day)}
                        style={[styles.box, styles.edged, lines < 2 ? styles.boxShort : null, { backgroundColor: paint.tint }]}
                        accessibilityRole="button"
                        accessibilityLabel={`${itemTitle(item)}, ${clock}`}
                      >
                        <EventEdge color={paint.fill} />
                        {narrow ? (
                          <AppText variant="labelSmall" numberOfLines={lines} ellipsizeMode="clip">
                            {itemTitle(item)}
                          </AppText>
                        ) : lines < 2 ? (
                          <AppText variant="labelSmall" numberOfLines={1}>
                            {itemTitle(item)}
                            <AppText variant="labelSmall" color={theme.color.inkMuted}>{` ${clock}`}</AppText>
                          </AppText>
                        ) : (
                          <>
                            <AppText variant="labelSmall" numberOfLines={lines - 1}>
                              {itemTitle(item)}
                            </AppText>
                            <AppText variant="labelSmall" color={theme.color.inkMuted} numberOfLines={1}>
                              {lines >= 3 && place ? `${clock} · ${place}` : clock}
                            </AppText>
                          </>
                        )}
                      </Tappable>
                    </Animated.View>
                  );
                })}
              </Tappable>
            ))
          : null}
        {days.includes(today) && column > 0 ? (
          <View pointerEvents="none" style={[styles.now, { top: nowTop, left: GUTTER + days.indexOf(today) * column - 4, width: column + 4 }]}>
            <View style={[styles.nowDot, { backgroundColor: theme.color.danger }]} />
            <View style={[styles.nowLine, { backgroundColor: theme.color.danger }]} />
          </View>
        ) : null}
      </Animated.ScrollView>
      </ScrollEdges>
    </View>
  );
}

export const TimeGridView = memo(TimeGridViewComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    fill: { flex: 1 },
    heads: { flexDirection: 'row', paddingTop: 4 },
    gutter: { width: GUTTER },
    weekCell: { alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 10 },
    head: { alignItems: 'center', gap: 2, paddingVertical: 4, ...corners(SHAPES.chip) },
    date: { minWidth: 36, height: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    strip: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.color.hairline },
    // Each item's place on the grid (where it settles in), the item filling it.
    barSlot: { position: 'absolute', height: LANE - 4 },
    more: { justifyContent: 'center', paddingHorizontal: 4, ...corners(SHAPES.small) },
    bar: { flex: 1, justifyContent: 'center', paddingHorizontal: 6, ...corners(SHAPES.small) },
    hour: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-start', height: HOUR_HEIGHT },
    hourLabel: { width: GUTTER - 6, textAlign: 'right', marginTop: -8, paddingRight: 6 },
    line: { flex: 1, height: StyleSheet.hairlineWidth },
    column: { position: 'absolute', top: 0 },
    boxSlot: { position: 'absolute' },
    box: { flex: 1, paddingLeft: 4, paddingRight: 3, paddingVertical: 2, overflow: 'hidden', ...corners(SHAPES.small) },
    boxShort: { justifyContent: 'center', paddingVertical: 0 },
    /** Its colour's wash, room for its pigment's edge on the left (`EventEdge`): the web's chip. */
    edged: { paddingLeft: EDGE_ROOM },
    now: { position: 'absolute', height: 10, flexDirection: 'row', alignItems: 'center', marginTop: -5 },
    nowDot: { width: 10, height: 10, borderRadius: 5 },
    nowLine: { flex: 1, height: 2 },
  });
