/**
 * What a mention of a contact reads as in another app's backup (a page, a note): the person's name
 * now, the one a merge kept included (`resolveContact`); null once gone.
 */
import type { Ref } from '@unlease/core/refs';
import type { Contact } from '@unlease/contacts/models/contacts';
import { resolveContact } from '@unlease/contacts/services/duplicates';
import { contactName } from '@unlease/contacts/services/names';
import { contactFromRecord } from '@unlease/contacts/sync/entities';
import type { StoredRecord } from '../../sync/records';

export function contactNamer(all: readonly StoredRecord[]): (target: Ref) => string | null {
  const contacts: Record<string, Contact> = {};
  for (const record of all) if (record.type === 'contact') contacts[record.id] = contactFromRecord(record);
  return target => {
    if (target.type !== 'contact') return null;
    const contact = resolveContact(contacts, target.id);
    return contact ? contactName(contact) : null;
  };
}
