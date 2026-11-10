/**
 * A contact as the form holds it while it is edited (« Créer un contact », « Modifier le contact »):
 * every field but the note (typed text, saved through its merge), the rows as typed. Saving cleans
 * it (empty rows go, values trimmed and cut at their limits) and, for a contact already here, keeps
 * only the fields that changed.
 */
import { createId } from '@unlease/core/services/ids';
import type { Fields } from '@unlease/core/sync/record';
import { CONTACT_LIMITS, type AddressEntry, type Contact, type EmailEntry, type PhoneEntry } from '@unlease/contacts/models/contacts';
import { isEmptyAddress } from '@unlease/contacts/services/addresses';

export interface ContactDraft {
  readonly firstName: string;
  readonly lastName: string;
  readonly company: string;
  readonly jobTitle: string;
  readonly phones: readonly PhoneEntry[];
  readonly emails: readonly EmailEntry[];
  readonly addresses: readonly AddressEntry[];
  readonly birthday: string | null;
  readonly labelIds: readonly string[];
  readonly favorite: boolean;
  readonly photoId: string | null;
  readonly photoMime: string;
  readonly photoUploaded: boolean;
}

export const newPhone = (kind = 'mobile'): PhoneEntry => ({ id: createId(), number: '', kind, label: '' });
export const newEmail = (kind = 'home'): EmailEntry => ({ id: createId(), address: '', kind, label: '' });
export const newAddress = (kind = 'home'): AddressEntry => ({ id: createId(), kind, label: '', street: '', postalCode: '', city: '', region: '', country: '' });

/** A new contact's form: a name typed in the spotlight split into first and last, a row of each kind ready to fill. */
export function emptyDraft(name = '', labelIds: readonly string[] = []): ContactDraft {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: words[0] ?? '',
    lastName: words.slice(1).join(' '),
    company: '',
    jobTitle: '',
    phones: [newPhone()],
    emails: [newEmail()],
    addresses: [],
    birthday: null,
    labelIds,
    favorite: false,
    photoId: null,
    photoMime: '',
    photoUploaded: false,
  };
}

/** A contact already here, as its form opens. */
export function draftOf(contact: Contact): ContactDraft {
  return {
    firstName: contact.firstName,
    lastName: contact.lastName,
    company: contact.company,
    jobTitle: contact.jobTitle,
    phones: contact.phones.length > 0 ? contact.phones : [newPhone()],
    emails: contact.emails.length > 0 ? contact.emails : [newEmail()],
    addresses: contact.addresses,
    birthday: contact.birthday,
    labelIds: contact.labelIds,
    favorite: contact.favorite,
    photoId: contact.photoId,
    photoMime: contact.photoMime,
    photoUploaded: contact.photoUploaded,
  };
}

const cut = (value: string, max: number): string => value.trim().slice(0, max);

/** The draft as it is stored: rows with nothing in them left out, everything trimmed and within its limit. */
export function cleanDraft(draft: ContactDraft): ContactDraft {
  return {
    ...draft,
    firstName: cut(draft.firstName, CONTACT_LIMITS.name),
    lastName: cut(draft.lastName, CONTACT_LIMITS.name),
    company: cut(draft.company, CONTACT_LIMITS.company),
    jobTitle: cut(draft.jobTitle, CONTACT_LIMITS.jobTitle),
    phones: draft.phones
      .filter(entry => entry.number.trim())
      .slice(0, CONTACT_LIMITS.phones)
      .map(entry => ({ ...entry, number: cut(entry.number, CONTACT_LIMITS.number), label: cut(entry.label, CONTACT_LIMITS.entryLabel) })),
    emails: draft.emails
      .filter(entry => entry.address.trim())
      .slice(0, CONTACT_LIMITS.emails)
      .map(entry => ({ ...entry, address: cut(entry.address, CONTACT_LIMITS.email), label: cut(entry.label, CONTACT_LIMITS.entryLabel) })),
    addresses: draft.addresses
      .filter(entry => !isEmptyAddress(entry))
      .slice(0, CONTACT_LIMITS.addresses)
      .map(entry => ({
        ...entry,
        label: cut(entry.label, CONTACT_LIMITS.entryLabel),
        street: entry.street
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
          .join('\n')
          .slice(0, CONTACT_LIMITS.addressLine),
        postalCode: cut(entry.postalCode, CONTACT_LIMITS.addressPart),
        city: cut(entry.city, CONTACT_LIMITS.addressPart),
        region: cut(entry.region, CONTACT_LIMITS.addressPart),
        country: cut(entry.country, CONTACT_LIMITS.addressPart),
      })),
    labelIds: [...new Set(draft.labelIds)].slice(0, CONTACT_LIMITS.labels),
  };
}

/** Nothing worth a contact: no name, company, number, email, address or birthday. */
export function isEmptyDraft(draft: ContactDraft, note: string): boolean {
  const clean = cleanDraft(draft);
  return !clean.firstName && !clean.lastName && !clean.company && !clean.jobTitle && clean.phones.length === 0 && clean.emails.length === 0 && clean.addresses.length === 0 && clean.birthday === null && !note.trim() && clean.photoId === null;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The fields of a cleaned draft that differ from the contact as stored. */
export function draftPatch(contact: Contact, clean: ContactDraft): Fields {
  const patch: Fields = {};
  for (const key of Object.keys(clean) as (keyof ContactDraft)[]) {
    const value = clean[key];
    if (!same(value, contact[key])) patch[key] = Array.isArray(value) ? value.map(entry => (typeof entry === 'object' ? { ...entry } : entry)) : value;
  }
  return patch;
}
