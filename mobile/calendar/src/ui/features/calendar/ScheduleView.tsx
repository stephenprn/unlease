/**
 * « Planning »: the days ahead from the day shown, those holding something (and today), each under
 * its heading (« Lundi 16 novembre », the year only outside this one, how far it is at its end), which
 * stays at the top while its day scrolls; each day's things on one paper panel, a row each (`AgendaRow`:
 * its calendar's stone, its title over its time), what is over lying back, today's the now line where
 * now falls; nothing at all on them, the list's empty state. Reaching the end reads two more months.
 */
import React, { memo, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@unlease/core/i18n';
import { formatClock } from '@unlease/core/services/format';
import { clockWords, dayDistance, dayTitle, longDay } from '@unlease/calendar/services/eventText';
import { addDays } from '@unlease/calendar/services/time';
import { itemOver, itemsOn, itemUnderWay, nowLineAt, type AgendaItem } from '@app/agenda';
import { useAgenda } from '@app/hooks/useAgenda';
import { useLibraryStore } from '@app/store/libraryStore';
import { useMinute } from '@shared/app/hooks/useMinute';

import { AppText, EdgeSectionList, EmptyLine, EmptyState, FAB_CLEARANCE, Grain, GroundSlice, Organic, RowPanel, useArrivals, usePullToSync, type RowPlace } from '@shared/ui/components';
import { listIn } from '@shared/ui/theme/motion';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { AgendaRow } from './AgendaRow';

const STEP_DAYS = 60;

/** A row counts as shown once a little of it is (the day at the top is the first shown). */
const VIEWABILITY = { itemVisiblePercentThreshold: 1 } as const;

/** A day's things, laid on its panel as one item of its section. */
interface DayPanel {
  readonly day: string;
  readonly items: readonly AgendaItem[];
}

export interface ScheduleViewProps {
  readonly from: string;
  readonly today: string;
  readonly labelId: string | null;
  readonly twelveHours: boolean;
  readonly onOpen: (item: AgendaItem, day: string) => void;
}

/** A day's heading: « Lundi 16 novembre » this year, « Vendredi 1 janvier 2027 » past it. */
export function scheduleDayTitle(day: string, today: string): string {
  return day.slice(0, 4) === today.slice(0, 4) ? dayTitle(day) : longDay(day);
}

/** Where a row lies on its panel, the now line counted as a line of it: the first's and the last's press follows the panel's corners. */
function placeOn(index: number, count: number, nowAt: number | null): RowPlace | null {
  const first = index === 0 && nowAt !== 0;
  const last = index === count - 1 && nowAt !== count;
  return first && last ? 'only' : first ? 'first' : last ? 'last' : null;
}

/** The now line, as « Ma journée » and the time grid draw it: a red dot in the marks' column, its line to the panel's edge. */
function NowLine({ label }: { label: string }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <View style={styles.now} accessible accessibilityLabel={label}>
      <View style={[styles.nowDot, { backgroundColor: theme.color.danger }]} />
      <View style={[styles.nowLine, { backgroundColor: theme.color.danger }]} />
    </View>
  );
}

function ScheduleViewComponent({ from, today, labelId, twelveHours, onOpen }: ScheduleViewProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pullToSync = usePullToSync();
  // Each minute: what ends lies back, the now line moves.
  const now = useMinute();
  const [span, setSpan] = useState(STEP_DAYS);
  const to = addDays(from, span);
  const agenda = useAgenda(from, to, labelId);
  const sections = useMemo(() => {
    const state = useLibraryStore.getState();
    const out: { day: string; data: DayPanel[] }[] = [];
    for (let day = from; day < to; day = addDays(day, 1)) {
      const items = itemsOn(state, agenda, day);
      // A day is one panel; today with nothing says so under its heading instead.
      if (items.length > 0) out.push({ day, data: [{ day, items }] });
      else if (day === today) out.push({ day, data: [] });
    }
    // Nothing at all on these days: no today alone, the list's empty state (as on the web).
    return out.some(section => section.data.length > 0) ? out : [];
  }, [agenda, from, to, today]);

  // What is made, brought back or moved into the days read settles in; the list opened, filtered or read further just shows.
  const arrived = useArrivals(
    sections.flatMap(section => section.data.flatMap(panel => panel.items.map(item => `${item.key}@${section.day}`))),
    `${from}:${span}:${labelId ?? ''}`,
  );

  // The day pinned at the top lies on the ground's slice there; the others on the ground itself.
  const [top, setTop] = useState<string | null>(null);
  const [listTop, setListTop] = useState(0);
  // The pinned day's height: the head's line stands under it once days go beneath it, not under the bar above.
  const [headHeight, setHeadHeight] = useState(0);
  const box = useRef<React.ComponentRef<typeof View>>(null);
  const onViewable = useRef(({ viewableItems }: { viewableItems: readonly { readonly section?: { readonly day: string } }[] }) => {
    const first = viewableItems[0];
    setTop(first?.section?.day ?? null);
  }).current;
  const clock = clockWords(formatClock(now), twelveHours);

  const renderPanel = ({ item: panel }: { item: DayPanel }) => {
    const nowAt = nowLineAt(panel.items, panel.day, today, now);
    const line = <NowLine label={t('Now, {clock}', { clock })} />;
    return (
      <Organic outline="panel" style={styles.panel}>
        <RowPanel outline="panel" style={styles.panelClip} backdrop={<Grain />}>
          {panel.items.map((item, index) => (
            <React.Fragment key={item.key}>
              {index === nowAt ? line : null}
              <Animated.View entering={arrived.has(`${item.key}@${panel.day}`) ? listIn : undefined}>
                <AgendaRow
                  item={item}
                  day={panel.day}
                  twelveHours={twelveHours}
                  over={itemOver(item, panel.day, today, now)}
                  now={itemUnderWay(item, now)}
                  place={placeOn(index, panel.items.length, nowAt)}
                  onOpen={each => onOpen(each, panel.day)}
                />
              </Animated.View>
            </React.Fragment>
          ))}
          {nowAt === panel.items.length ? line : null}
        </RowPanel>
      </Organic>
    );
  };

  return (
    <View ref={box} style={styles.fill} onLayout={() => box.current?.measureInWindow((_x, y) => setListTop(y))}>
      <EdgeSectionList
        sections={sections}
        viewabilityConfig={VIEWABILITY}
        onViewableItemsChanged={onViewable}
        keyExtractor={panel => panel.day}
        stickySectionHeadersEnabled
        insetTop={top ? headHeight : 0}
        refreshControl={pullToSync}
        // Android's default clipping, with sticky days coming and going (a label chosen, two more months read), makes Fabric insert a view out of range (« addViewAt » crash).
        removeClippedSubviews={false}
        initialNumToRender={12}
        contentContainerStyle={{ paddingBottom: FAB_CLEARANCE + insets.bottom }}
        onEndReachedThreshold={0.5}
        onEndReached={() => setSpan(value => Math.min(value + STEP_DAYS, 730))}
        renderSectionHeader={({ section }) => (
          <View style={styles.heading} onLayout={section.day === top ? event => setHeadHeight(event.nativeEvent.layout.height) : undefined}>
            {section.day === top ? <GroundSlice top={listTop} /> : null}
            <AppText variant="labelStrong" color={section.day === today ? theme.color.link : theme.color.ink} style={styles.headingDay} numberOfLines={1}>
              {scheduleDayTitle(section.day, today)}
            </AppText>
            <AppText variant="meta">{dayDistance(section.day, today)}</AppText>
          </View>
        )}
        renderItem={renderPanel}
        renderSectionFooter={({ section }) => (section.data.length === 0 ? <EmptyLine text={t('Nothing planned')} style={styles.none} /> : null)}
        ListEmptyComponent={<EmptyState scene="reminders" title={t('Nothing planned')} text={t('No events on these days. The + button, at the bottom, adds one.')} />}
      />
    </View>
  );
}

export const ScheduleView = memo(ScheduleViewComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    fill: { flex: 1 },
    // The day's name over its panel's marks (12 to the panel, 16 in it), its distance on their end; more room above than below.
    heading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingHorizontal: 28, paddingTop: 18, paddingBottom: 8 },
    headingDay: { flexShrink: 1 },
    // A day's things on one sheet of paper, as Réglages' groups: the panel's corner, its hairline, its lift, its grain.
    panel: { marginHorizontal: 12, backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline, boxShadow: theme.lift.card },
    panelClip: { overflow: 'hidden', paddingVertical: 4 },
    none: { paddingHorizontal: 28, paddingVertical: 8 },
    // The dot's centre on the marks' column (6 + 10 + 12), the line to 6 from the panel's edge.
    now: { height: 10, flexDirection: 'row', alignItems: 'center', marginLeft: 23, marginRight: 6, marginVertical: 1 },
    nowDot: { width: 10, height: 10, borderRadius: 5 },
    nowLine: { flex: 1, height: 2 },
  });
