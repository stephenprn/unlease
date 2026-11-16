/** The stack. Every screen draws its own header, so the navigator's is off everywhere. */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getStateFromPath, type LinkingOptions } from '@react-navigation/native';

import { selectOnboarded, useSettingsStore } from '@shared/app/store/settingsStore';
import { appScheme } from '@shared/app/variant';

import { AdminScreen } from '../screens/AdminScreen';
import { AlarmsScreen } from '../screens/AlarmsScreen';
import { EditAlarmScreen } from '../screens/EditAlarmScreen';
import { EraseScreen } from '../screens/EraseScreen';
import { AppearanceSettingsScreen, SettingsScreen } from '../screens/SettingsScreen';
import { SetupScreen } from '../screens/SetupScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * What another app of the suite, a notice or the system opens here (`openInApp`):
 * `unlease-clock://alarm/<id>` (its editor), `new` (« Nouvelle alarme »), `settings`, `admin` (and
 * `admin/<section>`); nothing after the scheme is the alarms.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [`${appScheme('clock')}://`],
  config: {
    // An alarm opened from outside lies on the list, so Back and its × lead somewhere.
    initialRouteName: 'Alarms',
    screens: {
      Alarms: '',
      Edit: { path: 'new' },
      Settings: 'settings',
      Admin: 'admin/:section?',
    },
  },
  getStateFromPath: (path, options) => {
    const alarm = /^\/?alarm\/([^/?#]+)/.exec(path);
    if (alarm) return getStateFromPath(`new?id=${alarm[1]}`, options);
    return getStateFromPath(path, options);
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
    <Stack.Navigator initialRouteName={onboarded ? 'Alarms' : 'Setup'} screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }}>
      <Stack.Screen name="Setup" component={SetupScreen} />
      <Stack.Screen name="Alarms" component={AlarmsScreen} />
      <Stack.Screen name="Edit" component={EditAlarmScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={DEEPER} />
      <Stack.Screen name="Appearance" component={AppearanceSettingsScreen} options={DEEPER} />
      <Stack.Screen name="Admin" component={AdminScreen} options={DEEPER} />
      <Stack.Screen name="Erase" component={EraseScreen} options={DEEPER} />
    </Stack.Navigator>
  );
}
