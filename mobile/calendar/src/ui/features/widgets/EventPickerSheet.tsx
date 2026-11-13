/**
 * The event a countdown counts to: what is coming, one row per event at its next occurrence (its
 * colour, its title, when and how far away), or what a search finds, past events too. Shown in the
 * quick window over the home screen.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { selectPrefs, useCalendarUiStore } from '@app/store/calendarUi';
import { useLibraryStore } from '@app/store/libraryStore';
import { countdownChoices, type CountdownChoice } from '@app/widgetPayloads';

import { EmptyLine, Icon, ListRow, Sheet, SHEET_INSET, SheetFlatList, TextField } from '@shared/ui/components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';
import { paintOf } from '../calendar/paint';

export interface EventPickerSheetProps {
  readonly visible: boolean;
  readonly title: string;
  /** The event counted to now, ticked; null while the widget is placed. */
  readonly current: string | null;
  readonly onDismiss: () => void;
  readonly onPick: (eventId: string) => void;
}

export function EventPickerSheet({ visible, title, current, onDismiss, onPick }: EventPickerSheetProps) {
  const events = useLibraryStore(s => s.events);
  const feeds = useLibraryStore(s => s.feeds);
  const labels = useLibraryStore(s => s.calendarLabels);
  const prefs = useCalendarUiStore(selectPrefs);
  const [query, setQuery] = useState('');
  // The events, calendars and labels stand for the library: the rows are read again when they change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const choices = useMemo(() => countdownChoices(useLibraryStore.getState(), prefs, query, Date.now()), [events, feeds, labels, prefs, query]);
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title} tall>
      <View style={styles.search}>
        <TextField value={query} onChangeText={setQuery} placeholder={t('Search events')} accessibilityLabel={t('Search events')} returnKeyType="search" autoCorrect={false} />
      </View>
      <SheetFlatList top={false}
        data={choices}
        style={styles.list}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyExtractor={item => item.eventId}
        renderItem={({ item }) => <EventChoiceRow choice={item} current={item.eventId === current} onPick={onPick} />}
        ListEmptyComponent={<EmptyLine text={query.trim() ? t('No event matches') : t('No upcoming events: a search finds past ones too.')} style={styles.none} />}
      />
    </Sheet>
  );
}

function EventChoiceRow({ choice, current, onPick }: { choice: CountdownChoice; current: boolean; onPick: (eventId: string) => void }) {
  const theme = useTheme();
  const paint = paintOf(theme, choice.color);
  return (
    <ListRow
      title={choice.title}
      supporting={`${choice.when} · ${choice.distance}`}
      // Its colour as the views paint it: a stripe, in the glyphs' column.
      leading={<View style={[styles.stripe, { backgroundColor: paint.fill }]} />}
      trailing={current ? <Icon name="check" size={22} color={theme.color.focus} /> : undefined}
      accessibilityState={{ selected: current }}
      onPress={() => onPick(choice.eventId)}
    />
  );
}

const styles = StyleSheet.create({
  // The field on the sheet's column, under its title, as Carnet's note picker's; nothing found where its help would be (4 in from it).
  search: { paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
  list: { flexShrink: 1 },
  body: { paddingBottom: 12 },
  none: { paddingHorizontal: SHEET_INSET, paddingVertical: 12 },
  stripe: { width: 6, alignSelf: 'stretch', borderRadius: 3, marginHorizontal: 9 },
});
