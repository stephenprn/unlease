/** The stack. Every screen draws its own header, so the navigator's is off everywhere. */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getStateFromPath, type LinkingOptions } from '@react-navigation/native';

import { selectOnboarded, useSettingsStore } from '@shared/app/store/settingsStore';
import { appScheme } from '@shared/app/variant';

import { AdminScreen } from '../screens/AdminScreen';
import { DrawingScreen } from '../screens/DrawingScreen';
import { EraseScreen } from '../screens/EraseScreen';
import { ImportScreen } from '../screens/ImportScreen';
import { PageScreen } from '../screens/PageScreen';
import { PagesScreen } from '../screens/PagesScreen';
import { AppearanceSettingsScreen, SettingsScreen } from '../screens/SettingsScreen';
import { SetupScreen } from '../screens/SetupScreen';
import { TrashScreen } from '../screens/TrashScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * A block named after the page's address, as the web writes it (`#block-<id>`) or bare (`#<id>`):
 * the `block` param, so the page opens at it.
 */
export function blockFromHash(path: string): string {
  const hash = path.indexOf('#');
  if (hash < 0) return path;
  const block = path.slice(hash + 1).replace(/^block-/, '');
  const base = path.slice(0, hash);
  return block ? `${base}${base.includes('?') ? '&' : '?'}block=${encodeURIComponent(block)}` : base;
}

/** The launcher's shortcuts (res/xml/shortcuts.xml): `new` and `search`, read as the home's `capture`. */
export function capturePath(path: string): string {
  const asked = /^\/?(new|search)\/?$/.exec(path)?.[1];
  if (asked === 'new') return '?capture=page';
  if (asked === 'search') return '?capture=search';
  return path;
}

/**
 * What another app of the suite opens here (`openInApp`, Carnet's « Pages » row and its pages
 * cited in notes): `unlease-pages://page/<id>` (`#block-<id>` or `?block=<id>` for a block),
 * `trash`, `settings`, `import`, `admin`; nothing after the scheme is the home; `new` a new page and
 * `search` the home's search (the launcher's shortcuts).
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [`${appScheme('pages')}://`],
  config: {
    // A page opened from outside lies on the home, so Back and its arrow lead somewhere.
    initialRouteName: 'Pages',
    screens: {
      Pages: '',
      Page: 'page/:id',
      Trash: 'trash',
      Settings: 'settings',
      Import: 'import',
      Admin: 'admin/:section?',
    },
  },
  getStateFromPath: (path, options) => getStateFromPath(capturePath(blockFromHash(path)), options),
};

/**
 * Going deeper takes Android's own transition (a short shift and a quick fade, front-loaded), not
 * `slide_from_right`, which pushes the whole width for 400ms on an ease-in-out and feels slow.
 */
const DEEPER = { animation: 'default' } as const;

export function RootNavigator(): React.ReactElement {
  const onboarded = useSettingsStore(selectOnboarded);
  return (
    <Stack.Navigator initialRouteName={onboarded ? 'Pages' : 'Setup'} screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }}>
      <Stack.Screen name="Setup" component={SetupScreen} />
      <Stack.Screen name="Pages" component={PagesScreen} />
      <Stack.Screen name="Page" component={PageScreen} options={DEEPER} />
      <Stack.Screen name="Drawing" component={DrawingScreen} />
      <Stack.Screen name="Trash" component={TrashScreen} options={DEEPER} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={DEEPER} />
      <Stack.Screen name="Appearance" component={AppearanceSettingsScreen} options={DEEPER} />
      <Stack.Screen name="Import" component={ImportScreen} options={DEEPER} />
      <Stack.Screen name="Erase" component={EraseScreen} options={DEEPER} />
      <Stack.Screen name="Admin" component={AdminScreen} options={DEEPER} />
    </Stack.Navigator>
  );
}
