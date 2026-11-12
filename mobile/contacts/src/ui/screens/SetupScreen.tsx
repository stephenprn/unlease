/**
 * The suite's first run (`@shared/ui/screens/SetupScreen`) as Contacts': its brand (a sibling's
 * connection offered when another app of the suite is here already), its import offered while the
 * address book is empty (this phone's own contacts, or Google's export), then the list.
 */
import React from 'react';

import { SetupScreen as SuiteSetup, type SetupImporter } from '@shared/ui/screens/SetupScreen';

import { ContactsImport } from '../features/importing/ContactsImport';
import type { ScreenProps } from '../navigation/types';

const IMPORTER: SetupImporter = {
  // A product's name, the same in every language.
  source: () => 'Google Contacts',
  Wizard: ContactsImport,
};

export function SetupScreen({ navigation }: ScreenProps<'Setup'>) {
  return <SuiteSetup app="contacts" importer={IMPORTER} onDone={() => navigation.reset({ index: 0, routes: [{ name: 'Contacts' }] })} />;
}
