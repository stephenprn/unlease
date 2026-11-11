/**
 * Another app's « Créer un contact » (the dialer's, Messages', a mail app's: Android's INSERT and
 * INSERT_OR_EDIT, `ContactsContract.Intents.Insert`): what it hands, read into the new contact's form,
 * which the person saves or leaves (nothing is kept before). The name is split as a card's
 * (`splitName`); each number and address keeps its kind (Android's types as the phone's import reads
 * them), a type of the other app's own its label; the `data` rows (phones, e-mails, the name, the
 * company, addresses, websites, the birthday, a note) add to the extras. A website, which a contact
 * has no field for, and a phonetic name, ignored, are the only losses: the websites go in the note.
 */
import { CONTACT_LIMITS, CONTACTS_TEXT_LIMITS, type AddressEntry, type EmailEntry, type PhoneEntry } from '@unlease/contacts/models/contacts';
import { readBirthday, writeBirthday } from '@unlease/contacts/services/birthdays';
import { splitName } from '@unlease/contacts/services/names';
import { phoneKey } from '@unlease/contacts/services/phones';

import type { ContactDraft } from './store/actions';

/** What the form opens with: plain values (the route's params), each row given its id by the form. */
export interface HandedContact {
  readonly firstName: string;
  readonly lastName: string;
  readonly company: string;
  readonly jobTitle: string;
  readonly phones: readonly Omit<PhoneEntry, 'id'>[];
  readonly emails: readonly Omit<EmailEntry, 'id'>[];
  readonly addresses: readonly Omit<AddressEntry, 'id'>[];
  /** `1990-03-12` or `--03-12`; null for none. */
  readonly birthday: string | null;
  readonly note: string;
}

// The data rows' kinds (`ContactsContract.CommonDataKinds.*.CONTENT_ITEM_TYPE`).
const NAME = 'vnd.android.cursor.item/name';
const PHONE = 'vnd.android.cursor.item/phone_v2';
const EMAIL = 'vnd.android.cursor.item/email_v2';
const ORGANIZATION = 'vnd.android.cursor.item/organization';
const POSTAL = 'vnd.android.cursor.item/postal-address_v2';
const WEBSITE = 'vnd.android.cursor.item/website';
const EVENT = 'vnd.android.cursor.item/contact_event';
const NOTE = 'vnd.android.cursor.item/note';
/** `ContactsContract.CommonDataKinds.Event.TYPE_BIRTHDAY`. */
const BIRTHDAY_TYPE = 3;

/** Android's number types (`Phone.TYPE_*`) as the phone's import reads them (`PhoneContactsModule.phoneKind`). */
function phoneKind(type: number): string {
  switch (type) {
    case 2:
      return 'mobile';
    case 1: // home
    case 5: // home fax
      return 'home';
    case 3: // work
    case 4: // work fax
    case 10: // company main
    case 17: // work mobile
    case 18: // work pager
      return 'work';
    case 12:
      return 'main';
    default:
      return 'other';
  }
}

/** An e-mail's or an address's type (`Email.TYPE_*`, `StructuredPostal.TYPE_*`: 1 home, 2 work). */
const placeKind = (type: number): string => (type === 1 ? 'home' : type === 2 ? 'work' : 'other');

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : typeof value === 'number' ? String(value) : '');

/** A type as handed: Android's number for one of its own (as a number, or as a row's text), else words of the other app's own (a custom label). */
function typeOf(value: unknown): { readonly code: number | null; readonly label: string } {
  if (typeof value === 'number' && Number.isInteger(value)) return { code: value, label: '' };
  const words = text(value, CONTACT_LIMITS.entryLabel);
  if (/^\d+$/.test(words)) return { code: Number(words), label: '' };
  return { code: null, label: words };
}

/** A kind and a label: Android's custom type (0) and any words are a label, under « Autre ». */
function kindOf(type: unknown, label: unknown, kinds: (code: number) => string, fallback: string): { readonly kind: string; readonly label: string } {
  const read = typeOf(type);
  if (read.code === null) return read.label ? { kind: 'other', label: read.label } : { kind: fallback, label: '' };
  const own = text(label, CONTACT_LIMITS.entryLabel);
  return read.code === 0 ? { kind: 'other', label: own } : { kind: kinds(read.code), label: '' };
}

type Row = Readonly<Record<string, unknown>>;

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);

/** What the other app handed (IntakeModule's JSON of the intent's extras), as the form's values; anything unreadable is left out. */
export function handedContact(extras: unknown): HandedContact {
  const given: Row = isRow(extras) ? extras : {};
  const rows = Array.isArray(given.data) ? given.data.filter(isRow) : [];
  const rowsOf = (mime: string): Row[] => rows.filter(row => row.mimetype === mime);

  let { firstName, lastName } = splitName(text(given.name, CONTACT_LIMITS.name * 2));
  if (!firstName && !lastName) {
    const name = rowsOf(NAME)[0];
    if (name) {
      firstName = [text(name.data2, CONTACT_LIMITS.name), text(name.data5, CONTACT_LIMITS.name)].filter(Boolean).join(' ');
      lastName = text(name.data3, CONTACT_LIMITS.name);
      if (!firstName && !lastName) ({ firstName, lastName } = splitName(text(name.data1, CONTACT_LIMITS.name * 2)));
    }
  }
  const organization = rowsOf(ORGANIZATION)[0];
  const company = text(given.company, CONTACT_LIMITS.company) || text(organization?.data1, CONTACT_LIMITS.company);
  const jobTitle = text(given.job_title, CONTACT_LIMITS.jobTitle) || text(organization?.data4, CONTACT_LIMITS.jobTitle);

  // As the form adds them: the first number a mobile, the next ones home, unless the other app says.
  const phones: Omit<PhoneEntry, 'id'>[] = [];
  const addPhone = (value: unknown, type: unknown, label: unknown): void => {
    const number = text(value, CONTACT_LIMITS.number);
    const key = phoneKey(number);
    if (!number || phones.length >= CONTACT_LIMITS.phones || (key && phones.some(phone => phoneKey(phone.number) === key))) return;
    phones.push({ number, ...kindOf(type, label, phoneKind, phones.length === 0 ? 'mobile' : 'home') });
  };
  addPhone(given.phone, given.phone_type, '');
  addPhone(given.secondary_phone, given.secondary_phone_type, '');
  addPhone(given.tertiary_phone, given.tertiary_phone_type, '');
  for (const row of rowsOf(PHONE)) addPhone(row.data1, row.data2, row.data3);

  const emails: Omit<EmailEntry, 'id'>[] = [];
  const addEmail = (value: unknown, type: unknown, label: unknown): void => {
    const address = text(value, CONTACT_LIMITS.email).replace(/^mailto:/i, '');
    if (!address || emails.length >= CONTACT_LIMITS.emails || emails.some(email => email.address.toLowerCase() === address.toLowerCase())) return;
    emails.push({ address, ...kindOf(type, label, placeKind, 'home') });
  };
  addEmail(given.email, given.email_type, '');
  addEmail(given.secondary_email, given.secondary_email_type, '');
  addEmail(given.tertiary_email, given.tertiary_email_type, '');
  for (const row of rowsOf(EMAIL)) addEmail(row.data1, row.data2, row.data3);

  // An address handed whole is its street, as Google's export's « Formatted » one; a row's parts keep their places.
  const addresses: Omit<AddressEntry, 'id'>[] = [];
  const part = (value: unknown): string => text(value, CONTACT_LIMITS.addressPart);
  const postal = text(given.postal, CONTACT_LIMITS.addressLine);
  if (postal) addresses.push({ ...kindOf(given.postal_type, '', placeKind, 'home'), street: postal, postalCode: '', city: '', region: '', country: '' });
  for (const row of rowsOf(POSTAL)) {
    if (addresses.length >= CONTACT_LIMITS.addresses) break;
    const street = [text(row.data4, CONTACT_LIMITS.addressLine), text(row.data5, CONTACT_LIMITS.addressLine)].filter(Boolean).join('\n');
    const parts = { postalCode: part(row.data9), city: part(row.data7), region: part(row.data8), country: part(row.data10) };
    const structured = street || parts.postalCode || parts.city || parts.country;
    const whole = text(row.data1, CONTACT_LIMITS.addressLine);
    if (!structured && !whole) continue;
    addresses.push({ ...kindOf(row.data2, row.data3, placeKind, 'home'), ...(structured ? { street, ...parts } : { street: whole, postalCode: '', city: '', region: '', country: '' }) });
  }

  // A birthday only when it reads as one (`1990-03-12`, Android's `--03-12` without a year).
  let birthday: string | null = null;
  for (const row of rowsOf(EVENT)) {
    if (typeOf(row.data2).code !== BIRTHDAY_TYPE) continue;
    const read = readBirthday(text(row.data1, 20));
    if (read) {
      birthday = writeBirthday(read);
      break;
    }
  }

  const websites = rowsOf(WEBSITE).map(row => text(row.data1, 2000));
  const notes = [text(given.notes, CONTACTS_TEXT_LIMITS.contact.note), ...rowsOf(NOTE).map(row => text(row.data1, CONTACTS_TEXT_LIMITS.contact.note)), ...websites].filter(Boolean);
  const note = [...new Set(notes)].join('\n').slice(0, CONTACTS_TEXT_LIMITS.contact.note);

  return { firstName: firstName.slice(0, CONTACT_LIMITS.name), lastName: lastName.slice(0, CONTACT_LIMITS.name), company, jobTitle, phones, emails, addresses, birthday, note };
}

/** The handed contact as the form's draft fields, each row given an id; a number and an e-mail row ready to fill when none came, as for any new contact. */
export function handedDraft(handed: HandedContact, newId: () => string): Pick<ContactDraft, 'firstName' | 'lastName' | 'company' | 'jobTitle' | 'phones' | 'emails' | 'addresses' | 'birthday'> {
  return {
    firstName: handed.firstName,
    lastName: handed.lastName,
    company: handed.company,
    jobTitle: handed.jobTitle,
    phones: handed.phones.length > 0 ? handed.phones.map(phone => ({ id: newId(), ...phone })) : [{ id: newId(), number: '', kind: 'mobile', label: '' }],
    emails: handed.emails.length > 0 ? handed.emails.map(email => ({ id: newId(), ...email })) : [{ id: newId(), address: '', kind: 'home', label: '' }],
    addresses: handed.addresses.map(address => ({ id: newId(), ...address })),
    birthday: handed.birthday,
  };
}
