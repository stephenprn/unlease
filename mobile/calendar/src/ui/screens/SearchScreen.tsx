/**
 * The search: one's events and the calendars shown, by their title, place, description and labels; a
 * series is one result, opened at its next occurrence. Above them, the settings the words name.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { APP_WORDS } from '@unlease/core/appWords';
import { t } from '@unlease/core/i18n';
import { searchSummary } from '@unlease/core/services/searchWords';
import { searchEvents } from '@unlease/calendar/services/search';
import { upcoming } from '@unlease/calendar/services/occurrences';
import { weekdayDay } from '@unlease/calendar/services/eventText';
import { CALENDAR_SETTINGS_PLACES } from '@unlease/calendar/services/settingsPlaces';
import { nameOf } from '@app/mentionNames';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, EdgeFlatList, EmptyLine, EmptyState, Ground, ListRow, SearchHeader } from '@shared/ui/components';
import { settingsFound, SettingsMatches, settingsScreenOf, type PhoneSettingsPlace } from '@shared/ui/features/settings/SettingsMatches';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import type { ScreenProps } from '../navigation/types';

export function SearchScreen({ navigation }: ScreenProps<'Search'>) {
  // A setting a search found: its screen, with its section where that screen takes one (the import's and the erase's take none).
  const openSettingsPlace = (place: PhoneSettingsPlace): void => {
    const screen = settingsScreenOf(place);
    if (screen === 'Import' || screen === 'Erase') navigation.navigate(screen);
    else navigation.navigate(screen, place.section ? { section: place.section } : undefined);
  };
  const styles = useThemedStyles(makeStyles);
  const events = useLibraryStore(s => s.events);
  const feeds = useLibraryStore(s => s.feeds);
  const [query, setQuery] = useState('');
  const found = useMemo(() => {
    const state = useLibraryStore.getState();
    return searchEvents(Object.values(events), feeds, query, target => nameOf(state, target) ?? '').slice(0, 100);
  }, [events, feeds, query]);
  const now = Date.now();
  const summary = searchSummary(query, found.length, settingsFound(query, CALENDAR_SETTINGS_PLACES));
  return (
    <View style={styles.screen}>
      <Ground />
      {/* The homes' strip, Back at its start: the same field, placeholder and count in every app. */}
      <SearchHeader query={query} onQuery={setQuery} onBack={() => navigation.goBack()} placeholder={APP_WORDS.calendar.search} focusKey={1} />
      <EdgeFlatList
        data={found}
        keyboardShouldPersistTaps="handled"
        // Scrolling with the events: the settings the words name, then the count.
        ListHeaderComponent={
          query.trim() ? (
            <View>
              <SettingsMatches
                query={query}
                own={CALENDAR_SETTINGS_PLACES}
                onOpen={place => openSettingsPlace(place)}
              />
              {found.length > 0 ? (
                <View style={styles.search}>
                  <AppText variant="meta">{summary}</AppText>
                </View>
              ) : null}
            </View>
          ) : undefined
        }
        // As in every app, nothing found is the search's empty state: the count, and what it looks through.
        // Before a word, what it looks through (the other apps show the list it looks in).
        ListEmptyComponent={
          query.trim() ? <EmptyState scene="search" title={summary} text={APP_WORDS.calendar.searchHint} /> : <EmptyLine glyph="search" text={APP_WORDS.calendar.searchHint} style={styles.search} />
        }
        keyExtractor={event => event.id}
        renderItem={({ item }) => {
          // A series opens at its next occurrence, else at its first.
          const next = item.rrule ? upcoming([item], now, 400, 1)[0] : undefined;
          const day = next?.firstDay ?? item.start.slice(0, 10);
          return (
            <ListRow
              title={item.title.trim() || t('Sans titre')}
              supporting={[weekdayDay(day), item.place.trim()].filter(Boolean).join(' · ')}
              icon={item.rrule ? 'refresh' : 'calendar'}
              onPress={() => navigation.navigate('Event', { id: item.id, at: next?.occurrence })}
            />
          );
        }}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    search: { gap: 4, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  });
