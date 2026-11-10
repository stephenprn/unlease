/**
 * Contacts in the spotlight (`@unlease/contacts/services/spotlight`): a person by their name, what
 * they do or how to reach them under it, their face as the row's mark; the preview beside the list
 * shows what the search read of them, the matches marked.
 */
import { memo } from 'react';

import { t, tx } from '@unlease/core/i18n';
import type { Matcher, SearchDoc } from '@unlease/core/services/searchIndex';
import type { SpotMeta } from '@unlease/core/services/spotlight';
import { contactName, workLine } from '@unlease/contacts/services/names';
import { contactsSpotlightDocs } from '@unlease/contacts/services/spotlight';

import { useContactsStore, type ContactsState } from '../../../app/store/library';
import { Icon } from '@shared/ui/components/Icon';
import { Marked } from '@shared/ui/features/spotlight/Preview';
import styles from '@shared/ui/features/spotlight/spotlight.module.css';
import { navigate } from '@shared/ui/router';
import type { SpotKind } from '@shared/modules';
import { paths } from '../../routes';
import { Avatar } from '../Avatar';

let cached: { readonly contacts: ContactsState['contacts']; readonly labels: ContactsState['labels']; readonly docs: readonly SearchDoc<SpotMeta>[] } | null = null;

/** Every live contact, built again only when a contact or a label changed. */
function docs(): readonly SearchDoc<SpotMeta>[] {
  const { contacts, labels } = useContactsStore.getState();
  if (cached && cached.contacts === contacts && cached.labels === labels) return cached.docs;
  const made = contactsSpotlightDocs(Object.values(contacts), labels);
  cached = { contacts, labels, docs: made };
  return made;
}

const ContactMark = memo(function ContactMark({ doc, large = false }: { doc: SearchDoc<SpotMeta>; large?: boolean }) {
  const contact = useContactsStore(s => s.contacts[doc.meta.id]);
  return contact ? <Avatar contact={contact} size={large ? 48 : 28} /> : <Icon name="person" size={large ? 32 : 20} />;
});

function ContactPreview({ doc, matcher }: { doc: SearchDoc<SpotMeta>; matcher: Matcher }) {
  if (doc.parts.length === 0) return <p className={`${styles.quiet} t-meta`}>{t('Rien d’autre que son nom')}</p>;
  return (
    <div className={styles.pageBody}>
      {doc.parts.map((part, at) => (
        <p key={at} className={`${styles.blockText} t-body`}>
          <Marked text={part.text} matcher={matcher} />
        </p>
      ))}
    </div>
  );
}

const href = (doc: SearchDoc<SpotMeta>): string => paths.contact(doc.meta.id);

export const CONTACTS_SPOT_KINDS: readonly SpotKind[] = [
  {
    type: 'contact',
    label: tx('Contacts'),
    docs,
    title: doc => {
      const contact = useContactsStore.getState().contacts[doc.meta.id];
      return contact ? contactName(contact) : doc.title;
    },
    facts: doc => {
      const contact = useContactsStore.getState().contacts[doc.meta.id];
      if (!contact) return [t('Contact')];
      const reach = workLine(contact) || contact.phones.find(entry => entry.number.trim())?.number || contact.emails.find(entry => entry.address.trim())?.address;
      return [t('Contact'), ...(reach ? [reach] : [])];
    },
    href,
    open: doc => navigate(href(doc)),
    Mark: ContactMark,
    Preview: ContactPreview,
  },
];
