/** The stack. Every screen draws its own header, so the navigator's is off everywhere. */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { LinkingOptions } from '@react-navigation/native';

import { APP_SLUG } from '@unlease/notes/brand';
import { selectOnboarded, useSettingsStore } from '@app/store/settingsStore';

import { AdminScreen } from '../screens/AdminScreen';
import { BoardScreen } from '../screens/BoardScreen';
import { CookingScreen } from '../screens/CookingScreen';
import { DrawingScreen } from '../screens/DrawingScreen';
import { ImportScreen } from '../screens/ImportScreen';
import { LabelsScreen } from '../screens/LabelsScreen';
import { LineScreen } from '../screens/LineScreen';
import { LinesScreen } from '../screens/LinesScreen';
import { LinkScreen } from '../screens/LinkScreen';
import { NoteScreen } from '../screens/NoteScreen';
import { PageScreen } from '../screens/PageScreen';
import { PagesScreen } from '../screens/PagesScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SetupScreen } from '../screens/SetupScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** What notifications and the widgets open: `carnet://note/<id>`, `line/<id>`, `link/<id>`, `page/<id>`, `pages`, `label/<id>`, `capture/<kind>` (`?label=<id>`). */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [`${APP_SLUG}://`],
  config: {
    // A screen opened from outside (a widget, a notification) lies on the board, so Back and its arrow lead somewhere.
    initialRouteName: 'Board',
    screens: {
      Board: {
        path: 'capture/:capture',
        alias: ['', 'label/:label'],
      },
      Note: 'note/:id',
      Line: 'line/:id',
      Link: 'link/:id',
      Pages: 'pages',
      Page: 'page/:id',
      Settings: 'settings',
      Admin: 'admin',
    },
  },
};

/**
 * Going deeper takes Android's own transition (a short shift and a quick fade, front-loaded), not
 * `slide_from_right`, which pushes the whole width for 400ms on an ease-in-out and feels slow.
 */
const DEEPER = { animation: 'default' } as const;

export function RootNavigator(): React.ReactElement {
  const onboarded = useSettingsStore(selectOnboarded);
  return (
    <Stack.Navigator initialRouteName={onboarded ? 'Board' : 'Setup'} screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }}>
      <Stack.Screen name="Setup" component={SetupScreen} />
      <Stack.Screen name="Board" component={BoardScreen} />
      <Stack.Screen name="Note" component={NoteScreen} />
      <Stack.Screen name="Pages" component={PagesScreen} />
      <Stack.Screen name="Page" component={PageScreen} options={DEEPER} />
      <Stack.Screen name="Line" component={LineScreen} options={DEEPER} />
      <Stack.Screen name="Link" component={LinkScreen} options={DEEPER} />
      <Stack.Screen name="Cooking" component={CookingScreen} />
      <Stack.Screen name="Drawing" component={DrawingScreen} />
      <Stack.Screen name="Lines" component={LinesScreen} options={DEEPER} />
      <Stack.Screen name="Labels" component={LabelsScreen} options={DEEPER} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={DEEPER} />
      <Stack.Screen name="Admin" component={AdminScreen} options={DEEPER} />
      <Stack.Screen name="Import" component={ImportScreen} options={DEEPER} />
    </Stack.Navigator>
  );
}
