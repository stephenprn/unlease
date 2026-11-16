/**
 * Contacts' home, laid out as the suite's homes are (the search strip, the bottom bar whose pebble
 * makes a contact) with Google Contacts' list: the favourites in a row of faces, the week's
 * birthdays, then everyone on one sheet of paper, each letter a band across it over its first person
 * (the letter small, in the second ink), held at the top while its people go under it and pushed up
 * by the next letter's, its line drawn once something lies under it; the letters down the right edge
 * to jump. What a search finds lies on the same sheet, without the bands. The drawer narrows it to the favourites or a label. Back ends a search, then a
 * narrowed list, then leaves the app.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, FlatList, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn, runOnJS, useAnimatedReaction, useAnimatedScrollHandler, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { APP_WORDS } from '@unlease/core/appWords';
import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { searchSummary } from '@unlease/core/services/searchWords';
import { groupLetter } from '@unlease/contacts/services/names';
import { CONTACTS_SETTINGS_PLACES } from '@unlease/contacts/services/settingsPlaces';
import { useContactIds, type ContactsFilter } from '@app/hooks/useContacts';
import { selectSortOrder, useContactsUiStore } from '@app/store/contactsUi';
import { useLibraryStore } from '@app/store/libraryStore';
import { selectDrawerOpen, setDrawerOpen, useUiStore } from '@shared/app/store/uiStore';

import { AppText, Button, EmptyState, FAB_CLEARANCE, FabMenu, Ground, LabelTag, ScrollEdges, SearchHeader, SyncLine, useArrivals, usePullToSync } from '@shared/ui/components';
import { decelerate, duration, listIn, listMove, standard } from '@shared/ui/theme/motion';
import { useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { settingsFound, SettingsMatches, settingsScreenOf, type PhoneSettingsPlace } from '@shared/ui/features/settings/SettingsMatches';
import { LetterBands, SheetPaper } from '../features/contacts/AddressBook';
import { ContactRow } from '../features/contacts/ContactRow';
import { BirthdayLine, FavoritesStrip } from '../features/contacts/HomeExtras';
import { LetterRail } from '../features/contacts/LetterRail';
import { landing, layOutSheet, letterAt, ROW_HEIGHT, type SheetEntry, type SheetRow } from '../features/contacts/sheetLayout';
import { Drawer, type DrawerPlace } from '../navigation/Drawer';
import type { ScreenProps } from '../navigation/types';

/** The ground between what stands above the list (the favourites, the week's birthdays, a search's count) and its sheet. */
const SHEET_GAP = 12;
/** A narrowed list's title and what the search found settle in as they change. */
const HEAD_IN = FadeIn.duration(duration.medium).easing(decelerate);

export function ContactsScreen({ navigation, route }: ScreenProps<'Contacts'>) {
  // A setting a search found: its screen, with its section where that screen takes one (the import's and the erase's take none).
  const openSettingsPlace = (place: PhoneSettingsPlace): void => {
    const screen = settingsScreenOf(place);
    if (screen === 'Import' || screen === 'Erase') navigation.navigate(screen);
    else navigation.navigate(screen, place.section ? { section: place.section } : undefined);
  };
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;
  const label = route.params?.label ?? null;
  const filter: ContactsFilter = label ? `label:${label}` : route.params?.filter === 'favorites' ? 'favorites' : 'all';
  const labelInfo = useLibraryStore(s => (label ? s.labels[label] : undefined));
  // A label deleted on another device while its list is open: the list says so, the web's way.
  const labelGone = label !== null && (!labelInfo || labelInfo.deletedAt !== null);
  const order = useContactsUiStore(selectSortOrder);
  const ids = useContactIds(filter, query);
  const total = useLibraryStore(s => s.liveContacts.length);
  const drawerOpen = useUiStore(selectDrawerOpen);
  const pullToSync = usePullToSync();
  const list = useRef<FlatList<SheetRow>>(null);
  const headerHeight = useRef(0);
  // Where the list stands, where its sheet starts (under its header) and how tall its frame is, on the UI
  // thread: the paper, the letters' bands and the rail follow the scroll frame by frame.
  const scroll = useSharedValue(0);
  const headerSize = useSharedValue(-1);
  const frame = useSharedValue(0);
  const [frameHeight, setFrameHeight] = useState(0);
  // The letter that has reached the list's top, lit on the rail.
  const [topLetter, setTopLetter] = useState<string | null>(null);
  // The letter picked on the rail stays lit there until the list is moved by hand (at the list's end, its people cannot reach the top).
  const [picked, setPicked] = useState<string | null>(null);

  // The launcher's shortcut « Rechercher » arrives as a `capture` param: the strip takes the keyboard, once.
  const [searchFocus, setSearchFocus] = useState(0);
  const capture = route.params?.capture;
  useEffect(() => {
    if (capture !== 'search') return;
    navigation.setParams({ capture: undefined });
    setSearchFocus(n => n + 1);
  }, [capture, navigation]);

  const narrowed = filter !== 'all';
  // Back ends a search, then the narrowed list, before it leaves the app.
  useFocusEffect(
    useCallback(() => {
      if (!searching && !narrowed) return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (searching) setQuery('');
        else navigation.setParams({ filter: undefined, label: undefined });
        return true;
      });
      return () => subscription.remove();
    }, [searching, narrowed, navigation]),
  );

  // Everyone on one sheet, each filed under their letter (what a search finds, unfiled); every row's place and each letter's span, in numbers.
  const sheet = useMemo(() => {
    const contacts = useLibraryStore.getState().contacts;
    const entries: SheetEntry[] = [];
    for (const id of labelGone ? [] : ids) {
      const contact = contacts[id];
      if (contact) entries.push({ id, letter: searching ? null : groupLetter(contact, order) });
    }
    return layOutSheet(entries);
  }, [ids, order, searching, labelGone]);
  const { rows, offsets, lengths } = sheet;
  const letters = useMemo(() => sheet.letters.map(span => span.letter), [sheet]);
  const tops = useMemo(() => sheet.letters.map(span => span.top), [sheet]);
  const railed = !searching && letters.length >= 2;
  // Which list is shown: when it changes, nothing glides (the paper, the letters), as no row arrives.
  const shown = searching ? `search:${query}` : filter;
  const laidFor = useRef(shown);

  // The letter whose people are under the list's top, for the rail: the one whose band is held there. On the UI thread, with the scroll.
  useAnimatedReaction(
    () => {
      if (headerSize.value < 0) return null;
      const at = letterAt(tops, scroll.value - headerSize.value);
      return at >= 0 ? (letters[at] ?? null) : null;
    },
    (letter, before) => {
      if (letter !== before) runOnJS(setTopLetter)(letter);
    },
    [tops, letters],
  );
  const onScroll = useAnimatedScrollHandler({
    onScroll: event => {
      scroll.value = event.contentOffset.y;
    },
    onBeginDrag: () => {
      runOnJS(setPicked)(null);
    },
  });
  // Someone arriving while the list is shown (made, brought back by « Annuler », synced in) settles in once the others
  // have made room; another list (a label, the favourites, a search typed) is shown whole. One leaving goes, the rest
  // close ranks: a list of hundreds drops rows out of its window as it scrolls, so no row plays an exit.
  const arrived = useArrivals(ids, shown);

  const openContact = useCallback((id: string) => navigation.navigate('Contact', { id }), [navigation]);
  const current: DrawerPlace = filter === 'all' ? 'contacts' : filter;
  const goPlace = (place: Exclude<DrawerPlace, null>): void => {
    setQuery('');
    if (place === 'contacts') navigation.setParams({ filter: undefined, label: undefined });
    else if (place === 'favorites') navigation.setParams({ filter: 'favorites', label: undefined });
    else if (place.startsWith('label:')) navigation.setParams({ filter: undefined, label: place.slice('label:'.length) });
    else if (place === 'birthdays') navigation.navigate('Birthdays');
    else if (place === 'labels') navigation.navigate('Labels');
    else if (place === 'duplicates') navigation.navigate('Duplicates');
    else if (place === 'trash') navigation.navigate('Trash');
    else if (place === 'settings') navigation.navigate('Settings');
    else if (place === 'admin') navigation.navigate('Admin');
  };

  const title = filter === 'favorites' ? t('Favourites') : labelInfo && !labelGone ? labelInfo.name : null;
  const header = (
    <View
      style={rows.length > 0 ? styles.header : null}
      onLayout={(event: LayoutChangeEvent) => {
        const height = event.nativeEvent.layout.height;
        // The rows move with the header as it grows or shrinks in the same list (a favourite starred, the day's birthdays gone): the sheet goes with them.
        const glide = laidFor.current === shown && headerSize.value >= 0 && !reduced;
        laidFor.current = shown;
        headerHeight.current = height;
        headerSize.value = glide ? withTiming(height, { duration: duration.medium, easing: standard }) : height;
      }}
    >
      <SyncLine />
      {title && !searching ? (
        <Animated.View key={title} entering={HEAD_IN} style={styles.titleRow}>
          {labelInfo ? <LabelTag color={labelInfo.color} size={22} /> : null}
          <AppText variant="title" style={styles.title} numberOfLines={1}>
            {title}
          </AppText>
          <AppText variant="meta">{plural(ids.length, 'contact')}</AppText>
        </Animated.View>
      ) : null}
      {filter === 'all' && !searching ? (
        <>
          <FavoritesStrip onOpen={openContact} />
          <BirthdayLine onOpen={() => navigation.navigate('Birthdays')} />
        </>
      ) : null}
      {/* The settings the words name, above the contacts, in the search of everyone (a narrowed list's searches its own); on the faces' column. */}
      {searching && filter === 'all' ? (
        <SettingsMatches
          query={query}
          own={CONTACTS_SETTINGS_PLACES}
          style={styles.settings}
          onOpen={place => openSettingsPlace(place)}
        />
      ) : null}
      {/* Nothing found says it in the empty place under it. */}
      {searching && ids.length > 0 ? (
        <AppText variant="meta" style={styles.notice}>
          {searchSummary(query, ids.length, settingsFound(query, CONTACTS_SETTINGS_PLACES))}
        </AppText>
      ) : null}
    </View>
  );

  // A gone label says so first; then nothing found, as in every app: what the search looks through; then no contacts at all, in every list.
  const empty = labelGone ? (
    <EmptyState scene="label" title={t('This label no longer exists')} text={t('It was deleted, on this device or another.')} />
  ) : searching ? (
    <EmptyState scene="search" title={searchSummary(query, 0, settingsFound(query, CONTACTS_SETTINGS_PLACES))} text={APP_WORDS.contacts.searchHint} />
  ) : total === 0 ? (
    <EmptyState scene="welcome" title={t('No contacts yet')} text={t('The + button below creates one. Your Google contacts, or this phone’s, import in one go.')}>
      <Button label={t('Import contacts')} icon="download" kind="tonal" onPress={() => navigation.navigate('Import')} />
    </EmptyState>
  ) : filter === 'favorites' ? (
    <EmptyState scene="label" title={t('No favourites')} text={t('A contact’s star puts them here, within reach, and in the phone’s quick calls widget.')} />
  ) : (
    <EmptyState scene="label" title={t('No one with this label')} text={t('Open a contact and give them this label.')} />
  );

  return (
    <View style={styles.screen}>
      <Ground />
      <SearchHeader
        query={query}
        onQuery={setQuery}
        onMenu={() => setDrawerOpen(true)}
        placeholder={APP_WORDS.contacts.search}
        focusKey={searchFocus}
        onServer={() => navigation.navigate('Admin', { section: 'server' })}
        localText={t('No server: your contacts stay on this phone.')}
      />
      <View
        style={styles.fill}
        onLayout={(event: LayoutChangeEvent) => {
          frame.value = event.nativeEvent.layout.height;
          setFrameHeight(event.nativeEvent.layout.height);
        }}
      >
        {/* The paper under the rows, the list over it, the letters' bands over the list. */}
        {rows.length > 0 ? <SheetPaper scroll={scroll} origin={headerSize} frame={frame} frameHeight={frameHeight} length={sheet.length} railed={railed} list={shown} /> : null}
        <ScrollEdges>
        <Animated.FlatList
          ref={list}
          data={rows}
          itemLayoutAnimation={searching ? undefined : listMove}
          skipEnteringExitingAnimations
          keyExtractor={item => item.id}
          // Android's default clipping once made Fabric insert a view out of range as a search ended (« addViewAt » crash).
          removeClippedSubviews={false}
          getItemLayout={(_, index) => ({ length: lengths[index] ?? ROW_HEIGHT, offset: headerHeight.current + (offsets[index] ?? 0), index })}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          windowSize={11}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          contentContainerStyle={{ paddingBottom: FAB_CLEARANCE + insets.bottom }}
          scrollEventThrottle={16}
          onScroll={onScroll}
          renderItem={({ item }) => (
            <Animated.View entering={arrived.has(item.id) ? listIn : undefined}>
              <ContactRow id={item.id} order={order} detail={searching} row={item} railed={railed} onOpen={openContact} />
            </Animated.View>
          )}
          refreshControl={pullToSync}
        />
        </ScrollEdges>
        {!searching && sheet.letters.length > 0 ? <LetterBands key={shown} letters={sheet.letters} scroll={scroll} origin={headerSize} frame={frame} length={sheet.length} railed={railed} list={shown} /> : null}
        {railed ? <LetterRail
            letters={letters}
            current={picked ?? topLetter}
            onLetter={index => {
              const span = sheet.letters[index];
              if (!span) return;
              setPicked(span.letter);
              // The letter's people land at the list's top, their first row whole under the search strip's line, the letter pinned beside it.
              list.current?.scrollToOffset({ offset: Math.max(0, headerHeight.current + landing(span)), animated: false });
            }}
          /> : null}
      </View>
      <FabMenu actions={[{ icon: 'plus', label: t('Create contact'), onPress: () => navigation.navigate('Edit', label ? { label } : filter === 'favorites' ? { favorite: true } : undefined) }]} />
      <Drawer
        open={drawerOpen}
        current={current}
        onClose={() => setDrawerOpen(false)}
        onPlace={goPlace}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    fill: { flex: 1 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
    title: { flexShrink: 1 },
    // What a search found; the sheet's gap under it.
    notice: { paddingHorizontal: 20, paddingTop: 12 },
    // The ground between what stands above the list and its sheet.
    header: { paddingBottom: SHEET_GAP },
    // The rows' glyphs and the group's name on the faces' column (20), the rows' 16 and 4 more.
    settings: { paddingHorizontal: 4 },
  });
