/**
 * The list's search box: every word typed must be found in a contact's name, company, numbers,
 * emails, addresses or labels, accent- and case-insensitively; a number is found by its digits
 * however it was typed (« 0612 » finds « 06 12 34 56 78 »), and in its international form, a
 * national number taking `region`, the person's « Indicatif par défaut » (« +33612345678 », as a
 * call or a message shows it, finds it too). Names that start with the words first.
 */
import { foldText, queryTerms } from '@unlease/core/services/search';
import type { Contact, ContactLabel } from '../models/contacts';
import { addressLine } from './addresses';
import { contactName } from './names';
import { internationalDigits } from './phones';

/** What the search reads of a contact, folded, and its numbers as digits, as typed and international. */
export function searchText(contact: Contact, labels: Readonly<Record<string, ContactLabel>>, region: string | null = null): { readonly name: string; readonly rest: string; readonly digits: string } {
  const labelNames = contact.labelIds.map(id => labels[id]?.name ?? '').filter(Boolean);
  const rest = [contact.company, contact.jobTitle, ...contact.emails.map(entry => entry.address), ...contact.phones.map(entry => entry.number), ...contact.addresses.map(addressLine), ...labelNames, contact.note].join(' ');
  const digits = contact.phones.flatMap(entry => [entry.number.replace(/[^0-9]/g, ''), internationalDigits(entry.number, region) ?? '']);
  return { name: foldText(contactName(contact)), rest: foldText(rest), digits: digits.filter(Boolean).join(' ') };
}

/** The contacts that hold every word, those whose name starts with the first word first; the given order otherwise. */
export function searchContacts(contacts: readonly Contact[], labels: Readonly<Record<string, ContactLabel>>, query: string, region: string | null = null): Contact[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [...contacts];
  const found: { contact: Contact; starts: boolean }[] = [];
  for (const contact of contacts) {
    const text = searchText(contact, labels, region);
    const holds = terms.every(term => {
      if (text.name.includes(term) || text.rest.includes(term)) return true;
      const digits = term.replace(/[^0-9]/g, '');
      return digits.length >= 3 && digits.length === term.replace(/[\s+().-]/g, '').length && text.digits.includes(digits.replace(/^0+/, '') || digits);
    });
    if (holds) found.push({ contact, starts: text.name.startsWith(terms[0]!) || text.name.includes(` ${terms[0]!}`) });
  }
  return [...found.filter(entry => entry.starts), ...found.filter(entry => !entry.starts)].map(entry => entry.contact);
}
