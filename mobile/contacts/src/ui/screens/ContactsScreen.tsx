/**
 * Contacts' home, laid out as the suite's homes are (the search strip, the bottom bar whose pebble
 * makes a contact) with Google Contacts' list: the favourites in a row of faces, the week's
 * birthdays, then everyone under their letter (the heading stays at the top while its letter
 * scrolls), and the letters down the edge to jump. The drawer narrows it to the favourites or a
 * label. Back ends a search, then a narrowed list, then leaves the app.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, FlatList, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { APP_WORDS } from '@unlease/core/appWords';
import { t } from '@unlease/core/i18n';
import { GEOMETRY } from '@unlease/design/palette';
import { plural } from '@unlease/core/services/format';
import { searchSummary } from '@unlease/core/services/searchWords';
import { groupLetter } from '@unlease/contacts/services/names';
import { CONTACTS_SETTINGS_PLACES } from '@unlease/contacts/services/settingsPlaces';
import { useContactIds, type ContactsFilter } from '@app/hooks/useContacts';
import { selectSortOrder, useContactsUiStore } from '@app/store/contactsUi';
import { useLibraryStore } from '@app/store/libraryStore';
import { selectDrawerOpen, setDrawerOpen, useUiStore } from '@shared/app/store/uiStore';

import { AppText, Button, EmptyState, FAB_CLEARANCE, FabMenu, Ground, GroundSlice, LabelTag, ScrollEdges, SearchHeader, SyncLine, useArrivals, usePullToSync } from '@shared/ui/components';
import { decelerate, duration, listIn, listMove } from '@shared/ui/theme/motion';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { settingsFound, SettingsMatches, settingsScreenOf } from '@shared/ui/features/settings/SettingsMatches';
import { ContactRow, placeOf, ROW_HEIGHT, rowHeight, type PanelPlace } from '../features/contacts/ContactRow';
import { BirthdayLine, FavoritesStrip } from '../features/contacts/HomeExtras';
import { LetterRail, RAIL_WIDTH } from '../features/contacts/LetterRail';
import { Drawer, type DrawerPlace } from '../navigation/Drawer';
import type { ScreenProps } from '../navigation/types';

/** The letter (26) and the room over it that parts one panel from the next. */
const HEADING_HEIGHT = 52;
/** A narrowed list's title and what the search found settle in as they change. */
const HEAD_IN = FadeIn.duration(duration.medium).easing(decelerate);

type Item = { readonly kind: 'letter'; readonly letter: string } | { readonly kind: 'contact'; readonly id: string; readonly place: PanelPlace };

export function ContactsScreen({ navigation, route }: ScreenProps<'Contacts'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
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
  const list = useRef<FlatList<Item>>(null);
  const headerHeight = useRef(0);
  // The letter pinned at the list's top lies on the ground's slice there; the others on the ground itself.
  const [stuck, setStuck] = useState<string | null>(null);
  const stuckRef = useRef<string | null>(null);
  // The letter picked on the rail stays lit there until the list is moved by hand (at the list's end, its heading cannot reach the top).
  const [picked, setPicked] = useState<string | null>(null);
  const [listTop, setListTop] = useState(0);
  const listBox = useRef<React.ComponentRef<typeof View>>(null);

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

  const { items, sticky, letters, letterIndex, offsets, lengths } = useMemo(() => {
    const contacts = useLibraryStore.getState().contacts;
    const out: Item[] = [];
    const stickyAt: number[] = [];
    const found: string[] = [];
    const at: number[] = [];
    // Each letter's people make a panel (what a search finds, one); each row knows its place in it.
    const groups: { letter: string | null; ids: string[] }[] = [];
    for (const id of labelGone ? [] : ids) {
      const contact = contacts[id];
      if (!contact) continue;
      const letter = searching ? null : groupLetter(contact, order);
      const group = groups[groups.length - 1];
      if (group && group.letter === letter) group.ids.push(id);
      else groups.push({ letter, ids: [id] });
    }
    for (const group of groups) {
      if (group.letter !== null) {
        stickyAt.push(out.length);
        found.push(group.letter);
        at.push(out.length);
        out.push({ kind: 'letter', letter: group.letter });
      }
      group.ids.forEach((id, index) => out.push({ kind: 'contact', id, place: placeOf(index, group.ids.length) }));
    }
    const starts: number[] = [];
    const lengths: number[] = [];
    let offset = 0;
    for (const item of out) {
      const length = item.kind === 'letter' ? HEADING_HEIGHT : rowHeight(item.place);
      starts.push(offset);
      lengths.push(length);
      offset += length;
    }
    return { items: out, sticky: stickyAt, letters: found, letterIndex: at, offsets: starts, lengths };
  }, [ids, order, searching, labelGone]);
  // Someone arriving while the list is shown (made, brought back by « Annuler », synced in) settles in once the others
  // have made room; another list (a label, the favourites, a search typed) is shown whole. One leaving goes, the rest
  // close ranks: a list of hundreds drops rows out of its window as it scrolls, so no row plays an exit.
  const arrived = useArrivals(ids, searching ? `search:${query}` : filter);

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

  const title = filter === 'favorites' ? t('Favoris') : labelInfo && !labelGone ? labelInfo.name : null;
  const header = (
    <View
      onLayout={(event: LayoutChangeEvent) => {
        headerHeight.current = event.nativeEvent.layout.height;
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
          onOpen={place => navigation.navigate(settingsScreenOf(place), place.section ? { section: place.section } : undefined)}
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
    <EmptyState scene="label" title={t('Ce libellé n’existe plus')} text={t('Il a été supprimé, sur cet appareil ou sur un autre.')} />
  ) : searching ? (
    <EmptyState scene="search" title={searchSummary(query, 0, settingsFound(query, CONTACTS_SETTINGS_PLACES))} text={APP_WORDS.contacts.searchHint} />
  ) : total === 0 ? (
    <EmptyState scene="welcome" title={t('Aucun contact pour l’instant')} text={t('Le bouton +, en bas, en crée un. Vos contacts Google ou ceux de ce téléphone s’importent en une fois.')}>
      <Button label={t('Importer des contacts')} icon="download" kind="tonal" onPress={() => navigation.navigate('Import')} />
    </EmptyState>
  ) : filter === 'favorites' ? (
    <EmptyState scene="label" title={t('Aucun favori')} text={t('L’étoile d’un contact le met ici, à portée de main, et dans le widget d’appels rapides du téléphone.')} />
  ) : (
    <EmptyState scene="label" title={t('Personne avec ce libellé')} text={t('Ouvrez un contact et ajoutez-lui ce libellé.')} />
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
        localText={t('Pas de serveur : les contacts restent sur ce téléphone.')}
      />
      <View ref={listBox} style={styles.fill} onLayout={() => listBox.current?.measureInWindow((_x, y) => setListTop(y))}>
        {/* The pinned letter paints the ground over the list's top: rows soften under it, not under the search strip. */}
        <ScrollEdges insetTop={stuck ? HEADING_HEIGHT : 0}>
        <Animated.FlatList
          ref={list}
          data={items}
          itemLayoutAnimation={searching ? undefined : listMove}
          skipEnteringExitingAnimations
          keyExtractor={item => (item.kind === 'letter' ? `letter-${item.letter}` : item.id)}
          stickyHeaderIndices={sticky.map(index => index + 1)}
          // Android's default clipping, with sticky letters coming back after a search, makes Fabric insert a view out of range (« addViewAt » crash).
          removeClippedSubviews={false}
          getItemLayout={(_, index) => ({ length: lengths[index] ?? ROW_HEIGHT, offset: headerHeight.current + (offsets[index] ?? 0), index })}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          windowSize={11}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          contentContainerStyle={{ paddingBottom: FAB_CLEARANCE + insets.bottom }}
          scrollEventThrottle={32}
          onScrollBeginDrag={() => setPicked(null)}
          onScroll={event => {
            const y = event.nativeEvent.contentOffset.y;
            let pinned: string | null = null;
            for (let i = 0; i < letterIndex.length; i += 1) {
              if (headerHeight.current + (offsets[letterIndex[i]!] ?? 0) <= y + 0.5) pinned = letters[i]!;
              else break;
            }
            if (pinned !== stuckRef.current) {
              stuckRef.current = pinned;
              setStuck(pinned);
            }
          }}
          renderItem={({ item }) =>
            item.kind === 'letter' ? (
              <View style={styles.heading} accessibilityRole="header">
                {item.letter === stuck ? <GroundSlice top={listTop} /> : null}
                <AppText variant="title" color={theme.color.action} style={styles.letter}>
                  {item.letter}
                </AppText>
              </View>
            ) : (
              <Animated.View entering={arrived.has(item.id) ? listIn : undefined}>
                <ContactRow id={item.id} order={order} detail={searching} railed={!searching} place={item.place} onOpen={openContact} />
              </Animated.View>
            )
          }
          refreshControl={pullToSync}
        />
        </ScrollEdges>
        {!searching ? <LetterRail
            letters={letters}
            current={picked ?? stuck}
            onLetter={index => {
              setPicked(letters[index] ?? null);
              list.current?.scrollToOffset({ offset: headerHeight.current + (offsets[letterIndex[index] ?? 0] ?? 0), animated: false });
            }}
          /> : null}
      </View>
      <FabMenu actions={[{ icon: 'plus', label: t('Créer un contact'), onPress: () => navigation.navigate('Edit', label ? { label } : filter === 'favorites' ? { favorite: true } : undefined) }]} />
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
    notice: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
    // The rows' glyphs and the group's name on the faces' column (20), the rows' 16 and 4 more.
    settings: { paddingHorizontal: 4 },
    // A letter's heading: the letter, large, in the primary, over the panel its people lie on (Google Contacts' grouped list), with
    // nothing else: the panel's edge parts one letter from the next. It lies on the ground's own wall while it holds the top: what
    // scrolls under it never shows through. The letter on the heads' column above it (20), 8 in from the panel's edge.
    heading: { height: HEADING_HEIGHT, justifyContent: 'flex-end', paddingLeft: 20, paddingRight: RAIL_WIDTH + GEOMETRY.rowGap + 8, paddingBottom: 8 },
    letter: { minWidth: 12 },
  });
