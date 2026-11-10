/**
 * A place opened in maps, through a stand-in for the native module: straight into the maps app
 * chosen (the way there into Google Maps' and Waze's own routes), OpenStreetMap in the browser, the
 * chooser when nothing is chosen or the app chosen is gone (then forgotten), and the chooser's
 * answer remembered only when asked.
 */
import { Linking } from 'react-native';

import { state as native, __reset } from '../../../__mocks__/NativeMapApps';
import { closeDatabase, openDatabase } from '../../data/db/database';
import { readPreferences } from '../../data/repositories/stateRepository';
import { answerPlace, copyPlace, GOOGLE_MAPS_PACKAGE, mapAppUri, openPlace, WAZE_PACKAGE } from '../openPlace';
import { loadMapsChoice, mapsChoice, parseMapsChoice, setMapsChoice, useMapsStore } from '../store/mapsStore';
import { useUiStore } from '../store/uiStore';

const PLACE = '12 rue des Lilas, 69003 Lyon';
const GEO = 'geo:0,0?q=12%20rue%20des%20Lilas%2C%2069003%20Lyon';
const ORGANIC = { packageName: 'app.organicmaps', label: 'Organic Maps', icon: '' };
const GOOGLE = { packageName: GOOGLE_MAPS_PACKAGE, label: 'Maps', icon: '' };

beforeEach(() => {
  __reset();
  closeDatabase();
  openDatabase({ name: 'maps.sqlite' });
  useMapsStore.setState({ loaded: false, choice: null, asking: null, choosing: false });
  useUiStore.setState({ snack: null });
});

describe('a place opened', () => {
  it('asks, with nothing chosen: the chooser opens on it', async () => {
    native.apps = [ORGANIC];
    await openPlace(`  ${PLACE}\n`);
    expect(native.opened).toEqual([]);
    expect(useMapsStore.getState().asking).toEqual({ place: PLACE, directions: false, title: null, gone: null });
  });

  it('goes straight into the app chosen', async () => {
    native.apps = [ORGANIC];
    setMapsChoice({ kind: 'app', packageName: ORGANIC.packageName, label: ORGANIC.label });
    await openPlace(PLACE);
    expect(native.opened).toEqual([{ uri: GEO, packageName: ORGANIC.packageName }]);
    expect(useMapsStore.getState().asking).toBeNull();
  });

  it('forgets an app chosen that is gone, and asks, saying so', async () => {
    setMapsChoice({ kind: 'app', packageName: ORGANIC.packageName, label: ORGANIC.label });
    await openPlace(PLACE, { directions: true, title: 'Itinéraire jusqu’à Léa' });
    expect(mapsChoice()).toBeNull();
    expect(readPreferences().mapsChoice).toBeNull();
    expect(useMapsStore.getState().asking).toEqual({ place: PLACE, directions: true, title: 'Itinéraire jusqu’à Léa', gone: 'Organic Maps' });
  });

  it('opens OpenStreetMap in the browser when that is the choice', async () => {
    const opened = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    setMapsChoice({ kind: 'web', app: 'openstreetmap' });
    await openPlace(PLACE, { directions: true });
    expect(opened).toHaveBeenCalledWith('https://www.openstreetmap.org/directions?to=12%20rue%20des%20Lilas%2C%2069003%20Lyon');
    opened.mockRestore();
  });

  it('nothing written opens nothing', async () => {
    await openPlace('   ');
    expect(useMapsStore.getState().asking).toBeNull();
  });
});

describe('the way there', () => {
  it('takes Google Maps’ and Waze’s own routes, the place itself elsewhere', () => {
    expect(mapAppUri(GOOGLE_MAPS_PACKAGE, PLACE, true)).toBe('https://www.google.com/maps/dir/?api=1&destination=12%20rue%20des%20Lilas%2C%2069003%20Lyon');
    expect(mapAppUri(WAZE_PACKAGE, PLACE, true)).toBe('https://waze.com/ul?q=12%20rue%20des%20Lilas%2C%2069003%20Lyon&navigate=yes');
    expect(mapAppUri(ORGANIC.packageName, PLACE, true)).toBe(GEO);
    expect(mapAppUri(GOOGLE_MAPS_PACKAGE, PLACE, false)).toBe(GEO);
  });
});

describe('the chooser’s answer', () => {
  const question = { place: PLACE, directions: false, title: null, gone: null };

  it('opens there once, and remembers it only when asked', async () => {
    native.apps = [GOOGLE];
    await answerPlace(question, { kind: 'app', packageName: GOOGLE.packageName, label: GOOGLE.label }, false);
    expect(native.opened).toEqual([{ uri: GEO, packageName: GOOGLE_MAPS_PACKAGE }]);
    expect(mapsChoice()).toBeNull();
    await answerPlace(question, { kind: 'app', packageName: GOOGLE.packageName, label: GOOGLE.label }, true);
    expect(mapsChoice()).toEqual({ kind: 'app', packageName: GOOGLE_MAPS_PACKAGE, label: 'Maps' });
    expect(useUiStore.getState().snack).toMatchObject({ tone: 'success' });
    // Read again at the next start.
    useMapsStore.setState({ loaded: false, choice: null });
    loadMapsChoice();
    expect(mapsChoice()).toEqual({ kind: 'app', packageName: GOOGLE_MAPS_PACKAGE, label: 'Maps' });
  });

  it('copies the address, and closes', async () => {
    useMapsStore.setState({ asking: question });
    await copyPlace(question);
    expect(useMapsStore.getState().asking).toBeNull();
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Adresse copiée', tone: 'success' });
  });
});

describe('a stored choice', () => {
  it('reads an app or the browser, nothing else', () => {
    expect(parseMapsChoice({ kind: 'app', packageName: 'com.waze', label: 'Waze' })).toEqual({ kind: 'app', packageName: 'com.waze', label: 'Waze' });
    expect(parseMapsChoice({ kind: 'web', app: 'openstreetmap' })).toEqual({ kind: 'web', app: 'openstreetmap' });
    expect(parseMapsChoice({ kind: 'app', packageName: '' })).toBeNull();
    expect(parseMapsChoice('waze')).toBeNull();
    expect(parseMapsChoice(null)).toBeNull();
  });
});
