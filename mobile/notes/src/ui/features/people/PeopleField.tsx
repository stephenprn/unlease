/**
 * « Personnes » on a link's page: whom it is for (a gift idea's, set from Contacts too), as chips
 * opening them in Contacts, and « Ajouter une personne » (or « Modifier ») for the sheet that picks
 * them. Shown once the phone holds someone to pick, or the link names someone.
 */
import React, { useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { setPeople } from '@app/store/actions';
import { useHasPeople, useNotePeople } from '@app/hooks/useNotePeople';

import { AppText, Button } from '../../components';
import { PersonChip } from './PeopleChips';
import { PeopleSheet } from './PeopleSheet';

export function PeopleField({ type, id, ids, editable = true }: { type: 'note' | 'link'; id: string; ids: readonly string[]; editable?: boolean }) {
  const [picking, setPicking] = useState(false);
  const people = useNotePeople(ids);
  const any = useHasPeople();
  if (!any && ids.length === 0) return null;
  return (
    <View style={styles.field}>
      <AppText variant="metaStrong">{t('People')}</AppText>
      <View style={styles.chips}>
        {people.map(person => (
          <PersonChip key={person.contact.id} person={person} />
        ))}
        {editable ? (
          <Button
            kind="text"
            small
            icon={people.length > 0 ? 'edit' : 'personPlus'}
            label={people.length > 0 ? t('Edit') : t('Add someone')}
            accessibilityLabel={people.length > 0 ? t('Change the people') : undefined}
            onPress={() => {
              // The keyboard of the note field would cover the people.
              Keyboard.dismiss();
              setPicking(true);
            }}
          />
        ) : null}
      </View>
      <PeopleSheet visible={picking} selected={ids} onDismiss={() => setPicking(false)} onChange={next => setPeople(type, id, next)} />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
});
