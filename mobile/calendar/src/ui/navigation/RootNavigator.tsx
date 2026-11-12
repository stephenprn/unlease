/** The stack. Every screen draws its own header, so the navigator's is off everywhere. */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getStateFromPath, type LinkingOptions } from '@react-navigation/native';

import { selectOnboarded, useSettingsStore } from '@shared/app/store/settingsStore';
import { appScheme } from '@shared/app/variant';

import { AdminScreen } from '../screens/AdminScreen';
import { AskScreen } from '../screens/AskScreen';
import { BirthdayScreen } from '../screens/BirthdayScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { EditEventScreen } from '../screens/EditEventScreen';
import { EraseScreen } from '../screens/EraseScreen';
import { EventScreen } from '../screens/EventScreen';
import { FeedsScreen } from '../screens/FeedsScreen';
import { ImportScreen } from '../screens/ImportScreen';
import { LabelsScreen } from '../screens/LabelsScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { AppearanceSettingsScreen, SettingsScreen } from '../screens/SettingsScreen';
import { SetupScreen } from '../screens/SetupScreen';
import { TrashScreen } from '../screens/TrashScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * What another app of the suite, a widget or a notification opens here (`openInApp` with
 * `eventPlace`, `newEventPlace`): `unlease-agenda://event/<id>?at=…`, `new?title=…&start=…`,
 * `birthday/<contact>`, `day/<2026-11-02>`, `today` (« Aujourd'hui »), `quick` (« Ajouter en quelques mots »), `labels`, `feeds`,
 * `import`, `trash`, `search`, `ask`, `settings`, `admin`; nothing after the scheme is the calendar.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [`${appScheme('calendar')}://`],
  config: {
    // An event opened from outside lies on the calendar, so Back and its arrow lead somewhere.
    initialRouteName: 'Calendar',
    screens: {
      Calendar: { path: '' },
      Event: 'event/:id',
      Edit: 'new',
      Birthday: 'birthday/:id',
      Search: 'search',
      Labels: 'labels',
      Feeds: 'feeds',
      Import: 'import',
      Trash: 'trash',
      Ask: 'ask',
      Settings: 'settings',
      Admin: 'admin/:section?',
    },
  },
  getStateFromPath: (path, options) => {
    const day = /^\/?day\/(\d{4}-\d{2}-\d{2})/.exec(path);
    if (day) return getStateFromPath(`?day=${day[1]}&view=day`, options);
    if (/^\/?today\/?$/.test(path)) return getStateFromPath('?view=today', options);
    // The launcher's shortcut « Ajouter en quelques mots »: the calendar, its quick add open.
    if (/^\/?quick\/?$/.test(path)) return getStateFromPath('?capture=quick', options);
    return getStateFromPath(path, options);
  },
};

/** Going deeper takes Android's own transition, not `slide_from_right` (too slow). */
const DEEPER = { animation: 'default' } as const;

export function RootNavigator(): React.ReactElement {
  const onboarded = useSettingsStore(selectOnboarded);
  return (
    <Stack.Navigator initialRouteName={onboarded ? 'Calendar' : 'Setup'} screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }}>
      <Stack.Screen name="Setup" component={SetupScreen} />
      <Stack.Screen name="Calendar" component={CalendarScreen} />
      <Stack.Screen name="Event" component={EventScreen} options={DEEPER} />
      <Stack.Screen name="Edit" component={EditEventScreen} />
      <Stack.Screen name="Birthday" component={BirthdayScreen} options={DEEPER} />
      <Stack.Screen name="Search" component={SearchScreen} options={DEEPER} />
      <Stack.Screen name="Labels" component={LabelsScreen} options={DEEPER} />
      <Stack.Screen name="Feeds" component={FeedsScreen} options={DEEPER} />
      <Stack.Screen name="Import" component={ImportScreen} options={DEEPER} />
      <Stack.Screen name="Trash" component={TrashScreen} options={DEEPER} />
      <Stack.Screen name="Ask" component={AskScreen} options={DEEPER} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={DEEPER} />
      <Stack.Screen name="Appearance" component={AppearanceSettingsScreen} options={DEEPER} />
      <Stack.Screen name="Erase" component={EraseScreen} options={DEEPER} />
      <Stack.Screen name="Admin" component={AdminScreen} options={DEEPER} />
    </Stack.Navigator>
  );
}
