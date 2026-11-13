/**
 * A place opened in maps, from every app that shows one (Contacts' addresses, Agenda's places): in
 * the maps app chosen (Réglages, or « Toujours utiliser ce choix »), at once; else the chooser asks,
 * listing the phone's maps apps itself (Android, handed `geo:`, would go straight to its default one,
 * whatever else is installed), OpenStreetMap in the browser, and the address to copy. A chosen app
 * since uninstalled is forgotten, and the chooser says so. The way there goes to Google Maps' and
 * Waze's own routes; any other app gets the place (`geo:`) and routes from it.
 */
import { Linking } from 'react-native';

import { t } from '@unlease/core/i18n';
import { lineDirectionsUrl, lineGeoUri, lineMapsUrl, lineWazeUrl } from '@unlease/core/services/maps';
import { copyText } from '@shared/platform/clipboard';
import { openInMapApp } from '@shared/platform/mapApps';

import { askPlace, closePlaceQuestion, mapsChoice, mapsChoiceName, setMapsChoice, type MapsChoice, type PlaceQuestion } from './store/mapsStore';
import { showSnack } from './store/uiStore';

export const GOOGLE_MAPS_PACKAGE = 'com.google.android.apps.maps';
export const WAZE_PACKAGE = 'com.waze';

/** The place on one line, its spaces folded. */
const lineOf = (place: string): string => place.replace(/\s+/g, ' ').trim();

/** What a maps app is handed: the place, or the way there in the apps that have their own. */
export function mapAppUri(packageName: string, place: string, directions: boolean): string | null {
  if (directions && packageName === GOOGLE_MAPS_PACKAGE) return lineDirectionsUrl(place, 'google');
  if (directions && packageName === WAZE_PACKAGE) return lineWazeUrl(place);
  return lineGeoUri(place);
}

/** OpenStreetMap's page for the place, or for the way there. */
export const webPlaceUrl = (place: string, directions: boolean): string | null => (directions ? lineDirectionsUrl(place, 'openstreetmap') : lineMapsUrl(place, 'openstreetmap'));

/** The place in that choice; false when it could not open it. */
export async function openPlaceIn(choice: MapsChoice, place: string, directions: boolean): Promise<boolean> {
  if (choice.kind === 'web') {
    const url = webPlaceUrl(place, directions);
    if (!url) return false;
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      showSnack(t('No app on this phone can open this.'), undefined, { tone: 'error' });
      return false;
    }
  }
  const uri = mapAppUri(choice.packageName, place, directions);
  return uri ? openInMapApp(uri, choice.packageName) : false;
}

export interface OpenPlaceOptions {
  /** The way there from where the phone is, not the place alone. */
  readonly directions?: boolean;
  /** The chooser's title, when it asks (« Itinéraire jusqu’à Léa »). */
  readonly title?: string;
}

/** The place in the maps chosen, or the chooser when none is (or the one chosen is gone). */
export async function openPlace(place: string, options: OpenPlaceOptions = {}): Promise<void> {
  const line = lineOf(place);
  if (!line) return;
  const directions = options.directions === true;
  const choice = mapsChoice();
  let gone: string | null = null;
  if (choice) {
    if (await openPlaceIn(choice, line, directions)) return;
    // The browser failing has said why; an app that no longer opens places is forgotten and asked again.
    if (choice.kind === 'web') return;
    setMapsChoice(null);
    gone = choice.label;
  }
  askPlace({ place: line, directions, title: options.title ?? null, gone });
}

/** The chooser's answer: the place opens there, and with `remember` that becomes the choice. */
export async function answerPlace(question: PlaceQuestion, choice: MapsChoice, remember: boolean): Promise<void> {
  closePlaceQuestion();
  if (remember) {
    setMapsChoice(choice);
    showSnack(t('Addresses will open in {app}. Settings change this choice.', { app: mapsChoiceName(choice) }), undefined, { tone: 'success' });
  }
  if (await openPlaceIn(choice, question.place, question.directions)) return;
  if (remember) setMapsChoice(null);
  if (choice.kind === 'app') showSnack(t('{app} could not open the address.', { app: choice.label }), undefined, { tone: 'error' });
}

/** The chooser's « Copier l’adresse ». */
export async function copyPlace(question: PlaceQuestion): Promise<void> {
  closePlaceQuestion();
  if (await copyText(question.place)) showSnack(t('Address copied'), undefined, { tone: 'success' });
}
