/**
 * « Aujourd'hui »: the day at a glance, a calm list on the ground. The weather when its layer is on;
 * what takes the whole day (birthdays, all-day events, a page's day); then what has a time, in time
 * order, what is over in the second ink, what runs a weight up and what comes next saying how long
 * (« Encore 25 min », « Dans 20 min »), the now line between them; an empty day says so and offers
 * an event (the view's empty state when nothing follows either, else a line); « Note du jour »; Carnet's reminders missed and still set; tomorrow's birthdays, all-day
 * events and first events. Each row opens what it is (`onOpen`: the event, the birthday, the note in
 * Carnet, the page in Pages). Rows are list rows (`ListRow`'s geometry): the mark in a 24 slot 16 in,
 * the words at 56. Drawn again each minute by the screen.
 */
import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APPS } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { formatClock, plural } from '@unlease/core/services/format';
import { LAYER_COLORS } from '@unlease/calendar/services/colors';
import { birthdayTitle, clockWords, weekdayDay } from '@unlease/calendar/services/eventText';
import type { ReminderItem } from '@unlease/calendar/services/layers';
import { overdueWords, rowStateWords, rowTimeWords, weatherPlaces, weatherWords, type DayItem, type DayRow } from '@unlease/calendar/services/today';
import { weatherKind } from '@unlease/calendar/services/weather';
import type { GlyphName } from '@unlease/design/glyphs';
import { GEOMETRY } from '@unlease/design/palette';
import { pebbleTurnOf } from '@unlease/design/pebbles';
import { SHAPES } from '@unlease/design/shapes';
import { useTodayPlan } from '@app/hooks/useTodayPlan';
import { useWeather } from '@app/hooks/useWeather';

import { AppText, Button, EdgeScrollView, EmptyLine, EmptyState, FAB_CLEARANCE, Icon, Organic, Tappable, useArrivals, usePullToSync } from '@shared/ui/components';
import { listIn, listPressDelay } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

const LAYER_GLYPHS: Readonly<Record<Exclude<DayItem['kind'], 'event'>, GlyphName>> = { birthday: 'cake', reminder: 'bell', page: 'page' };

export interface TodayViewProps {
  readonly today: string;
  readonly now: number;
  readonly twelveHours: boolean;
  readonly homePlace: string;
  /** Whether « Note du jour » can be offered: a server, running Pages. */
  readonly journal: boolean;
  readonly onOpen: (item: DayItem, day: string) => void;
  /** A note of Carnet's, by its id: a reminder missed. */
  readonly onOpenNote: (noteId: string) => void;
  /** « Note du jour »: its page, opened (`pageId`) or made first. */
  readonly onJournal: (pageId: string | null) => void;
  readonly onCreate: () => void;
  readonly onDay: (day: string) => void;
}

/** What a row is called. */
function titleOf(item: DayItem): string {
  switch (item.kind) {
    case 'event':
      return item.occurrence.event.title.trim() || t('Untitled');
    case 'birthday':
      return birthdayTitle(item.birthday.name, item.birthday.age);
    case 'reminder':
      return item.reminder.title || t('Untitled');
    case 'page':
      return item.page.title || t('Untitled');
  }
}

/** A row's mark: an event's calendar stone in its colour, a layer's glyph in its pigment, a page's emoji. */
function Lead({ item }: { item: DayItem }) {
  const theme = useTheme();
  if (item.kind === 'event') {
    return <Organic pebble={pebbleTurnOf(item.occurrence.event.feedId ?? 'own')} style={[leadStyles.stone, { backgroundColor: item.color ? theme.line[item.color].fill : theme.color.action }]} />;
  }
  if (item.kind === 'page' && item.page.icon) return <AppText style={leadStyles.emoji}>{item.page.icon}</AppText>;
  return <Icon name={LAYER_GLYPHS[item.kind]} size={20} color={theme.line[LAYER_COLORS[item.kind]].text} />;
}

// An event's calendar stone, the drawer's (`FeedStone`) a size down to sit in the 24 slot.
const leadStyles = StyleSheet.create({ emoji: { fontSize: 20, lineHeight: 24 }, stone: { width: 18, height: 16 } });

/** A list row: its mark in the 24 slot, its title over its line, what it says at its end. */
const Row = memo(function ListLine({
  lead,
  title,
  line,
  lineColor,
  end,
  strong,
  over,
  label,
  onPress,
}: {
  lead: React.ReactNode;
  title: string;
  line: React.ReactNode;
  lineColor?: string;
  end?: string;
  strong?: boolean;
  over?: boolean;
  label: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <Tappable unstable_pressDelay={listPressDelay} onPress={onPress} style={styles.row} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[styles.slot, over ? styles.over : null]}>{lead}</View>
      <View style={styles.words}>
        <AppText variant={strong ? 'bodyStrong' : 'body'} color={over ? theme.color.inkMuted : undefined} numberOfLines={2}>
          {title}
        </AppText>
        <AppText variant="meta" color={lineColor} numberOfLines={1}>
          {line}
        </AppText>
      </View>
      {end ? (
        <AppText variant="metaStrong" color={theme.color.link} style={styles.end}>
          {end}
        </AppText>
      ) : null}
    </Tappable>
  );
});

function ItemRow({ row, day, now, today, twelveHours, onOpen }: { row: DayRow; day: string; now: number; today: string; twelveHours: boolean; onOpen: (item: DayItem, day: string) => void }) {
  const theme = useTheme();
  const item = row.item;
  const place = item.kind === 'event' ? item.occurrence.event.place.trim() : '';
  const time = rowTimeWords(row, day, twelveHours);
  const end = day === today ? rowStateWords(row, now, today) : '';
  // A reminder's moment come is still to do (« Fait » in Carnet clears it): its time says so in danger ink.
  const due = item.kind === 'reminder' && row.state === 'past';
  const title = titleOf(item);
  return (
    <Row
      lead={<Lead item={item} />}
      title={title}
      line={
        <>
          <AppText variant="meta" color={due ? theme.color.danger : undefined}>
            {time}
          </AppText>
          {place ? ` · ${place}` : ''}
        </>
      }
      end={end}
      strong={row.state === 'now'}
      over={row.state === 'past' && !due}
      label={[title, time, place, end].filter(Boolean).join(', ')}
      onPress={() => onOpen(item, day)}
    />
  );
}

/** The now line, as the time grid draws it: a red dot in the marks' column, its line to the end. */
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

function SectionHead({ title, meta }: { title: string; meta?: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.head} accessibilityRole="header">
      <AppText variant="section">{title}</AppText>
      {meta ? <AppText variant="meta">{meta}</AppText> : null}
    </View>
  );
}

function TodayViewComponent({ today, now, twelveHours, homePlace, journal, onOpen, onOpenNote, onJournal, onCreate, onDay }: TodayViewProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pullToSync = usePullToSync();
  const { plan, dailyPageId } = useTodayPlan(today, now);
  const rows = useMemo(() => [...plan.allDay, ...plan.timed], [plan]);
  const weather = useWeather(
    useMemo(() => weatherPlaces(rows, homePlace), [rows, homePlace]),
    today,
  );
  // A thing made, brought back or synced in settles in; the view opened just shows.
  const arrived = useArrivals(
    rows.map(row => row.item.key),
    today,
  );
  const enter = (key: string) => (arrived.has(key) ? listIn : undefined);
  const clock = clockWords(formatClock(now), twelveHours);
  const tomorrow = plan.tomorrow;

  return (
    <EdgeScrollView style={styles.fill} contentContainerStyle={[styles.content, { paddingBottom: FAB_CLEARANCE + insets.bottom }]} refreshControl={pullToSync}>
      {weather ? (
        <View style={styles.weather} accessible accessibilityLabel={`${weatherWords(weather.day)}, ${weather.place}`}>
          <Icon name={weatherKind(weather.day.code) === 'clear' ? 'sun' : 'cloud'} size={18} color={theme.color.inkMuted} />
          <AppText variant="meta" numberOfLines={2} style={styles.weatherWords}>
            {`${weatherWords(weather.day)} · ${weather.place}`}
          </AppText>
        </View>
      ) : null}

      {rows.length === 0 && plan.overdue.length === 0 && !tomorrow ? (
        // Nothing today nor tomorrow: the view's empty place.
        <EmptyState scene="reminders" title={t('Nothing planned today')} text={t('The day is yours.')}>
          <Button kind="tonal" icon="plus" label={t('Create an event')} onPress={onCreate} />
        </EmptyState>
      ) : rows.length === 0 ? (
        // Nothing today, something below: the day's line, the way to fill it after.
        <EmptyLine size="body" text={t('Nothing planned today: the day is yours.')} action={{ label: t('Create an event'), onPress: onCreate }} style={styles.emptyDay} />
      ) : (
        <View accessibilityLabel={t('Today')}>
          {plan.allDay.map(row => (
            <Animated.View key={row.item.key} entering={enter(row.item.key)}>
              <ItemRow row={row} day={today} now={now} today={today} twelveHours={twelveHours} onOpen={onOpen} />
            </Animated.View>
          ))}
          {plan.timed.map((row, index) => (
            <React.Fragment key={row.item.key}>
              {index === plan.nowAt ? <NowLine label={t('Now, {clock}', { clock })} /> : null}
              <Animated.View entering={enter(row.item.key)}>
                <ItemRow row={row} day={today} now={now} today={today} twelveHours={twelveHours} onOpen={onOpen} />
              </Animated.View>
            </React.Fragment>
          ))}
          {plan.timed.length > 0 && plan.nowAt === plan.timed.length ? <NowLine label={t('Now, {clock}', { clock })} /> : null}
        </View>
      )}

      {journal ? (
        <Row
          lead={<Icon name={dailyPageId ? 'page' : 'pagePlus'} size={20} color={theme.color.ink} />}
          title={t('Today’s note')}
          line={dailyPageId ? t('Open in {app}', { app: APPS.pages.name }) : t('To write in {app}', { app: APPS.pages.name })}
          label={`${t('Today’s note')}, ${dailyPageId ? t('Open in {app}', { app: APPS.pages.name }) : t('To write in {app}', { app: APPS.pages.name })}`}
          onPress={() => onJournal(dailyPageId)}
        />
      ) : null}

      {plan.overdue.length > 0 ? (
        <View style={styles.section}>
          <SectionHead title={t('Overdue')} />
          {plan.overdue.map((reminder: ReminderItem) => {
            const when = overdueWords(reminder, today, twelveHours);
            const title = reminder.title || t('Untitled');
            return (
              <Row
                key={reminder.key}
                lead={<Icon name="bell" size={20} color={theme.line[LAYER_COLORS.reminder].text} />}
                title={title}
                line={when}
                lineColor={theme.color.danger}
                label={`${title}, ${t('Overdue')}, ${when}`}
                onPress={() => onOpenNote(reminder.noteId)}
              />
            );
          })}
        </View>
      ) : null}

      {tomorrow ? (
        <View style={styles.section}>
          <SectionHead title={t('Tomorrow')} meta={weekdayDay(tomorrow.day, Number(today.slice(0, 4)))} />
          {tomorrow.rows.map(row => (
            <ItemRow key={row.item.key} row={row} day={tomorrow.day} now={now} today={today} twelveHours={twelveHours} onOpen={onOpen} />
          ))}
          {tomorrow.more > 0 ? (
            <Tappable onPress={() => onDay(tomorrow.day)} style={styles.more} accessibilityRole="button">
              <AppText variant="label" color={theme.color.link}>
                {t('And {events} tomorrow', { events: plural(tomorrow.more, 'more event', 'more events') })}
              </AppText>
              <Icon name="chevronRight" size={18} color={theme.color.link} />
            </Tappable>
          ) : null}
        </View>
      ) : null}
    </EdgeScrollView>
  );
}

export const TodayView = memo(TodayViewComponent);

const makeStyles = (_theme: Theme) =>
  StyleSheet.create({
    fill: { flex: 1 },
    content: { paddingTop: 4 },
    // `ListRow`'s geometry: 6 in, 10 to the mark (16 from the edge), the words 16 after its 24 slot, half the rows' gap above and below.
    row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16, marginHorizontal: 6, marginVertical: GEOMETRY.rowGap / 2, paddingHorizontal: 10, paddingVertical: 8, ...corners(SHAPES.tab) },
    slot: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    // What is over lies back, as a link done does.
    over: { opacity: 0.55 },
    words: { flex: 1, gap: 2 },
    end: { flexShrink: 0 },
    // The dot's centre on the marks' column (6 + 10 + 12).
    now: { height: 10, flexDirection: 'row', alignItems: 'center', marginLeft: 23, marginRight: 6 },
    nowDot: { width: 10, height: 10, borderRadius: 5 },
    nowLine: { flex: 1, height: 2 },
    weather: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 },
    weatherWords: { flexShrink: 1 },
    emptyDay: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
    section: { paddingTop: 20 },
    // A group's head on the marks' column, more room above than below.
    head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingBottom: 4 },
    more: { alignSelf: 'flex-start', minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 4, marginHorizontal: 6, paddingHorizontal: 10, ...corners(SHAPES.tab) },
  });

