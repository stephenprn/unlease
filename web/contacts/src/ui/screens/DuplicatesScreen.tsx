/**
 * Duplicates (Google's « Fusionner et corriger »): each group of contacts that are surely one person,
 * side by side, with why (the same e-mail, number or name). « Fusionner » makes them one in one batch
 * (the first kept and completed, the others to the bin; the slip takes it back); « Ignorer » sets the
 * group aside on this device; « Tout fusionner » does every group shown.
 */
import { memo } from 'react';

import { t, tx } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import type { DuplicateGroup, DuplicateReason } from '@unlease/contacts/services/duplicates';
import { contactName, workLine } from '@unlease/contacts/services/names';

import { useDuplicates } from '../../app/hooks/useContacts';
import { mergeGroups } from '../../app/store/actions';
import { useContactsStore } from '../../app/store/library';
import { dismissDuplicates } from '../../app/store/prefs';
import { showUndo } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { PageHead } from '@shared/ui/navigation/PageHead';
import { Link } from '@shared/ui/router';
import styles from '../contacts.module.css';
import { Avatar } from '../features/Avatar';
import { paths } from '../routes';

const REASONS: Readonly<Record<DuplicateReason, string>> = { email: tx('même e-mail'), phone: tx('même numéro'), name: tx('même nom') };

/** « Même e-mail · même numéro ». */
function reasonsLine(reasons: readonly DuplicateReason[]): string {
  const words = reasons.map(reason => t(REASONS[reason]));
  const line = words.join(' · ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

const Person = memo(function Person({ id, kept }: { id: string; kept: boolean }) {
  const contact = useContactsStore(s => s.contacts[id]);
  if (!contact) return null;
  const name = contactName(contact);
  const work = workLine(contact);
  return (
    <li className={styles.twin} data-kept={kept || undefined}>
      <Avatar contact={contact} size={48} />
      <span className={styles.twinText}>
        <Link to={paths.contact(id)} className={`${styles.twinName} t-body-strong`}>
          {name}
        </Link>
        {work ? <span className="t-meta">{work}</span> : null}
        {contact.phones.map(phone => (
          <span key={phone.id} className="t-meta tabular">
            {phone.number}
          </span>
        ))}
        {contact.emails.map(email => (
          <span key={email.id} className="t-meta">
            {email.address}
          </span>
        ))}
        {kept ? <span className={`${styles.twinKept} t-label-small`}>{t('Gardé')}</span> : null}
      </span>
    </li>
  );
});

/** One group or all of them, one slip that takes them back: « Fusionnés en Léa Martin », « 5 contacts fusionnés » (as on the phone). */
function merge(groups: readonly DuplicateGroup[]): void {
  const kept = groups.length === 1 ? useContactsStore.getState().contacts[groups[0]!.ids[0]!] : undefined;
  const undo = mergeGroups(groups.map(group => group.ids));
  const merged = groups.reduce((sum, group) => sum + group.ids.length - 1, 0);
  showUndo(kept ? t('Fusionnés en {name}', { name: contactName(kept) }) : t('{contacts} fusionnés', { contacts: plural(merged, 'contact') }), undo);
}

function Group({ group }: { group: DuplicateGroup }) {
  return (
    <OutlinedBox kind="panel" lift="card" className={`${styles.details} paper`} role="group" aria-label={reasonsLine(group.reasons)}>
      <p className={`${styles.detailsTitle} t-meta-strong`}>{reasonsLine(group.reasons)}</p>
      <ul className={styles.twins}>
        {group.ids.map((id, index) => (
          <Person key={id} id={id} kept={index === 0} />
        ))}
      </ul>
      <div className={styles.groupTools}>
        <Button kind="text" onClick={() => dismissDuplicates(group.ids)}>
          {t('Ignorer')}
        </Button>
        <Button kind="tonal" icon="people" onClick={() => merge([group])}>
          {t('Fusionner')}
        </Button>
      </div>
    </OutlinedBox>
  );
}

export function DuplicatesScreen() {
  const groups = useDuplicates();
  return (
    <div className={`${styles.screen} ${styles.narrowScreen}`}>
      <div>
        <PageHead title={t('Doublons')} action={groups.length > 1 ? { icon: 'people', label: t('Tout fusionner'), onClick: () => merge(groups) } : undefined} />
        {groups.length > 0 ? <p className={`${styles.count} t-meta`}>{t('Les contacts qui ont le même e-mail, le même numéro ou le même nom. La fusion garde le premier, le complète avec ce que les autres ont en plus, et met les autres à la corbeille.')}</p> : null}
      </div>
      {groups.length === 0 ? (
        <EmptyState scene="label" title={t('Aucun doublon')} text={t('Chaque personne n’apparaît qu’une fois. Après un import, revenez ici : les contacts en double s’y rassemblent.')} />
      ) : (
        groups.map(group => <Group key={group.ids.join(',')} group={group} />)
      )}
    </div>
  );
}
