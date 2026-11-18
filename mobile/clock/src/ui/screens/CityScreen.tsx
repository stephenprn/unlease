/**
 * « Ajouter une ville »: a search over the world's large cities and capitals (`searchCities`: French
 * or English, accents and case aside; a country or a zone finds its cities too), each row its name
 * over its country, its time now and how far ahead it is; a city already kept is ticked. A row picked
 * adds its clock and goes back, the slip saying so. Typed nothing, every city by name.
 */
import React, { useMemo, useState } from 'react';
import { Keyboard, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@unlease/core/i18n';
import { matchRanges } from '@unlease/core/services/search';
import type { City } from '@unlease/clock/data/cities';
import { cityName, clockIn, countryName, hasCity, liveWorldClocks, offsetWords, offsetFromHere, searchCities } from '@unlease/clock/services/worldClocks';
import { useTick } from '@app/hooks/useTick';
import { addCity } from '@app/store/actions';
import { selectPrefs, useClockUiStore } from '@app/store/clockUi';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@shared/app/store/uiStore';
import { EdgeFlatList, EmptyLine, Ground, Icon, IconButton, ListRow, Organic, SEARCH_HEIGHT, SEARCH_TOP } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { variantStyle } from '@shared/ui/theme/typography';
import type { ScreenProps } from '../navigation/types';

export function CityScreen({ navigation }: ScreenProps<'City'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const prefs = useClockUiStore(selectPrefs);
  const clocks = useLibraryStore(state => state.worldClocks);
  const now = useTick(60_000, true);
  const [query, setQuery] = useState('');
  const found = useMemo(() => searchCities(query, 400), [query]);
  const kept = useMemo(() => liveWorldClocks(clocks, now), [clocks, now]);

  const pick = (city: City): void => {
    const already = hasCity(kept, city);
    // The keyboard goes with the search: the clocks it leads back to need the whole screen.
    Keyboard.dismiss();
    addCity(city);
    if (!already) showSnack(t('{city} added', { city: cityName(city) }), undefined, { tone: 'success' });
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.reset({ index: 0, routes: [{ name: 'Alarms', params: { tab: 'world' } }] });
  };

  return (
    <View style={styles.screen}>
      <Ground />
      <View style={[styles.head, { paddingTop: insets.top + SEARCH_TOP }]}>
        <Organic frost style={styles.search}>
          <IconButton icon="back" label={t('Back')} onPress={() => navigation.goBack()} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={t('Search for a city or a country')}
            placeholderTextColor={theme.color.inkFaint}
            selectionColor={theme.color.highlight}
            cursorColor={theme.color.focus}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={t('Search for a city')}
            style={[variantStyle(theme, 'body'), styles.input]}
          />
          {query ? <IconButton icon="close" label={t('Clear')} onPress={() => setQuery('')} /> : null}
        </Organic>
      </View>
      <EdgeFlatList
        data={found}
        keyExtractor={city => city.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 16 }]}
        renderItem={({ item }) => {
          const name = cityName(item);
          const there = hasCity(kept, item);
          return (
            <ListRow
              title={name}
              highlight={query ? matchRanges(name, query) : undefined}
              supporting={[countryName(item.country), clockIn(item.zone, now, prefs.twelveHours), offsetWords(offsetFromHere(item.zone, now))].filter(Boolean).join(' · ')}
              icon="globe"
              onPress={() => pick(item)}
              trailing={there ? <Icon name="check" size={22} color={theme.color.focus} /> : undefined}
              accessibilityState={{ selected: there }}
            />
          );
        }}
        ListEmptyComponent={<EmptyLine text={t('No city by that name. Try its country, or a large city nearby in the same time zone.')} style={styles.empty} />}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    head: { paddingHorizontal: 12, paddingBottom: 8 },
    search: { height: SEARCH_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
    input: { flex: 1, color: theme.color.ink, paddingVertical: 0, height: SEARCH_HEIGHT - 2 },
    list: { paddingHorizontal: 4 },
    empty: { marginHorizontal: 24, marginTop: 24 },
  });
