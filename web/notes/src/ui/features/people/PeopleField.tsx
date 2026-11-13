/**
 * « Personnes » on a link's page: whom it is for (a gift idea's, set from Contacts too), as chips
 * opening them in Contacts, and « Ajouter une personne » (or « Modifier ») for the picker. Shown
 * once this browser holds someone to pick, or the link names someone.
 */
import { useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';

import { useHasPeople, useNotePeople } from '../../../app/hooks/useNotePeople';
import { setPeople } from '../../../app/store/actions';
import { Button } from '@shared/ui/components/Button';
import { PersonChip } from './PeopleChips';
import { PeoplePicker } from './PeoplePicker';
import styles from './people.module.css';

export function PeopleField({ type, id, ids }: { type: 'note' | 'link'; id: string; ids: readonly string[] }) {
  const [picking, setPicking] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const people = useNotePeople(ids);
  const any = useHasPeople();
  if (!any && ids.length === 0) return null;
  return (
    <div className={styles.field} role="group" aria-label={t('People')}>
      <p className={`${styles.fieldLabel} t-meta-strong`}>{t('People')}</p>
      <div className={styles.fieldChips}>
        {people.map(person => (
          <PersonChip key={person.contact.id} person={person} />
        ))}
        <span ref={anchor} className={styles.fieldAction}>
          <Button kind="text" small icon={people.length > 0 ? 'edit' : 'personPlus'} title={people.length > 0 ? t('Change the people') : undefined} onClick={() => setPicking(true)}>
            {people.length > 0 ? t('Edit') : t('Add someone')}
          </Button>
        </span>
      </div>
      <PeoplePicker open={picking} anchor={anchor} selected={ids} onDismiss={() => setPicking(false)} onChange={next => setPeople(type, id, next)} />
    </div>
  );
}
