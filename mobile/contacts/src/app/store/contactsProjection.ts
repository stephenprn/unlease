/**
 * Contacts' records as screens read them: every contact and label (`@unlease/contacts/models/contacts`),
 * the labels' order, and the live contacts' ids. A projection of the shared library
 * (`@shared/app/store/library`): only the touched maps are replaced, and an entry keeps its identity
 * unless its own record changed, so a subscriber re-renders only for its own contact.
 *
 * A leaf: it imports only the shared code and the packages (never this app's `@app`, `@ui`, `@data`),
 * so another app of the suite may borrow it (Pages, to name the contacts its pages mention):
 * `combineProjections(…, contactsProjection())`.
 */
import { comparePositions } from '@unlease/core/services/fractionalIndex';
import type { SyncRecord } from '@unlease/core/sync/record';
import { isLive, type Contact, type ContactLabel } from '@unlease/contacts/models/contacts';
import { contactFromRecord, contactLabelFromRecord } from '@unlease/contacts/sync/entities';
import type { LibraryBase, LibraryProjection } from '@shared/app/store/library';

export interface ContactsState extends LibraryBase {
  /** Every contact this device holds, in the bin and deleted ones too (`deletedAt`, `trashedAt`). */
  readonly contacts: Readonly<Record<string, Contact>>;
  /** Every label, deleted ones too. */
  readonly labels: Readonly<Record<string, ContactLabel>>;
  /** The live labels, in their order (`position`). */
  readonly labelOrder: readonly string[];
  /** The live contacts (out of the bin, not deleted), in no set order: screens sort them (`sortContacts`). */
  readonly liveContacts: readonly string[];
}

const EMPTY: ContactsState = { contacts: {}, labels: {}, labelOrder: [], liveContacts: [], revision: 0 };

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** A fresh projection: the live set lives beside the state, one per library. */
export function contactsProjection(): LibraryProjection<ContactsState> {
  const live = new Set<string>();

  function decode(base: ContactsState, changed: readonly SyncRecord[]): ContactsState {
    // Every key of `base` is kept, those of a projection combined with this one too.
    const draft: { -readonly [K in keyof ContactsState]: ContactsState[K] } = { ...base };
    let contactsChanged = false;
    let liveChanged = false;
    let labelsChanged = false;
    for (const record of changed) {
      if (record.type === 'contact') {
        if (!contactsChanged) draft.contacts = { ...draft.contacts };
        contactsChanged = true;
        const contact = contactFromRecord(record);
        (draft.contacts as Record<string, Contact>)[contact.id] = contact;
        const alive = isLive(contact);
        if (alive !== live.has(contact.id)) {
          if (alive) live.add(contact.id);
          else live.delete(contact.id);
          liveChanged = true;
        }
      } else if (record.type === 'contactLabel') {
        if (!labelsChanged) draft.labels = { ...draft.labels };
        labelsChanged = true;
        const label = contactLabelFromRecord(record);
        (draft.labels as Record<string, ContactLabel>)[label.id] = label;
      }
    }
    if (liveChanged) draft.liveContacts = [...live];
    if (labelsChanged) {
      const order = Object.values(draft.labels)
        .filter(label => label.deletedAt === null)
        .sort(comparePositions)
        .map(label => label.id);
      if (!sameIds(order, draft.labelOrder)) draft.labelOrder = order;
    }
    return draft;
  }

  return { empty: EMPTY, decode, clear: () => live.clear() };
}
