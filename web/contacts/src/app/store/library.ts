/**
 * Contacts' library: every contact and label, in memory, folded from the shell's records
 * (`@shared/app/store/records`, which writes them through to IndexedDB and syncs them). A leaf:
 * another app's web app that shows contacts (Pages' mentions) imports it with `data.ts` and
 * nothing of Contacts' screens.
 *
 * Re-render discipline (load-bearing, keep it while "simplifying"): each map is copied on write
 * and an entity is replaced only when its own record changed, so a selector on one contact
 * re-renders for that contact alone.
 */
import { create } from 'zustand';

import type { Contact, ContactLabel } from '@unlease/contacts/models/contacts';
import { contactFromRecord, contactLabelFromRecord } from '@unlease/contacts/sync/entities';
import { CONTACTS_TYPES } from '@unlease/contacts/sync/types';

import type { Projection } from '@shared/app/store/records';

export interface ContactsState {
  /** Every contact, live, in the bin or a tombstone (`deletedAt`). */
  readonly contacts: Readonly<Record<string, Contact>>;
  /** Every label, deleted ones too (`deletedAt`). */
  readonly labels: Readonly<Record<string, ContactLabel>>;
  /** Bumped by every change; cheap invalidation for derived caches (the spotlight). */
  readonly revision: number;
}

const EMPTY: ContactsState = { contacts: {}, labels: {}, revision: 0 };

export const useContactsStore = create<ContactsState>(() => EMPTY);

/** What the shell feeds: the contacts and their labels, and only those. */
export const contactsProjection: Projection = {
  types: CONTACTS_TYPES,
  apply(changed, fresh) {
    useContactsStore.setState(state => {
      const base = fresh ? EMPTY : state;
      let contacts = base.contacts;
      let labels = base.labels;
      for (const record of changed) {
        if (record.type === 'contact') {
          if (contacts === base.contacts) contacts = { ...base.contacts };
          (contacts as Record<string, Contact>)[record.id] = contactFromRecord(record);
        } else if (record.type === 'contactLabel') {
          if (labels === base.labels) labels = { ...base.labels };
          (labels as Record<string, ContactLabel>)[record.id] = contactLabelFromRecord(record);
        }
      }
      return { contacts, labels, revision: base.revision + 1 };
    }, true);
  },
  clear() {
    useContactsStore.setState(EMPTY, true);
  },
};
