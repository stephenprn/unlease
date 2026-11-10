/** The stack. Every screen draws its own header, so the navigator's is off everywhere. */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getStateFromPath, type LinkingOptions } from '@react-navigation/native';

import { APP_SCHEME } from '@unlease/contacts/brand';
import { selectOnboarded, useSettingsStore } from '@shared/app/store/settingsStore';

import { AdminScreen } from '../screens/AdminScreen';
import { BirthdaysScreen } from '../screens/BirthdaysScreen';
import { ContactScreen } from '../screens/ContactScreen';
import { ContactsScreen } from '../screens/ContactsScreen';
import { DuplicatesScreen } from '../screens/DuplicatesScreen';
import { EditContactScreen } from '../screens/EditContactScreen';
import { ImportScreen } from '../screens/ImportScreen';
import { LabelsScreen } from '../screens/LabelsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SetupScreen } from '../screens/SetupScreen';
import { TrashScreen } from '../screens/TrashScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** The list's places by their own address (`favorites`, `label/<id>`), read as the list's params. */
export function listPath(path: string): string {
  const [base = '', query = ''] = path.replace(/^\/+/, '').split('?');
  const join = (params: string): string => (query ? `?${params}&${query}` : `?${params}`);
  if (base === 'favorites') return join('filter=favorites');
  const label = /^label\/([^/]+)$/.exec(base);
  if (label) return join(`label=${label[1]}`);
  return path;
}

/**
 * What another app of the suite, a widget or a notification opens here (`openInApp` with
 * `contactPlace`): `unlease-contacts://contact/<id>`, `new` (« Créer un contact », `?phone=` to start
 * with a number), `edit/<id>`, `favorites`, `label/<id>`, `birthdays`, `labels`, `import`, `duplicates`, `trash`,
 * `settings`, `admin`; nothing after the scheme is the list.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [`${APP_SCHEME}://`],
  config: {
    // A contact opened from outside lies on the list, so Back and its arrow lead somewhere.
    initialRouteName: 'Contacts',
    screens: {
      Contacts: '',
      Contact: 'contact/:id',
      Edit: { path: 'new' },
      Birthdays: 'birthdays',
      Labels: 'labels',
      Import: 'import',
      Duplicates: 'duplicates',
      Trash: 'trash',
      Settings: 'settings',
      Admin: 'admin/:section?',
    },
  },
  getStateFromPath: (path, options) => {
    const edit = /^\/?edit\/([^/?#]+)/.exec(path);
    if (edit) return getStateFromPath(`new?id=${edit[1]}`, options);
    return getStateFromPath(listPath(path), options);
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
    <Stack.Navigator initialRouteName={onboarded ? 'Contacts' : 'Setup'} screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }}>
      <Stack.Screen name="Setup" component={SetupScreen} />
      <Stack.Screen name="Contacts" component={ContactsScreen} />
      <Stack.Screen name="Contact" component={ContactScreen} options={DEEPER} />
      <Stack.Screen name="Edit" component={EditContactScreen} />
      <Stack.Screen name="Birthdays" component={BirthdaysScreen} options={DEEPER} />
      <Stack.Screen name="Labels" component={LabelsScreen} options={DEEPER} />
      <Stack.Screen name="Import" component={ImportScreen} options={DEEPER} />
      <Stack.Screen name="Duplicates" component={DuplicatesScreen} options={DEEPER} />
      <Stack.Screen name="Trash" component={TrashScreen} options={DEEPER} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={DEEPER} />
      <Stack.Screen name="Admin" component={AdminScreen} options={DEEPER} />
    </Stack.Navigator>
  );
}
