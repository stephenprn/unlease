/**
 * Agenda's home: the calendar in the view chosen (the schedule by default on a phone, the day, three
 * days, the week, the month, the year), or « Aujourd'hui », the day at a glance (`TodayView`, with
 * nothing to turn), its title the period (a tap picks a day), « Aujourd'hui », the
 * views' switcher and the search at its head; a swipe across goes to the period before or after. The
 * bottom bar's pebble makes an event (at the next hour of the day shown), « Ajouter en quelques mots » one in a few
 * words. The drawer holds the views, the labels, the calendars and the layers.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Keyframe } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';

import { getLocale, t, tc } from '@unlease/core/i18n';
import { PERIOD_VIEWS, stepDay, viewDays, viewTitle, VIEW_NAMES, type CalendarView } from '@unlease/calendar/services/eventText';
import type { DayItem } from '@unlease/calendar/services/today';
import { addMinutes, isDay, today as todayOf } from '@unlease/calendar/services/time';
import type { CalendarPrefs } from '@unlease/calendar/models/prefs';
import type { AgendaItem } from '@app/agenda';
import { selectDay, selectPrefs, selectView, showDay, showView, useCalendarUiStore } from '@app/store/calendarUi';
import { useLibraryStore } from '@app/store/libraryStore';
import { useMinute } from '@shared/app/hooks/useMinute';
import { notesPlace, openInApp, pagePlace } from '@shared/app/openApp';
import { selectDrawerOpen, setDrawerOpen, showSnack, useUiStore } from '@shared/app/store/uiStore';
import { later } from '@app/later';
import { dailyPage, SyncError } from '@app/sync/transport';
import { selectServer, selectServerApps, useSettingsStore } from '@shared/app/store/settingsStore';

import { AppText, FabMenu, Ground, IconButton, LabelTag, Menu, SyncLine, Tappable } from '@shared/ui/components';
import { decelerate, duration } from '@shared/ui/theme/motion';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { DayPickerSheet } from '../features/calendar/DayPickerSheet';
import { MonthView } from '../features/calendar/MonthView';
import { PeriodPager } from '../features/calendar/PeriodPager';
import { QuickAddSheet } from '../features/calendar/QuickAddSheet';
import { ScheduleView } from '../features/calendar/ScheduleView';
import { TimeGridView } from '../features/calendar/TimeGridView';
import { TodayView } from '../features/calendar/TodayView';
import { YearView } from '../features/calendar/YearView';
import { Drawer, VIEW_GLYPHS, type DrawerPlace } from '../navigation/Drawer';
import type { RootStackParamList, ScreenProps } from '../navigation/types';

/** The period's name fades in as its period arrives (the one it replaces just goes). */
const TITLE_IN = new Keyframe({ 0: { opacity: 0 }, 100: { opacity: 1, easing: decelerate } }).duration(duration.medium);

/** Where an item opens: its event, the birthday, or another app's note or page. */
export function openItem(go: { readonly event: (params: RootStackParamList['Event']) => void; readonly birthday: (params: RootStackParamList['Birthday']) => void }, item: AgendaItem | DayItem, day: string): void {
  switch (item.kind) {
    case 'event':
      go.event({ id: item.occurrence.seriesId, at: item.occurrence.occurrence });
      break;
    case 'birthday':
      go.birthday({ id: item.birthday.contactId, day });
      break;
    case 'reminder':
      later(openInApp('notes', notesPlace('note', item.reminder.noteId)));
      break;
    case 'page':
      later(openInApp('pages', pagePlace(item.page.pageId)));
      break;
  }
}

/** One period, drawn from its day: the pager draws the one on screen and the two beside it. */
const PeriodBody = memo(function PeriodBody({
  view,
  anchor,
  today,
  label,
  prefs,
  onOpen,
  onDay,
  onCreate,
}: {
  view: CalendarView;
  anchor: string;
  today: string;
  label: string | null;
  prefs: CalendarPrefs;
  onOpen: (item: AgendaItem, on: string) => void;
  onDay: (day: string) => void;
  onCreate: (start?: string) => void;
}) {
  // The same days while the period stays (a minute passing re-renders the screen): the grid keeps its scroll and its layout.
  const days = useMemo(() => viewDays(view, anchor, prefs.weekStart, prefs.hideWeekends), [view, anchor, prefs.weekStart, prefs.hideWeekends]);
  switch (view) {
    case 'schedule':
      return <ScheduleView from={label ? today : anchor} today={today} labelId={label} twelveHours={prefs.twelveHours} onOpen={onOpen} />;
    case 'month':
      return <MonthView month={anchor} today={today} weekStart={prefs.weekStart} hideWeekends={prefs.hideWeekends} weekNumbers={prefs.weekNumbers} labelId={label} twelveHours={prefs.twelveHours} onOpen={onOpen} onDay={onDay} />;
    case 'year':
      return <YearView year={Number(anchor.slice(0, 4))} today={today} weekStart={prefs.weekStart} labelId={label} onDay={onDay} onMonth={month => showView('month', month)} />;
    default:
      return <TimeGridView days={days} today={today} labelId={label} twelveHours={prefs.twelveHours} weekNumbers={prefs.weekNumbers} onOpen={onOpen} onCreate={onCreate} onDay={onDay} />;
  }
});

export function CalendarScreen({ navigation, route }: ScreenProps<'Calendar'>) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const now = useMinute();
  const today = todayOf(now);
  const day = useCalendarUiStore(selectDay);
  const view = useCalendarUiStore(selectView);
  const prefs = useCalendarUiStore(selectPrefs);
  const label = route.params?.label ?? null;
  const labelInfo = useLibraryStore(s => (label ? s.calendarLabels[label] : undefined));
  const drawerOpen = useUiStore(selectDrawerOpen);
  const server = useSettingsStore(selectServer);
  const apps = useSettingsStore(selectServerApps);
  const [views, setViews] = useState(false);
  const [picking, setPicking] = useState(false);
  const [quick, setQuick] = useState(false);
  /** The words quick add opens with: none from the button, another app's selection from outside. */
  const [quickWords, setQuickWords] = useState('');

  // A link into a day or a view (`unlease-agenda://day/…`, a widget's day) moves the calendar there.
  const asked = route.params?.day;
  const askedView = route.params?.view;
  useEffect(() => {
    if (asked) showDay(asked);
    if (askedView) showView(askedView);
    // Spent once followed, so the same day asked again later (« open the calendar at ») moves the calendar again.
    if (asked || askedView) navigation.setParams({ day: undefined, view: undefined });
  }, [asked, askedView, navigation]);

  // Words selected in another app (« Créer un événement »): quick add, with them in it.
  const handedWords = route.params?.words;
  useEffect(() => {
    if (handedWords === undefined) return;
    setQuickWords(handedWords);
    setQuick(true);
    navigation.setParams({ words: undefined });
  }, [handedWords, navigation]);

  // The launcher's shortcut « Ajouter en quelques mots » arrives as a `capture` param: quick add opens, once.
  const capture = route.params?.capture;
  useEffect(() => {
    if (capture !== 'quick') return;
    navigation.setParams({ capture: undefined });
    setQuick(true);
  }, [capture, navigation]);

  // Back leaves a label's events for the whole calendar before it leaves the app.
  useFocusEffect(
    useCallback(() => {
      if (!label) return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        navigation.setParams({ label: undefined });
        return true;
      });
      return () => subscription.remove();
    }, [label, navigation]),
  );

  const open = useCallback((item: AgendaItem | DayItem, on: string) => openItem({ event: params => navigation.navigate('Event', params), birthday: params => navigation.navigate('Birthday', params) }, item, on), [navigation]);
  const goDay = useCallback((chosen: string) => showView('day', chosen), []);
  const create = useCallback(
    (start?: string) => {
      const next = new Date(now);
      const at = start ?? `${day}T${String(Math.min(23, next.getHours() + 1)).padStart(2, '0')}:00`;
      navigation.navigate('Edit', { start: at, end: isDay(at) ? undefined : addMinutes(at, prefs.eventLength) });
    },
    [navigation, now, day, prefs.eventLength],
  );

  // « Note du jour »: the day's page in Pages' « Journal », found or made by Pages' module.
  const openDaily = async (on: string = day): Promise<void> => {
    if (!server) return;
    try {
      const pageId = await dailyPage(server, { day: on, lang: getLocale() });
      later(openInApp('pages', pagePlace(pageId)));
    } catch (error) {
      showSnack(error instanceof SyncError && error.status === 404 ? t('Pages n’est pas activé sur ce serveur.') : error instanceof Error && error.message ? t(error.message) : t('Serveur injoignable'), undefined, { tone: 'error' });
    }
  };

  // A swipe across turns the period (`PeriodPager`), from the day the calendar is on now: two swipes in a row turn two periods.
  const step = useCallback((direction: 1 | -1): void => {
    const state = useCalendarUiStore.getState();
    showDay(stepDay(selectView(state), selectDay(state), direction));
  }, []);
  // The period a swipe let go goes to: its title shows as its page sets off, not once it has landed.
  const [heading, setHeading] = useState<{ readonly from: string; readonly to: string } | null>(null);
  const turning = useCallback((direction: 1 | -1): void => {
    const state = useCalendarUiStore.getState();
    setHeading({ from: selectDay(state), to: stepDay(selectView(state), selectDay(state), direction) });
  }, []);
  const titleDay = heading && heading.from === day ? heading.to : day;
  // Once the calendar is on another day, the swipe's title is spent (a later jump back to its day must not wear it).
  useEffect(() => setHeading(null), [day]);

  const goPlace = (place: DrawerPlace): void => {
    if (place.startsWith('view:')) {
      navigation.setParams({ label: undefined });
      showView(place.slice('view:'.length) as CalendarView);
    } else if (place.startsWith('label:')) {
      navigation.setParams({ label: place.slice('label:'.length) });
      showView('schedule');
    } else if (place === 'labels') navigation.navigate('Labels');
    else if (place === 'feeds') navigation.navigate('Feeds');
    else if (place === 'ask') navigation.navigate('Ask');
    else if (place === 'trash') navigation.navigate('Trash');
    else if (place === 'settings') navigation.navigate('Settings');
    else if (place === 'admin') navigation.navigate('Admin');
  };

  const shownView: CalendarView = label ? 'schedule' : view;
  // « Aujourd'hui » is today's, whatever day the calendar was on: nothing to turn, nothing to go back to.
  const isToday = shownView === 'today';
  const title = labelInfo ? labelInfo.name : viewTitle(shownView, isToday ? today : titleDay, prefs.weekStart, prefs.hideWeekends);
  const createToday = useCallback(() => create(`${today}T${String(Math.min(23, new Date(now).getHours() + 1)).padStart(2, '0')}:00`), [create, today, now]);
  // The same days while the period stays (a minute passing re-renders the screen): the grid keeps its scroll and its layout.
  const gridDays = useMemo(() => viewDays(shownView, day, prefs.weekStart, prefs.hideWeekends), [shownView, day, prefs.weekStart, prefs.hideWeekends]);
  /** What is on screen, by its first day: a change of it comes in from its side. */
  const period = shownView === 'month' ? day.slice(0, 7) : shownView === 'year' ? day.slice(0, 4) : shownView === 'schedule' ? (label ? today : day) : (gridDays[0] ?? day);
  // The periods beside it, drawn so a swipe shows them coming in.
  const swipes = shownView !== 'schedule';
  const anchors = useMemo((): [string, string, string] => (swipes ? [stepDay(shownView, day, -1), day, stepDay(shownView, day, 1)] : [day, day, day]), [swipes, shownView, day]);
  const renderPeriod = useCallback(
    (anchor: string) => <PeriodBody view={shownView} anchor={anchor} today={today} label={label} prefs={prefs} onOpen={open} onDay={goDay} onCreate={create} />,
    [shownView, today, label, prefs, open, goDay, create],
  );

  return (
    <View style={styles.screen}>
      <Ground />
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.row}>
          <IconButton icon="menu" label={t('Menu')} onPress={() => setDrawerOpen(true)} />
          <Tappable onPress={() => setPicking(true)} style={styles.title} accessibilityRole="button" accessibilityLabel={t('Choisir un jour : {period}', { period: title })}>
            {labelInfo ? <LabelTag color={labelInfo.color} size={18} /> : null}
            <Animated.View key={title} entering={TITLE_IN} style={styles.titleText}>
              <AppText variant="title" numberOfLines={1}>
                {title}
              </AppText>
            </Animated.View>
          </Tappable>
          {isToday ? null : <IconButton icon="calendar" label={t('Aujourd’hui')} onPress={() => showDay(today)} />}
          <IconButton icon="grid" label={t('Changer de vue')} onPress={() => setViews(true)} />
          <IconButton icon="search" label={t('Rechercher')} onPress={() => navigation.navigate('Search')} />
        </View>
        <SyncLine />
      </View>
      {isToday ? (
        <TodayView
          today={today}
          now={now}
          twelveHours={prefs.twelveHours}
          homePlace={prefs.homePlace}
          journal={!!server && (!apps || apps.includes('pages'))}
          onOpen={open}
          onOpenNote={noteId => later(openInApp('notes', notesPlace('note', noteId)))}
          onJournal={pageId => (pageId ? later(openInApp('pages', pagePlace(pageId))) : later(openDaily(today)))}
          onCreate={createToday}
          onDay={goDay}
        />
      ) : (
        <PeriodPager view={shownView} period={period} anchors={anchors} swipes={swipes} onStep={step} onTurning={turning} renderPeriod={renderPeriod} />
      )}
      <FabMenu
        label={t('Créer')}
        actions={[
          { icon: 'calendar', label: t('Événement'), onPress: () => (isToday ? createToday() : create()) },
          { icon: 'sparkle', label: t('Ajouter en quelques mots'), onPress: () => setQuick(true) },
          ...(server ? [{ icon: 'pagePlus' as const, label: t('Note du jour'), onPress: () => later(openDaily(isToday ? today : day)) }] : []),
        ]}
      />
      <Menu
        visible={views}
        onDismiss={() => setViews(false)}
        // Under the bar's buttons: `Menu` counts the status bar itself.
        // The calendar's six: « Aujourd'hui » is the drawer's place over them, so none is ticked there.
        items={PERIOD_VIEWS.map(each => ({ label: VIEW_NAMES[each], icon: each === shownView ? 'check' : VIEW_GLYPHS[each], onPress: () => (navigation.setParams({ label: undefined }), showView(each)) }))}
      />
      <DayPickerSheet visible={picking} title={t('Aller au jour')} day={day} today={today} weekStart={prefs.weekStart} onDismiss={() => setPicking(false)} onDay={isToday ? goDay : showDay} />
      <QuickAddSheet
        visible={quick}
        words={quickWords}
        today={day < today ? today : day}
        onDismiss={() => {
          setQuick(false);
          setQuickWords('');
        }}
        onCreated={id => showSnack(t('Événement enregistré'), { label: tc('event', 'Ouvrir'), run: () => navigation.navigate('Event', { id }) }, { tone: 'success' })}
        onDetails={draft => navigation.navigate('Edit', { title: draft.title, start: draft.start, end: draft.end, place: draft.place, ...('timeZone' in draft && draft.timeZone ? { tz: draft.timeZone } : {}), ...('url' in draft && draft.url ? { url: draft.url } : {}), ...('description' in draft && draft.description ? { description: draft.description } : {}) })}
      />
      <Drawer open={drawerOpen} view={shownView} label={label} onClose={() => setDrawerOpen(false)} onPlace={goPlace} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    header: {},
    row: { height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
    title: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 8 },
    titleText: { flexShrink: 1 },
  });
