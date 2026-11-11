/**
 * How a contact is named and ordered: its name as shown, its initials on its pebble, the letter it
 * is filed under, and the order of the list (by first name, as Google does, or by last name).
 */
import { t, tx } from '@unlease/core/i18n';
import { foldText } from '@unlease/core/services/search';
import type { Contact, ContactLabel } from '../models/contacts';

/** What a contact without a name, a company, an email or a number is called. */
export const UNNAMED = tx('Sans nom');

/** How the list is ordered: Google's « Trier par ». */
export const SORT_ORDERS = ['firstName', 'lastName'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

type Named = Pick<Contact, 'firstName' | 'lastName' | 'company' | 'emails' | 'phones'>;

/** The person's name, else their company, an email, a number (never translated: what they are). */
export function nameOrNull(contact: Named): string | null {
  const name = `${contact.firstName.trim()} ${contact.lastName.trim()}`.trim();
  if (name) return name;
  const company = contact.company.trim();
  if (company) return company;
  const email = contact.emails.find(entry => entry.address.trim())?.address.trim();
  if (email) return email;
  const phone = contact.phones.find(entry => entry.number.trim())?.number.trim();
  return phone ?? null;
}

/**
 * A name written whole (a card's « FN », another app's « Créer un contact »): its last word the last
 * name, the words before it the first name; a single word is the first name (a number saved as
 * « Plombier »).
 */
export function splitName(whole: string): Pick<Contact, 'firstName' | 'lastName'> {
  const words = whole.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { firstName: words[0] ?? '', lastName: '' };
  return { firstName: words.slice(0, -1).join(' '), lastName: words[words.length - 1]! };
}

/** The name as shown: « Léa Martin », or « Sans nom ». */
export function contactName(contact: Named): string {
  return nameOrNull(contact) ?? t(UNNAMED);
}

/** A letter of any script, or a digit (no Unicode classes: Hermes' support of them varies). */
const isLetterOrDigit = (char: string): boolean => char.toLowerCase() !== char.toUpperCase() || /[0-9]/.test(char);

/** Up to two letters for the pebble: « LM », « L », « A » for « Acme »; empty when nothing gives one. */
export function initials(contact: Named): string {
  const first = [...contact.firstName.trim()][0] ?? '';
  const last = [...contact.lastName.trim()][0] ?? '';
  if (first || last) return `${first}${last}`.toUpperCase();
  const other = nameOrNull(contact);
  const letter = other ? [...other].find(isLetterOrDigit) : undefined;
  return letter ? letter.toUpperCase() : '';
}

/** The words the list sorts by: the first name first, or the last name first. */
export function sortKey(contact: Named, order: SortOrder): string {
  const first = contact.firstName.trim();
  const last = contact.lastName.trim();
  const shown = order === 'lastName' && last ? `${last} ${first}` : first || last ? `${first} ${last}` : (nameOrNull(contact) ?? '');
  return foldText(shown.trim());
}

/** The letter a contact is filed under (A-Z), or `#` for a digit, a sign or nothing. */
export function groupLetter(contact: Named, order: SortOrder): string {
  const first = sortKey(contact, order).charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : '#';
}

/** The name as the list shows it, the sort's word first: « Martin Léa » when sorted by last name. */
export function listName(contact: Named, order: SortOrder): string {
  if (order === 'lastName' && contact.lastName.trim() && contact.firstName.trim()) return `${contact.lastName.trim()} ${contact.firstName.trim()}`;
  return contactName(contact);
}

const collator = (): Intl.Collator => new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Contacts in the list's order, `#` last as Google files them, ties by creation. */
export function sortContacts<T extends Named & Pick<Contact, 'createdAt' | 'id'>>(contacts: readonly T[], order: SortOrder): T[] {
  const compare = collator();
  const keyed = contacts.map(contact => ({ contact, key: sortKey(contact, order), hash: groupLetter(contact, order) === '#' }));
  keyed.sort((a, b) => Number(a.hash) - Number(b.hash) || compare.compare(a.key, b.key) || a.contact.createdAt - b.contact.createdAt || (a.contact.id < b.contact.id ? -1 : 1));
  return keyed.map(entry => entry.contact);
}

/** Labels by name, as the navigation lists them. */
export function sortLabels<T extends Pick<ContactLabel, 'name' | 'position'>>(labels: readonly T[]): T[] {
  const compare = collator();
  return [...labels].sort((a, b) => compare.compare(a.name, b.name) || (a.position < b.position ? -1 : 1));
}

/** One line under the name: the job and the company (« Architecte, Atelier Nord »). */
export function workLine(contact: Pick<Contact, 'company' | 'jobTitle' | 'firstName' | 'lastName'>): string {
  const named = Boolean(contact.firstName.trim() || contact.lastName.trim());
  const company = named ? contact.company.trim() : '';
  return [contact.jobTitle.trim(), company].filter(Boolean).join(', ');
}
