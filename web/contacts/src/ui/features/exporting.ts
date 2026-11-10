/** Contacts handed to the browser as a vCard file (`.vcf`), which Google Contacts, a phone and Thunderbird read back. */
import type { Contact } from '@unlease/contacts/models/contacts';
import { contactName } from '@unlease/contacts/services/names';
import { toVCards } from '@unlease/contacts/services/vcard';

import { saveFile } from '@shared/ui/dom';
import { useContactsStore } from '../../app/store/library';

/** A file name from a person's name: letters, digits and dashes. */
function fileName(contacts: readonly Contact[]): string {
  if (contacts.length !== 1) return 'contacts.vcf';
  const base = contactName(contacts[0]!)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${base || 'contact'}.vcf`;
}

/** Saves `contacts` as one `.vcf`; how many it holds. */
export function exportContacts(contacts: readonly Contact[]): number {
  if (contacts.length === 0) return 0;
  const text = toVCards(contacts, useContactsStore.getState().labels);
  saveFile(new TextEncoder().encode(text), fileName(contacts), 'text/vcard');
  return contacts.length;
}
