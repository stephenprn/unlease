/**
 * The people a note or a link names, as it shows them: at a note's foot and on a link's page each a
 * chip (their face and name) opening them in Contacts (its app when installed, else its web app); on
 * a card's foot their faces alone (`CardFaces`), named with the card for TalkBack.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { APPS } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { SHAPES } from '@unlease/design/shapes';
import { contactName } from '@unlease/contacts/services/names';
import { useNotePeople, type NotePerson } from '@app/hooks/useNotePeople';
import { contactPlace, openInApp } from '@shared/app/openApp';

import { AppText, Tappable } from '../../components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme } from '@shared/ui/theme/ThemeProvider';
import { PersonFace } from './PersonFace';

/** A 40 high chip reaches 48 under a finger, within the 8 between chips. */
const SLOP = 4;

/** A person, opening in Contacts. */
export function PersonChip({ person }: { person: NotePerson }) {
  const theme = useTheme();
  const name = contactName(person.contact);
  return (
    <Tappable
      onPress={() => openInApp('contacts', contactPlace(person.contact.id)).catch(() => undefined)}
      hitSlop={SLOP}
      style={[styles.chip, { borderColor: theme.color.outline }]}
      accessibilityRole="link"
      accessibilityLabel={t('{name}, in {app}', { name, app: APPS.contacts.name })}
    >
      <PersonFace contact={person.contact} size={24} />
      <AppText variant="label" numberOfLines={1} style={styles.name}>
        {name}
      </AppText>
    </Tappable>
  );
}

/** The people `ids` name, as chips; nothing while none can be named here. */
export function PeopleChips({ ids }: { ids: readonly string[] }) {
  const people = useNotePeople(ids);
  return (
    <>
      {people.map(person => (
        <PersonChip key={person.contact.id} person={person} />
      ))}
    </>
  );
}

/** On a card's foot: up to three faces, then how many more; one person alone on the foot (`named`) beside their name. */
export const CardFaces = memo(function CardFaces({ ids, named = false }: { ids: readonly string[]; named?: boolean }) {
  const theme = useTheme();
  const people = useNotePeople(ids);
  if (people.length === 0) return null;
  const shown = people.slice(0, 3);
  return (
    <View style={styles.faces} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {shown.map(person => (
        <PersonFace key={person.contact.id} contact={person.contact} size={22} />
      ))}
      {people.length > shown.length ? (
        <AppText variant="labelSmall" color={theme.color.inkMuted}>
          +{people.length - shown.length}
        </AppText>
      ) : null}
      {named && people.length === 1 ? (
        <AppText variant="meta" numberOfLines={1} style={styles.faceName}>
          {contactName(people[0]!.contact)}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  chip: { minHeight: 40, maxWidth: '100%', borderWidth: 1, paddingLeft: 7, paddingRight: 14, flexDirection: 'row', alignItems: 'center', gap: 8, ...corners(SHAPES.chip) },
  name: { flexShrink: 1 },
  faces: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  faceName: { flexShrink: 1, marginLeft: 2 },
});
