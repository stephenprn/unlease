/**
 * The people of Contacts a note or a link names: a field that finds them as Contacts' own search
 * does (by name, number, e-mail, company), those named already first, each a row ticked or not (the
 * web's PeoplePicker). Each change is written at once, so nothing waits on a button; an id this phone
 * cannot name stays on the note.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import type { Contact } from '@unlease/contacts/models/contacts';
import { contactName, workLine } from '@unlease/contacts/services/names';
import { PEOPLE_MAX } from '@unlease/notes/sync/types';
import { useNotePeople, usePeopleFound } from '@app/hooks/useNotePeople';

import { CheckMark, EmptyLine, ListRow, Sheet, SHEET_INSET, SheetScroll, TextField } from '../../components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';
import { PersonFace } from './PersonFace';

/** At most this many found people listed: typing finds the others. */
const SHOWN = 60;

function Row({ contact, on, onToggle }: { contact: Contact; on: boolean; onToggle: () => void }) {
  const detail = workLine(contact) || contact.phones[0]?.number || contact.emails[0]?.address || undefined;
  return (
    <ListRow
      title={contactName(contact)}
      supporting={detail}
      leading={<PersonFace contact={contact} size={40} />}
      trailing={<CheckMark checked={on} />}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
    />
  );
}

export function PeopleSheet({ visible, selected, onDismiss, onChange }: { visible: boolean; selected: readonly string[]; onDismiss: () => void; onChange: (ids: string[]) => void }) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);
  const chosen = useNotePeople(selected);
  const found = usePeopleFound(query);
  const chosenIds = useMemo(() => new Set(chosen.map(person => person.contact.id)), [chosen]);
  const typing = query.trim().length > 0;
  const others = useMemo(() => (typing ? found : found.filter(contact => !chosenIds.has(contact.id))).slice(0, SHOWN), [found, chosenIds, typing]);
  const full = selected.length >= PEOPLE_MAX;

  const toggle = (contact: Contact): void => {
    const held = chosen.find(person => person.contact.id === contact.id);
    // Off: the id the note holds goes (the merged one's maybe); on: the contact's own.
    if (held) onChange(selected.filter(id => id !== held.id));
    else if (!full) onChange([...selected, contact.id]);
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Personnes')} tall>
      <View style={styles.field}>
        <TextField value={query} onChangeText={setQuery} placeholder={t('Chercher une personne')} accessibilityLabel={t('Chercher une personne')} autoCorrect={false} returnKeyType="search" />
      </View>
      <SheetScroll top={false}>
        {!typing && chosen.length > 0 ? (
          <>
            {chosen.map(person => (
              <Row key={person.contact.id} contact={person.contact} on onToggle={() => toggle(person.contact)} />
            ))}
            {others.length > 0 ? <View style={[styles.divider, { backgroundColor: theme.color.hairline }]} /> : null}
          </>
        ) : null}
        {others.map(contact => (
          <Row key={contact.id} contact={contact} on={chosenIds.has(contact.id)} onToggle={() => toggle(contact)} />
        ))}
        {others.length === 0 && (typing || chosen.length === 0) ? (
          <EmptyLine glyph={typing ? 'search' : 'person'} text={typing ? t('Personne ne s’appelle ainsi dans vos contacts.') : t('Aucun contact pour l’instant.')} slot={40} gap={16} style={styles.empty} />
        ) : null}
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // Under the sheet's title, as every picker sheet's search field (labels, notes).
  field: { paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
  // From the rows' faces to their end (a row's 6 and 10: the sheet's column).
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4, marginHorizontal: SHEET_INSET },
  // Its glyph in the faces' slot, its words on the names' column.
  empty: { paddingHorizontal: SHEET_INSET, paddingVertical: 12 },
});
