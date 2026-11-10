/**
 * Looking for a place, as Google Calendar does it: a whole screen over the form, the search strip at
 * its top holding the caret (Back at its start, a × to clear at its end), the places under it with
 * all the room above the keyboard, so nothing in the form moves while one is typed. What is offered:
 * with nothing typed, the places this device already used; as words come, « Utiliser « … » » to keep
 * them as written (Enter does the same), the places known that answer them (`clock`), then the
 * server's (`mapPin`, `GET /api/places`, after a short pause, three letters at least), each its name
 * over its detail, OpenStreetMap credited under them. A place picked, or the words kept, close it and
 * go back to the form; Back or the arrow leave it as it was.
 *
 * One at a time: a field asks (`openPlaceSearch`) and the screen's `PlaceSearchHost`, mounted at its
 * root over everything else, shows it.
 */
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { Keyframe } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { t } from '@unlease/core/i18n';
import { knownPlaces, PLACE_QUERY_MIN, type Place } from '@unlease/core/sync/places';
import { SHAPES } from '@unlease/design/shapes';

import { findPlaces, placesFound } from '@shared/app/places';
import { selectServer, useSettingsStore } from '@shared/app/store/settingsStore';
import { accelerate, decelerate, duration } from '../theme/motion';
import { corners } from '../theme/shape';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';
import { variantStyle } from '../theme/typography';
import { AppText } from './AppText';
import { Ground } from './Ground';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { ListRow } from './ListRow';
import { Organic } from './Organic';
import { SEARCH_HEIGHT, SEARCH_TOP } from './SearchHeader';
import { useKeyboardTop } from './useKeyboardVisible';

/** What a field asks for. */
export interface PlaceSearchRequest {
  /** What the field holds now: the search starts from it. */
  readonly value: string;
  /** The places this device knows (a contact's address, an event's place used before), offered first. */
  readonly known: readonly Place[];
  /** Read out for the screen (« Lieu », « Rue »). */
  readonly label: string;
  /** A place picked (`place`), or the words kept as written (`place` null; empty clears the field). */
  readonly onDone: (text: string, place: Place | null) => void;
}

const usePlaceSearchStore = create<{ readonly request: PlaceSearchRequest | null }>(() => ({ request: null }));

/** Opens the search for a field (the screen must hold a `PlaceSearchHost`). */
export function openPlaceSearch(request: PlaceSearchRequest): void {
  usePlaceSearchStore.setState({ request });
}

function closePlaceSearch(): void {
  usePlaceSearchStore.setState({ request: null });
}

/** A pause after the last key before the server is asked. */
const PAUSE_MS = 300;

type Search = { readonly typed: string; readonly places: readonly Place[]; readonly failed: boolean };

/** The server's places for what is typed: kept per query, asked after a pause, never under three letters. */
function useFoundPlaces(typed: string): Search & { readonly waiting: boolean; readonly asks: boolean } {
  const server = useSettingsStore(selectServer);
  const [search, setSearch] = useState<Search>({ typed: '', places: [], failed: false });
  const query = typed.replace(/\s+/g, ' ').trim();
  const asks = server !== null && query.length >= PLACE_QUERY_MIN;
  useEffect(() => {
    if (!asks || !server || placesFound(query)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      findPlaces(server, query, controller.signal).then(
        places => setSearch({ typed: query, places, failed: false }),
        () => {
          if (!controller.signal.aborted) setSearch({ typed: query, places: [], failed: true });
        },
      );
    }, PAUSE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [asks, server, query]);
  if (!asks) return { typed: query, places: [], failed: false, waiting: false, asks };
  const found = placesFound(query);
  if (found) return { typed: query, places: found, failed: false, waiting: false, asks };
  return { ...search, waiting: search.typed !== query, asks };
}

/** It rises a little into place over the form, and fades away. */
const IN = new Keyframe({ 0: { opacity: 0, transform: [{ translateY: 24 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }], easing: decelerate } }).duration(duration.medium);
const OUT = new Keyframe({ 0: { opacity: 1 }, 100: { opacity: 0, easing: accelerate } }).duration(duration.short);

function PlaceSearchLayer({ request }: { request: PlaceSearchRequest }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardTop = useKeyboardTop();
  const [text, setText] = useState(request.value);
  const [height, setHeight] = useState(0);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const found = useFoundPlaces(text);
  const typed = text.replace(/\s+/g, ' ').trim();

  const done = (words: string, place: Place | null): void => {
    closePlaceSearch();
    request.onDone(words, place);
  };

  // Back leaves it as it was.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closePlaceSearch();
      return true;
    });
    return () => subscription.remove();
  }, []);

  // A row is what it reads (its name and its detail): two reading the same are one; the words typed are their own row.
  const { mine, theirs } = useMemo(() => {
    const seen = new Set<string>();
    const fresh = (place: Place): boolean => {
      const key = `${place.name}|${place.detail}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    };
    return { mine: knownPlaces(request.known, typed, typed ? 4 : 8).filter(fresh), theirs: found.places.filter(fresh) };
  }, [request.known, typed, found.places]);

  const typedEnough = typed.length >= PLACE_QUERY_MIN;
  const status = !typedEnough
    ? null
    : !found.asks
      ? t('Sans serveur, seuls les lieux déjà utilisés sont proposés.')
      : found.waiting
        ? t('Recherche des lieux…')
        : found.failed
          ? t('La recherche de lieux ne répond pas : le lieu est gardé tel qu’il est écrit.')
          : theirs.length === 0 && mine.length === 0
            ? t('Aucun lieu trouvé : il est gardé tel qu’il est écrit.')
            : null;
  // The rows keep clear of the keyboard: what lies under it scrolls up.
  const under = keyboardTop !== null && height > 0 ? Math.max(0, height - keyboardTop) : 0;

  return (
    <Animated.View entering={IN} exiting={OUT} style={styles.layer} onLayout={event => setHeight(event.nativeEvent.layout.height)} accessibilityViewIsModal>
      <Ground />
      <View style={{ paddingTop: insets.top + SEARCH_TOP }}>
        <Organic style={styles.strip}>
          <IconButton icon="back" label={t('Retour')} onPress={closePlaceSearch} />
          <TextInput
            ref={input}
            value={text}
            onChangeText={setText}
            autoFocus
            placeholder={t('Rechercher un lieu ou une adresse')}
            placeholderTextColor={theme.color.inkFaint}
            selectionColor={theme.color.highlight}
            selectionHandleColor={theme.color.focus}
            cursorColor={theme.color.focus}
            autoCorrect={false}
            autoComplete="off"
            importantForAutofill="no"
            returnKeyType="done"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={() => done(typed, null)}
            accessibilityLabel={request.label}
            style={[variantStyle(theme, 'body'), styles.input]}
          />
          {text ? <IconButton icon="close" label={t('Effacer')} onPress={() => (setText(''), input.current?.focus())} /> : null}
        </Organic>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.list, { paddingBottom: under + insets.bottom + 16 }]}>
        {typed ? (
          <ListRow icon="edit" title={t('Utiliser « {place} »', { place: typed })} onPress={() => done(typed, null)} />
        ) : request.value.trim() ? (
          <ListRow icon="close" title={t('Effacer le lieu')} onPress={() => done('', null)} />
        ) : null}
        {mine.map(place => (
          <ListRow key={`k:${place.name}|${place.detail}`} icon="clock" title={place.name} supporting={place.detail || undefined} onPress={() => done(place.label, place)} />
        ))}
        {theirs.map(place => (
          <ListRow key={`f:${place.name}|${place.detail}`} icon="mapPin" title={place.name} supporting={place.detail || undefined} onPress={() => done(place.label, place)} />
        ))}
        {status ? (
          <View style={styles.status} accessibilityLiveRegion="polite">
            <View style={styles.slot}>
              <Icon name="info" size={18} color={theme.color.inkMuted} />
            </View>
            <AppText variant="meta" style={styles.grow}>
              {status}
            </AppText>
          </View>
        ) : null}
        {theirs.length > 0 ? (
          <AppText variant="labelSmall" color={theme.color.inkMuted} style={styles.credit}>
            {t('Lieux : © les contributeurs d’OpenStreetMap')}
          </AppText>
        ) : null}
      </ScrollView>
    </Animated.View>
  );
}

/** Where a screen shows the place search its fields ask for: at its root, after everything else. */
function PlaceSearchHostComponent() {
  const request = usePlaceSearchStore(s => s.request);
  // Gone with the screen.
  useEffect(() => closePlaceSearch, []);
  return request ? <PlaceSearchLayer request={request} /> : null;
}

export const PlaceSearchHost = memo(PlaceSearchHostComponent);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    layer: { ...StyleSheet.absoluteFill, backgroundColor: theme.color.wall },
    // The search strip, as at the top of every home: the field's veil, the bar's corners, its outline.
    strip: {
      marginHorizontal: 12,
      height: SEARCH_HEIGHT,
      ...corners(SHAPES.search),
      backgroundColor: theme.color.fieldVeil,
      borderWidth: 1,
      borderColor: theme.color.outline,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    input: { flex: 1, color: theme.color.ink, paddingVertical: 0, height: SEARCH_HEIGHT - 2 },
    // On the strip's margin: the rows' glyphs under its Back arrow.
    list: { paddingTop: 8, paddingHorizontal: 12 },
    // On the rows' columns (inset 6, padded 10): its glyph in their glyphs' slot, its words on their text.
    status: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingHorizontal: 16, paddingVertical: 14 },
    slot: { width: 24, alignItems: 'center' },
    grow: { flex: 1 },
    credit: { paddingLeft: 56, paddingRight: 16, paddingTop: 4 },
  });
