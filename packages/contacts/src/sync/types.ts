/**
 * Contacts' record types, declared to the suite's sync (`@unlease/core/sync/schema`) when this
 * module loads: every program that reads contacts imports it through `sync/entities` (Pages' too,
 * which mentions them). Adding a field is safe; renaming or removing one is a migration on every
 * device.
 */
import {
  bool,
  defineRecordTypes,
  id,
  ids,
  isObject,
  nullableId,
  nullableTime,
  position,
  str,
  time,
  type Check,
} from '@unlease/core/sync/schema';
import { isLineColor } from '@unlease/design/colors';
import { CONTACT_FIELD_DEFAULTS, CONTACT_LIMITS, CONTACTS_TEXT_LIMITS } from '../models/contacts';

/** A kind key (`mobile`, `work`), or one a newer client added: passed on, shown as « Autre ». */
const kindKey = (value: unknown): boolean => typeof value === 'string' && /^[a-z]{1,20}$/.test(value);
const entryLabel = str(CONTACT_LIMITS.entryLabel);
const part = str(CONTACT_LIMITS.addressPart);

const phone = (value: unknown): boolean => isObject(value) && id(value.id) && str(CONTACT_LIMITS.number)(value.number) && kindKey(value.kind) && entryLabel(value.label);
const email = (value: unknown): boolean => isObject(value) && id(value.id) && str(CONTACT_LIMITS.email)(value.address) && kindKey(value.kind) && entryLabel(value.label);
const address = (value: unknown): boolean =>
  isObject(value) &&
  id(value.id) &&
  kindKey(value.kind) &&
  entryLabel(value.label) &&
  str(CONTACT_LIMITS.addressLine)(value.street) &&
  part(value.postalCode) &&
  part(value.city) &&
  part(value.region) &&
  part(value.country);

/** A list of entries, each with its own id, bounded. */
const entries =
  (max: number, entry: (value: unknown) => boolean): Check =>
  value =>
    Array.isArray(value) && value.length <= max && value.every(entry) && new Set(value.map(item => (item as { id: string }).id)).size === value.length;

/** `1990-03-12`, or `--03-12` without a year; a month and a day that exist. */
export const BIRTHDAY_PATTERN = /^(\d{4}|-)-(\d{2})-(\d{2})$/;
const birthday: Check = value => {
  if (value === null) return true;
  if (typeof value !== 'string') return false;
  const match = BIRTHDAY_PATTERN.exec(value);
  if (!match) return false;
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
};

const lineColor: Check = isLineColor;
const typed = (limit: number) => ({ limit });

export const CONTACTS_RECORD_TYPES = defineRecordTypes({
  contact: {
    app: 'contacts',
    fields: {
      firstName: str(CONTACT_LIMITS.name),
      lastName: str(CONTACT_LIMITS.name),
      company: str(CONTACT_LIMITS.company),
      jobTitle: str(CONTACT_LIMITS.jobTitle),
      phones: entries(CONTACT_LIMITS.phones, phone),
      emails: entries(CONTACT_LIMITS.emails, email),
      addresses: entries(CONTACT_LIMITS.addresses, address),
      birthday,
      note: str(CONTACTS_TEXT_LIMITS.contact.note),
      labelIds: ids(CONTACT_LIMITS.labels),
      favorite: bool,
      photoId: nullableId,
      photoUploaded: bool,
      photoMime: str(127),
      mergedInto: nullableId,
      trashedAt: nullableTime,
      createdAt: time,
      deletedAt: nullableTime,
    },
    merged: { note: typed(CONTACTS_TEXT_LIMITS.contact.note) },
    defaults: CONTACT_FIELD_DEFAULTS,
  },
  contactLabel: {
    app: 'contacts',
    fields: {
      name: str(CONTACT_LIMITS.labelName),
      color: lineColor,
      position,
      createdAt: time,
      deletedAt: nullableTime,
    },
  },
});

export type ContactsRecordType = keyof typeof CONTACTS_RECORD_TYPES;

export const CONTACTS_TYPES = Object.keys(CONTACTS_RECORD_TYPES) as readonly ContactsRecordType[];

/** One of Contacts' own types: a store may also hold another app's records. */
export function isContactsType(value: string): value is ContactsRecordType {
  return Object.hasOwn(CONTACTS_RECORD_TYPES, value);
}
