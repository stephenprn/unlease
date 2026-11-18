/** The stack. Every screen draws its own header, so the navigator's is off everywhere. */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getStateFromPath, type LinkingOptions } from '@react-navigation/native';

import { selectOnboarded, useSettingsStore } from '@shared/app/store/settingsStore';
import { appScheme } from '@shared/app/variant';

import { AdminScreen } from '../screens/AdminScreen';
import { EditScreen } from '../screens/EditScreen';
import { EraseScreen } from '../screens/EraseScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ItemScreen } from '../screens/ItemScreen';
import { AppearanceSettingsScreen, SettingsScreen } from '../screens/SettingsScreen';
import { SetupScreen } from '../screens/SetupScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** The launcher's shortcuts (res/xml/shortcuts.xml): `cards` and `search`, read as the home's places. */
const shortcutPath = (path: string): string => (/^\/?cards\/?$/.test(path) ? '?place=cards' : /^\/?search\/?$/.test(path) ? '' : path);

/** What opens here: `unlease-wallet://cards`, `papers`, `documents`, `item/<id>`, `settings`, `admin`. */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [`${appScheme('wallet')}://`],
  config: {
    initialRouteName: 'Home',
    screens: {
      Home: '',
      Item: 'item/:id',
      Settings: 'settings',
      Admin: 'admin/:section?',
    },
  },
  getStateFromPath: (path, options) => getStateFromPath(shortcutPath(path), options),
};

const DEEPER = { animation: 'default' } as const;

export function RootNavigator(): React.ReactElement {
  const onboarded = useSettingsStore(selectOnboarded);
  return (
    <Stack.Navigator initialRouteName={onboarded ? 'Home' : 'Setup'} screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }}>
      <Stack.Screen name="Setup" component={SetupScreen} />
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Item" component={ItemScreen} options={DEEPER} />
      <Stack.Screen name="Edit" component={EditScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={DEEPER} />
      <Stack.Screen name="Appearance" component={AppearanceSettingsScreen} options={DEEPER} />
      <Stack.Screen name="Erase" component={EraseScreen} options={DEEPER} />
      <Stack.Screen name="Admin" component={AdminScreen} options={DEEPER} />
    </Stack.Navigator>
  );
}
