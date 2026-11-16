/**
 * Clock's home: the week of mornings. Seven days from today across the top, each saying what wakes
 * the person (`WeekStrip`); the chosen morning opened below (`MorningPanel`: the time, how long until
 * then, the day's first event from Agenda, a clash and its fix); then the alarms by time of day, one
 * card each with its switch (`AlarmCard`); the capture pebble sets a new one. It opens on the next
 * alarm's morning; a swipe across the panel moves along the week. Before anything, an alarm ringing
 * or something that would keep one from ringing says so (`HomeStatus`).
 */
import React, { useCallback, useMemo, useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@unlease/core/i18n';
import type { Occurrence } from '@unlease/calendar/services/occurrences';
import { instantToDay } from '@unlease/calendar/services/time';
import { APP_NAME } from '@unlease/clock/brand';
import { eventAlarmDraft } from '@unlease/clock/services/eventAlarm';
import { byTime } from '@unlease/clock/services/schedule';
import { chosenMorning, weekOfMornings } from '@unlease/clock/services/week';
import { selectPrefs, useClockUiStore } from '@app/store/clockUi';
import { useRingingAlarms } from '@app/hooks/useRingingAlarms';
import { useLibraryStore } from '@app/store/libraryStore';
import { useMinute } from '@shared/app/hooks/useMinute';
import { selectDrawerOpen, setDrawerOpen, useUiStore } from '@shared/app/store/uiStore';
import { AppText, EdgeScrollView, EmptyState, FAB_CLEARANCE, FabMenu, Ground, IconButton } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

import { AlarmCard } from '../features/home/AlarmCard';
import { HomeStatus } from '../features/home/HomeStatus';
import { MorningPanel } from '../features/home/MorningPanel';
import { WeekStrip } from '../features/home/WeekStrip';
import { Drawer, type DrawerPlace } from '../navigation/Drawer';
import type { ScreenProps } from '../navigation/types';

export function AlarmsScreen({ navigation }: ScreenProps<'Alarms'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const now = useMinute();
  const prefs = useClockUiStore(selectPrefs);
  // As they ring: an alarm for an event at its time, holidays and days off kept quiet.
  const alarms = useRingingAlarms();
  const events = useLibraryStore(state => state.events);
  const feeds = useLibraryStore(state => state.feeds);
  const drawerOpen = useUiStore(selectDrawerOpen);

  const live = useMemo(() => Object.values(alarms).filter(alarm => alarm.deletedAt === null).sort(byTime), [alarms]);
  const week = useMemo(() => weekOfMornings({ alarms: live, agenda: { events: Object.values(events), feeds: Object.values(feeds) }, now, margin: prefs.marginMinutes }), [live, events, feeds, now, prefs.marginMinutes]);
  const opening = useMemo(() => chosenMorning(week, live, now), [week, live, now]);
  const [picked, setPicked] = useState<{ readonly day: string; readonly from: -1 | 0 | 1 } | null>(null);
  // A morning picked stays while it is in the week; else the next alarm's. It slides in from its side.
  const chosen = picked && week.some(morning => morning.day === picked.day) ? picked.day : opening;
  const from = picked && picked.day === chosen ? picked.from : 0;
  const choose = useCallback((day: string): void => setPicked({ day, from: day > chosen ? 1 : day < chosen ? -1 : 0 }), [chosen]);
  const index = Math.max(0, week.findIndex(item => item.day === chosen));
  const morning = week[index]!;
  // A swipe (or TalkBack's « Jour précédent », « Jour suivant ») moves along the week, never past its ends.
  const step = useCallback(
    (direction: 1 | -1): boolean => {
      const target = week[index + direction];
      if (!target) return false;
      choose(target.day);
      return true;
    },
    [week, index, choose],
  );

  const open = useCallback((id: string) => navigation.navigate('Edit', { id }), [navigation]);
  // « Ajouter une alarme » for a morning's event: the new alarm's editor, filled from it, nothing kept until it is saved.
  const alarmFor = useCallback(
    (occurrence: Occurrence) => {
      const draft = eventAlarmDraft(occurrence, events[occurrence.seriesId] ?? null, prefs);
      if (draft) navigation.navigate('Edit', { handed: draft });
    },
    [events, prefs, navigation],
  );
  const goPlace = (place: Exclude<DrawerPlace, null>): void => {
    if (place === 'settings') navigation.navigate('Settings');
    else if (place === 'admin') navigation.navigate('Admin');
  };

  return (
    <View style={styles.screen}>
      <Ground />
      <View style={[styles.head, { paddingTop: insets.top }]}>
        {/* Its own head, not a TopBar: the bar's icons follow the theme here as they do there. */}
        <StatusBar barStyle={theme.barStyle} />
        <IconButton icon="menu" label={t('Menu')} onPress={() => setDrawerOpen(true)} />
        {/* The app's name: « Alarmes » heads the list below. */}
        <AppText variant="title" accessibilityRole="header" style={styles.title}>
          {APP_NAME}
        </AppText>
      </View>
      <EdgeScrollView contentContainerStyle={[styles.content, { paddingBottom: FAB_CLEARANCE + insets.bottom }]}>
        <HomeStatus twelveHours={prefs.twelveHours} onFix={() => navigation.navigate('Settings')} />
        <WeekStrip week={week} chosen={chosen} today={instantToDay(now)} now={now} twelveHours={prefs.twelveHours} onChoose={choose} />
        <View style={styles.gap} />
        <MorningPanel morning={morning} now={now} from={from} margin={prefs.marginMinutes} twelveHours={prefs.twelveHours} previous={index > 0} next={index < week.length - 1} onStep={step} onOpen={open} onAlarmFor={alarmFor} />
        {live.length === 0 ? (
          <EmptyState scene="reminders" title={t('No alarms')} text={t('The + button below sets one. Each alarm rings on every phone of yours, unless told not to.')} style={styles.empty} />
        ) : (
          <>
            <AppText variant="section" accessibilityRole="header" style={styles.section}>
              {t('Alarms')}
            </AppText>
            <View style={styles.list}>
              {live.map(alarm => (
                <AlarmCard key={alarm.id} alarm={alarm} now={now} twelveHours={prefs.twelveHours} weekStart={prefs.weekStart} onOpen={open} />
              ))}
            </View>
          </>
        )}
      </EdgeScrollView>
      <FabMenu actions={[{ icon: 'plus', label: t('New alarm'), onPress: () => navigation.navigate('Edit') }]} />
      <Drawer open={drawerOpen} current="alarms" onClose={() => setDrawerOpen(false)} onPlace={goPlace} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    head: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, minHeight: 64 },
    title: { flex: 1 },
    content: { paddingTop: 4 },
    gap: { height: 12 },
    section: { marginTop: 24, marginBottom: 8, marginHorizontal: 28 },
    list: { paddingHorizontal: 12, gap: 8 },
    empty: { marginTop: 24 },
  });
