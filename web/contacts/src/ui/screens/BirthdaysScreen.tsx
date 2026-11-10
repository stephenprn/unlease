/**
 * The birthdays of the year to come, the nearest on top, each with how far it is and the age it
 * brings, grouped as the phone's (Google's): today, this week, then month by month with its year.
 * Today's say « Souhaiter » at their end, beside the row (`WishButton`).
 */
import { memo } from 'react';

import { t } from '@unlease/core/i18n';
import type { Contact } from '@unlease/contacts/models/contacts';
import { ageToday, birthdayGroups, birthdayWhen, daysToBirthday, formatBirthday, upcomingBirthdays, type Birthday } from '@unlease/contacts/services/birthdays';
import { plural } from '@unlease/core/services/format';
import { contactName } from '@unlease/contacts/services/names';

import { useMinute } from '@shared/app/hooks/useMinute';
import { useLiveContacts } from '../../app/hooks/useContacts';
import { useCallingRegion } from '../../app/store/prefs';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { PageHead } from '@shared/ui/navigation/PageHead';
import { Link } from '@shared/ui/router';
import styles from '../contacts.module.css';
import { Avatar } from '../features/Avatar';
import { paths } from '../routes';
import { useWishWays, WishButton } from '../features/WishButton';

/** A year and its leap day: every birthday comes within it. */
const YEAR_DAYS = 366;

const BirthdayRow = memo(function BirthdayRow({ contact, birthday, now, region }: { contact: Contact; birthday: Birthday; now: number; region: string | null }) {
  const days = daysToBirthday(birthday, now);
  const soon = days <= 7;
  // Today's, with a way to write to them: « Souhaiter » where how far it is stands (its head says « Aujourd’hui »), the age under the name.
  const wishing = useWishWays(contact, region).length > 0 && days === 0;
  const age = wishing ? ageToday(birthday, now) : null;
  return (
    <li className={styles.wishRow}>
      <Link to={paths.contact(contact.id)} className={styles.simpleRow}>
        <Avatar contact={contact} size={40} />
        <span className={styles.nameCell}>
          <span className={`${styles.cell} t-body-strong`}>{contactName(contact)}</span>
          <span className={`${styles.cell} t-meta`}>{age !== null && age > 0 ? `${formatBirthday(birthday)} · ${plural(age, 'an')}` : formatBirthday(birthday)}</span>
        </span>
        {wishing ? null : (
          <span className={`${styles.when} t-meta`} data-soon={soon || undefined}>
            {birthdayWhen(birthday, now)}
          </span>
        )}
      </Link>
      {wishing ? <WishButton contact={contact} region={region} small className={styles.wishEnd} /> : null}
    </li>
  );
});

function Panel({ title, rows, now, region }: { title: string; rows: readonly { contact: Contact; birthday: Birthday }[]; now: number; region: string | null }) {
  return (
    <section className={styles.block} aria-label={title}>
      <h2 className={`${styles.sectionHead} t-section`}>{title}</h2>
      <OutlinedBox kind="panel" lift="card" className={`${styles.table} paper`}>
        <ul className={styles.group}>
          {rows.map(({ contact, birthday }) => (
            <BirthdayRow key={contact.id} contact={contact} birthday={birthday} now={now} region={region} />
          ))}
        </ul>
      </OutlinedBox>
    </section>
  );
}

export function BirthdaysScreen() {
  const contacts = useLiveContacts();
  const now = useMinute();
  const region = useCallingRegion();
  // The year to come grouped as on the phone (`birthdayGroups`): today, this week, then month by month, each once.
  const groups = birthdayGroups(upcomingBirthdays(contacts, now, YEAR_DAYS), now);
  return (
    <div className={`${styles.screen} ${styles.narrowScreen}`}>
      <PageHead title={t('Anniversaires')} />
      {groups.length === 0 ? (
        <EmptyState scene="reminders" title={t('Aucun anniversaire')} text={t('Ajoutez une date de naissance à un contact : elle apparaît ici, avec le nombre de jours qui vous en séparent.')} />
      ) : (
        groups.map(group => <Panel key={group.title} title={group.title} rows={group.entries} now={now} region={region} />)
      )}
    </div>
  );
}
