/**
 * Contacts' two stored entities: a person (`contact`) and a label (`contactLabel`, Google's
 * « libellés »). Each is a sync record: every field travels with its own clock, and a field holding
 * a list (the phones, the emails, the addresses) is one value, written whole. Epoch ms. Rows are
 * never removed: `deletedAt` is the tombstone.
 */
import { localized, tx } from '@unlease/core/i18n';
import type { LineColor } from '@unlease/design/colors';

/** What a phone number is: Google's own kinds, so an import keeps them. */
export const PHONE_KINDS = ['mobile', 'home', 'work', 'main', 'other'] as const;
export type PhoneKind = (typeof PHONE_KINDS)[number];

export const EMAIL_KINDS = ['home', 'work', 'other'] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export const ADDRESS_KINDS = ['home', 'work', 'other'] as const;
export type AddressKind = (typeof ADDRESS_KINDS)[number];

/** A kind as stored: one of the lists above, or one a newer client added (shown as « Autre »). */
export type EntryKind = string;

export interface PhoneEntry {
  /** Keeps a row's identity while it is edited (React keys); unique within the contact. */
  readonly id: string;
  /** As typed or imported: `06 12 34 56 78`, `+33 6 12 34 56 78`. */
  readonly number: string;
  readonly kind: EntryKind;
  /** A name of the person's own (« Bureau Lyon »), shown instead of the kind's; empty for none. */
  readonly label: string;
}

export interface EmailEntry {
  readonly id: string;
  readonly address: string;
  readonly kind: EntryKind;
  readonly label: string;
}

export interface AddressEntry {
  readonly id: string;
  readonly kind: EntryKind;
  readonly label: string;
  /** The street, possibly on several lines (a building, a floor). */
  readonly street: string;
  readonly postalCode: string;
  readonly city: string;
  readonly region: string;
  readonly country: string;
}

export interface Contact {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly company: string;
  readonly jobTitle: string;
  readonly phones: readonly PhoneEntry[];
  readonly emails: readonly EmailEntry[];
  readonly addresses: readonly AddressEntry[];
  /** `1990-03-12`, or `--03-12` when the year is not known (vCard's form); null for none. */
  readonly birthday: string | null;
  /** Free text the person keeps about them, merged word by word. */
  readonly note: string;
  readonly labelIds: readonly string[];
  /** Starred (Google's « Favoris »): the favourites' row, the quick calls widget. */
  readonly favorite: boolean;
  /** The photo's blob (`/api/blobs/<id>`); null for none (initials on a pebble). */
  readonly photoId: string | null;
  /** The server has the photo: other devices may show it. */
  readonly photoUploaded: boolean;
  readonly photoMime: string;
  /** Merged into another contact (« Fusionner les doublons »): it waits in the bin, and what pointed at it (a mention) follows to that one. */
  readonly mergedInto: string | null;
  readonly trashedAt: number | null;
  readonly createdAt: number;
  readonly deletedAt: number | null;
  /** The newest field clock's time; not a synced field. */
  readonly editedAt: number;
}

export interface ContactLabel {
  readonly id: string;
  readonly name: string;
  readonly color: LineColor;
  readonly position: string;
  readonly createdAt: number;
  readonly deletedAt: number | null;
}

/** What a contact's fields read as before they are first written: a rollback writes them back where a backup never had them. */
export const CONTACT_FIELD_DEFAULTS: Readonly<Record<string, unknown>> = {
  company: '',
  jobTitle: '',
  phones: [],
  emails: [],
  addresses: [],
  birthday: null,
  note: '',
  labelIds: [],
  favorite: false,
  photoId: null,
  photoUploaded: false,
  photoMime: '',
  mergedInto: null,
  trashedAt: null,
};

/** The most a contact holds; an import past them keeps the first. */
export const CONTACT_LIMITS = {
  name: 200,
  company: 200,
  jobTitle: 200,
  phones: 20,
  number: 40,
  emails: 20,
  email: 320,
  addresses: 10,
  addressLine: 500,
  addressPart: 120,
  entryLabel: 40,
  labels: 50,
  labelName: 60,
} as const;

/** The longest typed text each merged field holds. */
export const CONTACTS_TEXT_LIMITS = {
  contact: { note: 20_000 },
} as const;

/** The kinds' names, in the interface's language as they are read. */
export const PHONE_KIND_NAMES: Readonly<Record<PhoneKind, string>> = localized({
  mobile: tx('Mobile'),
  home: tx('Home [address]'),
  work: tx('Work'),
  main: tx('Main'),
  other: tx('Other'),
});

export const PLACE_KIND_NAMES: Readonly<Record<EmailKind, string>> = localized({
  home: tx('Personal'),
  work: tx('Work'),
  other: tx('Other'),
});

/** A contact with nothing in it (a new one, before its first field). */
export function emptyContact(id: string, createdAt: number): Contact {
  return {
    id,
    firstName: '',
    lastName: '',
    company: '',
    jobTitle: '',
    phones: [],
    emails: [],
    addresses: [],
    birthday: null,
    note: '',
    labelIds: [],
    favorite: false,
    photoId: null,
    photoUploaded: false,
    photoMime: '',
    mergedInto: null,
    trashedAt: null,
    createdAt,
    deletedAt: null,
    editedAt: createdAt,
  };
}

/** Alive and out of the bin: what the lists show. */
export function isLive(contact: Contact): boolean {
  return contact.deletedAt === null && contact.trashedAt === null;
}

/** How long a contact stays in the bin before the server deletes it for good, as the other apps': a week. */
export const TRASH_RETENTION_DAYS = 7;
