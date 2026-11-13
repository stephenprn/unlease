/**
 * What the list shows above its letters, as the phone's (Google's): the favourites in a row of faces,
 * and the birthdays of the week in one line that leads to them all.
 */
import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import type { Contact } from '@unlease/contacts/models/contacts';
import { birthdayWhen, upcomingBirthdays } from '@unlease/contacts/services/birthdays';
import { contactName } from '@unlease/contacts/services/names';

import { useMinute } from '@shared/app/hooks/useMinute';
import { Icon } from '@shared/ui/components/Icon';
import { Link } from '@shared/ui/router';
import styles from '../contacts.module.css';
import { paths } from '../routes';
import { Avatar } from './Avatar';

/** The phone's face, 56. */
const FACE = 56;

/** The favourites' row; nothing while there are none. */
export function FavoritesStrip({ contacts }: { contacts: readonly Contact[] }) {
  const favorites = contacts.filter(contact => contact.favorite);
  if (favorites.length === 0) return null;
  return (
    <section className={styles.block} aria-labelledby="contacts-favorites">
      <h2 id="contacts-favorites" className={`${styles.sectionHead} t-section`}>
        {t('Favourites')}
      </h2>
      <ul className={styles.faces}>
        {favorites.map(contact => {
          const name = contactName(contact);
          return (
            <li key={contact.id}>
              <Link to={paths.contact(contact.id)} className={styles.face} ariaLabel={name}>
                <Avatar contact={contact} size={FACE} />
                <span className={`${styles.faceName} t-meta`}>{contact.firstName.trim() || name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The week's birthdays in a line (« Léa Martin · Aujourd’hui · 36 ans »); nothing when none comes. */
export function BirthdayLine({ contacts }: { contacts: readonly Contact[] }) {
  const now = useMinute();
  const coming = upcomingBirthdays(contacts, now, 7);
  if (coming.length === 0) return null;
  const first = coming[0]!;
  const others = coming.length - 1;
  return (
    <Link to={paths.birthdays} className={styles.birthdayLine} ariaLabel={t('Birthdays')}>
      <Icon name="cake" size={22} />
      <span className={styles.birthdayText}>
        <span className="t-body-strong">{`${contactName(first.contact)} · ${birthdayWhen(first.birthday, now)}`}</span>
        {others > 0 ? <span className="t-meta">{t('and {others} this week', { others: plural(others, 'other') })}</span> : null}
      </span>
      <Icon name="chevronRight" size={20} />
    </Link>
  );
}
