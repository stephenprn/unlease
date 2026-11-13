/**
 * The contacts in the bin, as Carnet's and the phone's: each with when it went there, « Restaurer »
 * (undone from the slip) and « Supprimer définitivement » (asked first); the head's broom, « Vider la
 * corbeille », for all of them (asked first). The server empties it after its retention.
 */
import { memo, useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { formatRelative, plural } from '@unlease/core/services/format';
import { TRASH_RETENTION_DAYS, type Contact } from '@unlease/contacts/models/contacts';
import { contactName } from '@unlease/contacts/services/names';

import { useMinute } from '@shared/app/hooks/useMinute';
import { useTrashedContacts } from '../../app/hooks/useContacts';
import { deleteForever, emptyContactsBin, restoreContacts } from '../../app/store/actions';
import { showSnack, showUndo } from '@shared/app/store/ui';
import { Confirm } from '@shared/ui/components/Dialog';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { IconButton } from '@shared/ui/components/IconButton';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { PageHead } from '@shared/ui/navigation/PageHead';
import { Link, navigate } from '@shared/ui/router';
import { useListMotion } from '@shared/ui/useListMotion';
import styles from '../contacts.module.css';
import { Avatar } from '../features/Avatar';
import { paths } from '../routes';

const BinRow = memo(function BinRow({ contact, now, onDelete }: { contact: Contact; now: number; onDelete: (id: string) => void }) {
  const name = contactName(contact);
  return (
    <li className={styles.row} data-motion={contact.id}>
      <span className={styles.pick}>
        <Avatar contact={contact} size={40} />
      </span>
      <Link to={paths.contact(contact.id)} className={styles.rowLink} ariaLabel={name}>
        <span className={styles.nameCell}>
          <span className={`${styles.cell} t-body-strong`}>{name}</span>
          <span className={`${styles.cell} t-meta`}>{t('Moved to the bin {when}', { when: formatRelative(contact.trashedAt ?? now, now) })}</span>
        </span>
      </Link>
      <span className={styles.rowEnd}>
        <IconButton icon="restore" label={t('Restore {name}', { name })} shape={1} onClick={() => showUndo(t('Contact restored'), restoreContacts([contact.id]), { label: t('See the contact'), run: () => navigate(paths.contact(contact.id)) })} />
        <IconButton icon="trash" label={t('Delete {name} forever', { name })} shape={2} onClick={() => onDelete(contact.id)} />
      </span>
    </li>
  );
});

export function TrashScreen() {
  const binned = useTrashedContacts();
  const now = useMinute();
  const [confirm, setConfirm] = useState<'all' | string | null>(null);
  const list = useRef<HTMLUListElement>(null);
  // A contact restored or deleted fades where it was, the others close ranks; one put back by « Annuler » settles in.
  useListMotion(list, { late: true });
  return (
    <div className={`${styles.screen} ${styles.narrowScreen}`}>
      <div>
        <PageHead title={t('Bin')} action={binned.length > 0 ? { icon: 'broom', label: t('Empty the bin'), onClick: () => setConfirm('all') } : undefined} />
        {binned.length > 0 ? <p className={`${styles.count} t-meta`}>{t('Contacts in the bin are deleted after {days} days.', { days: TRASH_RETENTION_DAYS })}</p> : null}
      </div>
      {binned.length === 0 ? (
        <EmptyState scene="trash" title={t('The bin is empty')} text={t('Deleted contacts stay there for {days} days, time enough to change your mind.', { days: TRASH_RETENTION_DAYS })} />
      ) : (
        <OutlinedBox kind="panel" lift="card" className={`${styles.table} paper`}>
          <ul ref={list} className={styles.group}>
            {binned.map(contact => (
              <BinRow key={contact.id} contact={contact} now={now} onDelete={setConfirm} />
            ))}
          </ul>
        </OutlinedBox>
      )}
      <Confirm
        open={confirm !== null}
        title={confirm === 'all' ? t('Empty the bin?') : t('Delete forever?')}
        message={confirm === 'all' ? t('Every contact in the bin will be deleted forever, on all your devices.') : t('This contact will disappear from all your devices. This cannot be undone.')}
        confirmLabel={confirm === 'all' ? t('Empty') : t('Delete')}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm === 'all') {
            const count = emptyContactsBin();
            showSnack(t('{contacts} forever', { contacts: plural(count, 'contact deleted', 'contacts deleted') }), undefined, { tone: 'success' });
          } else if (confirm) {
            deleteForever([confirm]);
            showSnack(t('Contact deleted forever'), undefined, { tone: 'success' });
          }
          setConfirm(null);
        }}
      />
    </div>
  );
}
