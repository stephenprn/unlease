/**
 * The people a note or a link names, as it shows them: at a note's foot and on a link's page each a
 * chip (their face and name) opening them in Contacts' web app, in a tab of its own as a mention
 * does; on a card's foot their faces alone (`CardFaces`), named for a screen reader and a tooltip.
 */
import { memo } from 'react';

import { APPS } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { contactName } from '@unlease/contacts/services/names';

import { useNotePeople, type NotePerson } from '../../../app/hooks/useNotePeople';
import { pathOfRef } from '@shared/modules';
import { browserPath } from '@shared/ui/router';
import { PersonFace } from './PersonFace';
import styles from './people.module.css';

/** A person, opening in Contacts. */
export function PersonChip({ person }: { person: NotePerson }) {
  const name = contactName(person.contact);
  const path = pathOfRef('contact', person.contact.id);
  return (
    <a
      className={styles.chip}
      href={path ? browserPath(path) : undefined}
      target="_blank"
      rel="noopener"
      aria-label={t('{name}, dans {app}', { name, app: APPS.contacts.name })}
      onClick={event => event.stopPropagation()}
    >
      <PersonFace contact={person.contact} size={24} />
      <span className={styles.chipName}>{name}</span>
    </a>
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
  const people = useNotePeople(ids);
  if (people.length === 0) return null;
  const names = people.map(person => contactName(person.contact)).join(', ');
  const shown = people.slice(0, 3);
  return (
    <span className={styles.faces} role="img" aria-label={t('Personnes : {names}', { names })} data-tip={names}>
      {shown.map(person => (
        <PersonFace key={person.contact.id} contact={person.contact} size={22} />
      ))}
      {people.length > shown.length ? <span className={`${styles.more} t-label-small tabular`}>+{people.length - shown.length}</span> : null}
      {named && people.length === 1 ? <span className={`${styles.faceName} t-meta`}>{names}</span> : null}
    </span>
  );
});
