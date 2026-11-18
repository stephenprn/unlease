/**
 * Clock's home: the week of mornings. Seven days from today across the top, each saying what wakes
 * the person (`WeekStrip`); the chosen morning opened below (`MorningPanel`: the time, how long until
 * then, the day's first event from Agenda, a clash and its fix); then the alarms by time of day, one
 * card each with its switch (`AlarmCard`); the capture pebble sets a new one. It opens on the next
 * alarm's morning; a swipe across the panel moves along the week. Before anything, an alarm ringing
 * or something that would keep one from ringing says so (`HomeStatus`).
 *
 * Its head is the suite's search strip (`SearchHeader`: the drawer, « Rechercher dans vos alarmes »,
 * the sync dot). Words typed narrow the alarms by label or time (`alarmAnswers`, as the web's home):
 * the week steps aside, the settings the words name come first (`SettingsMatches`), then the count
 * and the cards with their matches marked, or the search's empty place; Back ends the search.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_WORDS } from '@unlease/core/appWords';
import { t } from '@unlease/core/i18n';
import { searchSummary } from '@unlease/core/services/searchWords';
import type { Occurrence } from '@unlease/calendar/services/occurrences';
import { instantToDay } from '@unlease/calendar/services/time';
import { eventAlarmDraft } from '@unlease/clock/services/eventAlarm';
import { byTime } from '@unlease/clock/services/schedule';
import { CLOCK_SETTINGS_PLACES } from '@unlease/clock/services/settingsPlaces';
import { alarmAnswers } from '@unlease/clock/services/spotlight';
import { chosenMorning, weekOfMornings } from '@unlease/clock/services/week';
import { selectPrefs, useClockUiStore } from '@app/store/clockUi';
import { useRingingAlarms } from '@app/hooks/useRingingAlarms';
import { useLibraryStore } from '@app/store/libraryStore';
import { useMinute } from '@shared/app/hooks/useMinute';
import { selectDrawerOpen, setDrawerOpen, useUiStore } from '@shared/app/store/uiStore';
import { AppText, EdgeScrollView, EmptyState, FAB_CLEARANCE, FabMenu, Ground, SearchHeader, SyncLine } from '@shared/ui/components';
import { settingsFound, SettingsMatches, settingsScreenOf, type PhoneSettingsPlace } from '@shared/ui/features/settings/SettingsMatches';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

import { AlarmCard } from '../features/home/AlarmCard';
import { HomeStatus } from '../features/home/HomeStatus';
import { MorningPanel } from '../features/home/MorningPanel';
import { WeekStrip } from '../features/home/WeekStrip';
import { Drawer, type DrawerPlace } from '../navigation/Drawer';
import type { ScreenProps } from '../navigation/types';

export function AlarmsScreen({ navigation }: ScreenProps<'Alarms'>) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;
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
  // A setting a search found: its screen, at its section (Clock imports nothing: no import's screen).
  const openSettingsPlace = (place: PhoneSettingsPlace): void => {
    const screen = settingsScreenOf(place);
    if (screen === 'Erase') navigation.navigate('Erase');
    else if (screen !== 'Import') navigation.navigate(screen, place.section ? { section: place.section } : undefined);
  };
  // Back ends a search before it leaves the app.
  useFocusEffect(
    useCallback(() => {
      if (!searching) return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        setQuery('');
        return true;
      });
      return () => subscription.remove();
    }, [searching]),
  );
  const found = useMemo(() => (searching ? live.filter(alarm => alarmAnswers(alarm, query)) : live), [live, query, searching]);
  const settingsCount = searching ? settingsFound(query, CLOCK_SETTINGS_PLACES) : 0;
  const cards = (
    <View style={styles.list}>
      {found.map(alarm => (
        <AlarmCard key={alarm.id} alarm={alarm} now={now} twelveHours={prefs.twelveHours} weekStart={prefs.weekStart} query={searching ? query : ''} onOpen={open} />
      ))}
    </View>
  );

  return (
    <View style={styles.screen}>
      <Ground />
      <SearchHeader
        query={query}
        onQuery={setQuery}
        onMenu={() => setDrawerOpen(true)}
        placeholder={APP_WORDS.clock.search}
        onServer={() => navigation.navigate('Admin', { section: 'server' })}
        localText={t('No server: your alarms stay on this phone.')}
      />
      <EdgeScrollView contentContainerStyle={[styles.content, { paddingBottom: FAB_CLEARANCE + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <SyncLine />
        <HomeStatus twelveHours={prefs.twelveHours} onFix={() => navigation.navigate('Settings')} />
        {searching ? (
          <>
            {/* The settings the words name, then the alarms they find, or what the search looks through. */}
            <SettingsMatches query={query} own={CLOCK_SETTINGS_PLACES} style={styles.settings} onOpen={openSettingsPlace} />
            {found.length > 0 ? (
              <>
                <AppText variant="meta" style={styles.summary} accessibilityLiveRegion="polite">
                  {searchSummary(query, found.length, settingsCount)}
                </AppText>
                {cards}
              </>
            ) : (
              <EmptyState scene="search" title={searchSummary(query, 0, settingsCount)} text={APP_WORDS.clock.searchHint} style={styles.empty} />
            )}
          </>
        ) : (
          <>
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
                {cards}
              </>
            )}
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
    content: { paddingTop: 4 },
    gap: { height: 12 },
    section: { marginTop: 24, marginBottom: 8, marginHorizontal: 28 },
    list: { paddingHorizontal: 12, gap: 8 },
    empty: { marginTop: 24 },
    // What a search found: the count on the section heads' column, the settings on the cards' rows.
    summary: { marginHorizontal: 28, marginTop: 12, marginBottom: 8 },
    settings: { paddingHorizontal: 12 },
  });
