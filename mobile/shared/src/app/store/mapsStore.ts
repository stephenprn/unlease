/**
 * Where this app opens places (Réglages' « Ouvrir les adresses dans », or « Toujours utiliser ce
 * choix » in the chooser): one of the phone's maps apps, OpenStreetMap in the browser, or nothing
 * chosen, when the chooser asks each time. A device setting of each app, as its others are; and the
 * place the chooser is asking about while it is open (`openPlace`), and Réglages' sheet of choices.
 */
import { create } from 'zustand';

import { t } from '@unlease/core/i18n';
import { MAP_APP_NAMES } from '@unlease/core/services/maps';
import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';

export type MapsChoice = { readonly kind: 'app'; readonly packageName: string; readonly label: string } | { readonly kind: 'web'; readonly app: 'openstreetmap' };

/** A place the chooser asks about: where it goes, whether it is the way there, and its title. */
export interface PlaceQuestion {
  readonly place: string;
  readonly directions: boolean;
  /** The sheet's title (« Itinéraire jusqu’à Léa »); null: its usual one. */
  readonly title: string | null;
  /** The app chosen before, which no longer opens places: the sheet says so. */
  readonly gone: string | null;
}

interface MapsState {
  readonly loaded: boolean;
  readonly choice: MapsChoice | null;
  readonly asking: PlaceQuestion | null;
  /** Réglages' choice sheet is open. */
  readonly choosing: boolean;
}

const KEY = 'mapsChoice';

export const useMapsStore = create<MapsState>(() => ({ loaded: false, choice: null, asking: null, choosing: false }));

/** A stored choice, or null when there is none or it is unreadable. */
export function parseMapsChoice(value: unknown): MapsChoice | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind === 'web') return { kind: 'web', app: 'openstreetmap' };
  if (raw.kind === 'app' && typeof raw.packageName === 'string' && raw.packageName && typeof raw.label === 'string') return { kind: 'app', packageName: raw.packageName, label: raw.label };
  return null;
}

/** Read once (at start, or when first needed). */
export function loadMapsChoice(): void {
  useMapsStore.setState({ loaded: true, choice: parseMapsChoice(readPreferences()[KEY]) });
}

/** The choice now, read from storage the first time. */
export function mapsChoice(): MapsChoice | null {
  if (!useMapsStore.getState().loaded) loadMapsChoice();
  return useMapsStore.getState().choice;
}

export function setMapsChoice(choice: MapsChoice | null): void {
  writePreference(KEY, choice);
  useMapsStore.setState({ loaded: true, choice });
}

export const selectMapsChoice = (s: MapsState): MapsChoice | null => s.choice;
export const selectPlaceQuestion = (s: MapsState): PlaceQuestion | null => s.asking;

/** The chooser opens on this place. */
export const askPlace = (question: PlaceQuestion): void => useMapsStore.setState({ asking: question });
export const closePlaceQuestion = (): void => useMapsStore.setState({ asking: null });

export const selectChoosingMaps = (s: MapsState): boolean => s.choosing;
/** Réglages' « Ouvrir les adresses dans » opens, or closes, its sheet (mounted with the chooser). */
export const setChoosingMaps = (choosing: boolean): void => useMapsStore.setState({ choosing });

/** The choice for a screen (read at start, `loadMapsChoice`). */
export const useMapsChoice = (): MapsChoice | null => useMapsStore(selectMapsChoice);

/** The choice by name: the app's, OpenStreetMap, or « Demander à chaque fois ». */
export function mapsChoiceName(choice: MapsChoice | null): string {
  if (!choice) return t('Ask every time');
  return choice.kind === 'web' ? MAP_APP_NAMES.openstreetmap : choice.label;
}
