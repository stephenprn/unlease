/** A contact's next birthday on a page of its own (`/agenda/birthday/<contact>`): the same as its popover. */
import { t } from '@unlease/core/i18n';
import { pebbleTurnOf } from '@unlease/design/pebbles';
import { LAYER_COLORS } from '@unlease/calendar/services/colors';
import { birthdaysIn } from '@unlease/calendar/services/layers';
import { addDays } from '@unlease/calendar/services/time';
import { resolveContact } from '@unlease/contacts/services/duplicates';
import { contactName } from '@unlease/contacts/services/names';

import { useContactsStore } from '@contacts/app/store/library';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { useNow } from '../../app/hooks/useToday';
import styles from '../calendar.module.css';
import { BirthdayDetails } from '../features/LayerDetails';

export function BirthdayScreen({ id }: { id: string }) {
  const { today } = useNow();
  const contact = useContactsStore(s => resolveContact(s.contacts, id));
  const next = contact ? birthdaysIn([contact], today, addDays(today, 367))[0] : undefined;
  if (!contact || !next) {
    return (
      <div className={`${styles.screen} ${styles.narrowScreen}`}>
        <EmptyState scene="reminders" as="h1" title={t('Pas d’anniversaire')} text={t('Ce contact n’a pas de date d’anniversaire, ou n’existe plus.')} />
      </div>
    );
  }
  return (
    <div className={`${styles.screen} ${styles.narrowScreen}`}>
      <header className={styles.hero} data-line={LAYER_COLORS.birthday}>
        <span className={styles.heroSwatch} data-pebble={pebbleTurnOf(id)} data-still aria-hidden="true" />
        <div className={styles.heroText}>
          <h1 className={`${styles.heroTitle} t-display`}>{contactName(contact)}</h1>
        </div>
      </header>
      <OutlinedBox kind="panel" lift="card" className={`${styles.panel} paper`}>
        <BirthdayDetails contactId={contact.id} day={next.day} />
      </OutlinedBox>
    </div>
  );
}
