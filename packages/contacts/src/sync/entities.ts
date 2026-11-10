/**
 * Contacts' records to and from their entities. A record may be partial (a field added later, a
 * contact seen before its labels): reading fills in defaults and never throws.
 */
import { editedAt, type Fields, type SyncRecord } from '@unlease/core/sync/record';
import { isLineColor } from '@unlease/design/colors';
import type { AddressEntry, Contact, ContactLabel, EmailEntry, PhoneEntry } from '../models/contacts';
// Declares Contacts' record types to the sync before any record is read.
import { BIRTHDAY_PATTERN } from './types';

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const asTime = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const asNullableTime = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const asKind = (value: unknown): string => (typeof value === 'string' && value ? value : 'other');

function asList<T>(value: unknown, read: (raw: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    if (typeof entry !== 'object' || entry === null || typeof (entry as { id?: unknown }).id !== 'string') return [];
    const one = read(entry as Record<string, unknown>);
    return one ? [one] : [];
  });
}

const asPhone = (raw: Record<string, unknown>): PhoneEntry => ({ id: raw.id as string, number: asString(raw.number), kind: asKind(raw.kind), label: asString(raw.label) });
const asEmail = (raw: Record<string, unknown>): EmailEntry => ({ id: raw.id as string, address: asString(raw.address), kind: asKind(raw.kind), label: asString(raw.label) });
const asAddress = (raw: Record<string, unknown>): AddressEntry => ({
  id: raw.id as string,
  kind: asKind(raw.kind),
  label: asString(raw.label),
  street: asString(raw.street),
  postalCode: asString(raw.postalCode),
  city: asString(raw.city),
  region: asString(raw.region),
  country: asString(raw.country),
});

export function contactFromRecord(record: SyncRecord): Contact {
  const f = record.fields;
  return {
    id: record.id,
    firstName: asString(f.firstName),
    lastName: asString(f.lastName),
    company: asString(f.company),
    jobTitle: asString(f.jobTitle),
    phones: asList(f.phones, asPhone),
    emails: asList(f.emails, asEmail),
    addresses: asList(f.addresses, asAddress),
    birthday: typeof f.birthday === 'string' && BIRTHDAY_PATTERN.test(f.birthday) ? f.birthday : null,
    note: asString(f.note),
    labelIds: Array.isArray(f.labelIds) ? f.labelIds.filter((value): value is string => typeof value === 'string') : [],
    favorite: f.favorite === true,
    photoId: typeof f.photoId === 'string' && f.photoId ? f.photoId : null,
    photoUploaded: f.photoUploaded === true,
    photoMime: asString(f.photoMime),
    mergedInto: typeof f.mergedInto === 'string' && f.mergedInto ? f.mergedInto : null,
    trashedAt: asNullableTime(f.trashedAt),
    createdAt: asTime(f.createdAt),
    deletedAt: asNullableTime(f.deletedAt),
    editedAt: editedAt(record),
  };
}

/** A contact's synced fields, whole (a new contact, an import). */
export function contactFields(contact: Omit<Contact, 'id' | 'editedAt'>): Fields {
  return {
    firstName: contact.firstName,
    lastName: contact.lastName,
    company: contact.company,
    jobTitle: contact.jobTitle,
    phones: contact.phones.map(entry => ({ ...entry })),
    emails: contact.emails.map(entry => ({ ...entry })),
    addresses: contact.addresses.map(entry => ({ ...entry })),
    birthday: contact.birthday,
    note: contact.note,
    labelIds: [...contact.labelIds],
    favorite: contact.favorite,
    photoId: contact.photoId,
    photoUploaded: contact.photoUploaded,
    photoMime: contact.photoMime,
    ...(contact.mergedInto ? { mergedInto: contact.mergedInto } : {}),
    trashedAt: contact.trashedAt,
    createdAt: contact.createdAt,
    deletedAt: contact.deletedAt,
  };
}

export function contactLabelFromRecord(record: SyncRecord): ContactLabel {
  const f = record.fields;
  return {
    id: record.id,
    name: asString(f.name),
    color: isLineColor(f.color) ? f.color : 'grey',
    position: typeof f.position === 'string' && f.position ? f.position : 'a0',
    createdAt: asTime(f.createdAt),
    deletedAt: asNullableTime(f.deletedAt),
  };
}

export function contactLabelFields(label: Omit<ContactLabel, 'id'>): Fields {
  return { name: label.name, color: label.color, position: label.position, createdAt: label.createdAt, deletedAt: label.deletedAt };
}
