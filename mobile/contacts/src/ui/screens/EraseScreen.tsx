/**
 * « Effacer des données », Contacts' (`@shared/ui/screens/EraseScreen`): its parts counted from the
 * address book as it is (`contacts/services/erase`: the contacts, the favourites, the labels), and the
 * batch erasing those ticked; then the list.
 */
import React, { useMemo } from 'react';

import { eraseParts } from '@unlease/contacts/services/erase';
import { eraseContacts } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { EraseScreen as SuiteErase } from '@shared/ui/screens/EraseScreen';

import type { ScreenProps } from '../navigation/types';

export function EraseScreen({ navigation }: ScreenProps<'Erase'>) {
  const contacts = useLibraryStore(s => s.contacts);
  const labels = useLibraryStore(s => s.labels);
  const parts = useMemo(() => eraseParts({ contacts, labels }), [contacts, labels]);
  return <SuiteErase app="contacts" parts={parts} run={chosen => eraseContacts(chosen)} onBack={() => navigation.goBack()} onDone={() => navigation.reset({ index: 0, routes: [{ name: 'Contacts' }] })} />;
}
