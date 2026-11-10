/**
 * Someone from the address book (Contacts' records, synced here): a guest of the event, or whose
 * address becomes its place. Found by name as typed.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { foldText } from '@unlease/core/services/search';
import { contactName, sortContacts } from '@unlease/contacts/services/names';
import type { Contact } from '@unlease/contacts/models/contacts';
import { useLibraryStore } from '@app/store/libraryStore';

import { AppText, ListRow, Sheet, SHEET_INSET, TextField } from '@shared/ui/components';

export function ContactPickerSheet({ visible, title, only, onDismiss, onPick }: { visible: boolean; title: string; only?: (contact: Contact) => boolean; onDismiss: () => void; onPick: (contact: Contact) => void }) {
  const people = useLibraryStore(s => s.people);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);
  const found = useMemo(() => {
    const live = people.liveContacts.map(id => people.contacts[id]).filter((contact): contact is Contact => !!contact && (!only || only(contact)));
    const words = foldText(query.trim());
    return sortContacts(words ? live.filter(contact => foldText(contactName(contact)).includes(words)) : live, 'firstName').slice(0, 200);
  }, [people, query, only]);
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title} tall>
      <View style={styles.search}>
        <TextField value={query} onChangeText={setQuery} placeholder={t('Rechercher un contact')} accessibilityLabel={t('Rechercher un contact')} autoFocus />
      </View>
      <FlatList
        data={found}
        keyboardShouldPersistTaps="handled"
        keyExtractor={contact => contact.id}
        renderItem={({ item }) => (
          <ListRow
            title={contactName(item)}
            icon="person"
            onPress={() => {
              onPick(item);
              onDismiss();
            }}
          />
        )}
        ListEmptyComponent={<AppText variant="meta" style={styles.none}>{t('Aucun contact ne correspond')}</AppText>}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // The field and the line saying nothing matches on the sheet's column, under its title.
  search: { paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
  none: { paddingHorizontal: SHEET_INSET, paddingVertical: 12 },
});
