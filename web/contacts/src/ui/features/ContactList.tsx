/**
 * The contacts as Google lists them, on a panel of paper: wide, a table (the face and the name, the
 * email, the number, the labels, then the star); narrower, the phone's rows (the face, the name, a
 * number or an email under it). Sections of their own (« Favoris », « Contacts »), letters heading
 * each group when the list is long enough to look one up. A face is the box that picks its row,
 * under a pointer and while a pick is on; the selection bar acts on what is picked.
 */
import { Fragment, memo, useMemo, useRef } from 'react';

import { t } from '@unlease/core/i18n';
import type { Contact } from '@unlease/contacts/models/contacts';
import { groupLetter, listName, type SortOrder } from '@unlease/contacts/services/names';

import { setFavorite } from '../../app/store/actions';
import { pickRange, toggleSelected, useContactsUi } from '../../app/store/contactsUi';
import { useContactsStore } from '../../app/store/library';
import { useSortOrder } from '../../app/store/prefs';
import { useQuery } from '@shared/app/store/search';
import { showUndo } from '@shared/app/store/ui';
import { CheckMark } from '@shared/ui/components/Checkbox';
import { IconButton } from '@shared/ui/components/IconButton';
import { LabelMark } from '@shared/ui/components/LabelMark';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { Link, navigate } from '@shared/ui/router';
import { useListMotion } from '@shared/ui/useListMotion';
import styles from '../contacts.module.css';
import { paths } from '../routes';
import { Avatar } from './Avatar';

/** A favourite or no longer, with its way back. */
export function toggleFavorite(contact: Contact): void {
  const undo = setFavorite([contact.id], !contact.favorite);
  showUndo(contact.favorite ? t('Retiré des favoris') : t('Ajouté aux favoris'), undo);
}

const ContactRow = memo(function ContactRow({ id, order, picking, run }: { id: string; order: SortOrder; picking: boolean; run: readonly string[] }) {
  const contact = useContactsStore(s => s.contacts[id]);
  const labels = useContactsStore(s => s.labels);
  const picked = useContactsUi(s => s.selection.has(id));
  if (!contact) return null;
  const name = listName(contact, order);
  const email = contact.emails.find(entry => entry.address.trim())?.address ?? '';
  const phone = contact.phones.find(entry => entry.number.trim())?.number ?? '';
  const worn = contact.labelIds.map(labelId => labels[labelId]).filter(label => label && label.deletedAt === null);
  return (
    <li className={styles.row} data-motion={id} data-picked={picked || undefined} data-picking={picking || undefined}>
      <button type="button" className={styles.pick} role="checkbox" aria-checked={picked} aria-label={t('Sélectionner {name}', { name })} onClick={event => (event.shiftKey ? pickRange(run, id) : toggleSelected(id))}>
        <Avatar contact={contact} size={40} />
        <span className={styles.pickBox}>
          <CheckMark checked={picked} />
        </span>
      </button>
      <Link to={paths.contact(id)} className={styles.rowLink} ariaLabel={name}>
        <span className={styles.nameCell}>
          <span className={`${styles.cell} t-body-strong`}>{name}</span>
          <span className={`${styles.sub} ${styles.cell} t-meta`}>{phone || email}</span>
        </span>
        <span className={`${styles.cell} t-body`}>{email}</span>
        <span className={`${styles.cell} t-body tabular`}>{phone}</span>
        <span className={styles.chips}>
          {worn.map(label => (
            <LabelMark key={label!.id} name={label!.name} color={label!.color} />
          ))}
        </span>
      </Link>
      <span className={styles.rowEnd}>
        <IconButton icon="edit" label={t('Modifier {name}', { name })} className={styles.quiet} shape={1} onClick={() => navigate(paths.edit(id))} />
        <IconButton
          icon="star"
          label={contact.favorite ? t('Retirer {name} des favoris', { name }) : t('Ajouter {name} aux favoris', { name })}
          pressed={contact.favorite}
          className={contact.favorite ? styles.listStar : `${styles.listStar} ${styles.quiet}`}
          shape={2}
          onClick={() => toggleFavorite(contact)}
        />
      </span>
    </li>
  );
});

export interface ListSection {
  readonly id: string;
  /** Its head (« Favoris », « Contacts »); none for a list of one section. */
  readonly title?: string;
  readonly contacts: readonly Contact[];
  /** Headed by letters. */
  readonly letters?: boolean;
}

/** One section's rows, a letter heading each group. */
function SectionRows({ section, order, picking }: { section: ListSection; order: SortOrder; picking: boolean }) {
  // Every contact under its letter, as on the phone.
  const lettered = section.letters === true;
  // Maj+clic picks a run within the section, in the order it shows.
  const key = section.contacts.map(contact => contact.id).join(' ');
  const run = useMemo(() => (key ? key.split(' ') : []), [key]);
  if (!lettered) {
    return (
      <ul className={styles.group}>
        {section.contacts.map(contact => (
          <ContactRow key={contact.id} id={contact.id} order={order} picking={picking} run={run} />
        ))}
      </ul>
    );
  }
  const groups: { letter: string; contacts: Contact[] }[] = [];
  for (const contact of section.contacts) {
    const letter = groupLetter(contact, order);
    const last = groups.at(-1);
    if (last && last.letter === letter) last.contacts.push(contact);
    else groups.push({ letter, contacts: [contact] });
  }
  return (
    <>
      {groups.map(group => (
        <Fragment key={group.letter}>
          <h3 className={`${styles.letter} t-title`} data-motion={`letter:${group.letter}`}>
            <span className={styles.letterName}>{group.letter}</span>
          </h3>
          <ul className={styles.group} aria-label={group.letter}>
            {group.contacts.map(contact => (
              <ContactRow key={contact.id} id={contact.id} order={order} picking={picking} run={run} />
            ))}
          </ul>
        </Fragment>
      ))}
    </>
  );
}

/** More contacts than this coming or going at once (a whole pick binned, an import): the list just changes. */
const MOVING_AT_MOST = 40;

export function ContactList({ sections }: { sections: readonly ListSection[] }) {
  const order = useSortOrder();
  const picking = useContactsUi(s => s.selection.size > 0);
  const query = useQuery();
  const shown = sections.filter(section => section.contacts.length > 0);
  const root = useRef<HTMLDivElement>(null);
  // A contact deleted, unstarred from the favourites or binned with others fades where it was, the rest (and the letters) close ranks; one put back settles in. A search typed, another order or another list is drawn anew.
  useListMotion(root, { scene: `${query}|${order}|${sections.map(section => section.id).join(',')}`, most: MOVING_AT_MOST, late: true });
  return (
    <div ref={root} className={styles.lists}>
      {shown.map((section, index) => (
        <section key={section.id} aria-label={section.title ?? t('Contacts')} data-motion={`section:${section.id}`}>
          {section.title ? (
            <h2 className={`${styles.sectionHead} t-section`}>
              {section.title}
              <span className={`${styles.sectionCount} t-meta tabular`}>{section.contacts.length}</span>
            </h2>
          ) : null}
          <OutlinedBox kind="panel" lift="card" className={`${styles.table} paper`}>
            {index === 0 ? (
              <div className={`${styles.columns} t-meta-strong`} aria-hidden="true">
                <span>{t('Nom')}</span>
                <span>{t('E-mail')}</span>
                <span>{t('Téléphone')}</span>
                <span>{t('Libellés')}</span>
              </div>
            ) : null}
            <SectionRows section={section} order={order} picking={picking} />
          </OutlinedBox>
        </section>
      ))}
    </div>
  );
}
