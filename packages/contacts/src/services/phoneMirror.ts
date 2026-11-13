/**
 * The address book as the phone's own contacts see it (« Copier dans les contacts du téléphone »,
 * the phone app's mirror: `mobile/contacts/src/app/phoneMirror.ts`): one row per live person, with
 * what other apps of the phone read (the dialer's caller ID, WhatsApp's and Messages' names, the
 * keyboard's suggestions), written one way under the app's own Android account. The fields are named
 * by what they are; the Kotlin side maps them onto `ContactsContract`'s kinds.
 *
 * Left out: the note (any app holding the contacts permission reads the phone's address book, and a
 * note is the person's own), the labels (Android's groups belong to an account's own sync), and the
 * people in the bin or merged into another.
 */
import { fingerprint, type MirrorRow } from '@unlease/core/services/mirror';
import type { Contact, EntryKind } from '../models/contacts';
import { readBirthday, writeBirthday } from './birthdays';
import { shownNumber } from './phones';

/** A kind as Android names its own: one of these, or `custom` with the person's label. */
export type MirrorKind = 'mobile' | 'home' | 'work' | 'main' | 'other' | 'custom';

export interface MirrorEntry {
  readonly value: string;
  readonly kind: MirrorKind;
  /** The person's own name for it (`custom`); '' otherwise. */
  readonly label: string;
}

export interface MirrorAddress {
  readonly kind: MirrorKind;
  readonly label: string;
  readonly street: string;
  readonly postalCode: string;
  readonly city: string;
  readonly region: string;
  readonly country: string;
}

export interface MirroredContact extends MirrorRow {
  readonly firstName: string;
  readonly lastName: string;
  readonly company: string;
  readonly jobTitle: string;
  readonly phones: readonly MirrorEntry[];
  readonly emails: readonly MirrorEntry[];
  readonly addresses: readonly MirrorAddress[];
  /** `1990-03-12`, or `--03-12` without the year (as Android stores a birthday); null for none. */
  readonly birthday: string | null;
  readonly starred: boolean;
}

/** The photo a row should carry: its blob, or null. Kept apart from the fingerprint: a photo is fetched, and may come later. */
export interface MirroredPhoto {
  readonly id: string;
  readonly photoId: string | null;
}

const KINDS: Readonly<Record<string, MirrorKind>> = { mobile: 'mobile', home: 'home', work: 'work', main: 'main', other: 'other' };

/** Android's kind for one of ours (`allowed` those Android has for this field), the person's label winning. */
function kindOf(kind: EntryKind, label: string, allowed: readonly MirrorKind[]): { kind: MirrorKind; label: string } {
  const own = label.trim();
  if (own) return { kind: 'custom', label: own };
  const known = KINDS[kind];
  return { kind: known && allowed.includes(known) ? known : 'other', label: '' };
}

/** Whether the person shows on the phone: alive, out of the bin, not merged into another. */
export const isMirrored = (contact: Contact): boolean => contact.deletedAt === null && contact.trashedAt === null && !contact.mergedInto;

/**
 * Each person kept, as the phone's address book holds them. `region` is the country of the numbers
 * written without their `+` (Réglages' « Indicatif par défaut »): the phone gets them whole, so a call
 * coming in from `+33 6 12 34 56 78` finds `06 12 34 56 78`.
 */
export function mirroredContacts(contacts: Iterable<Contact>, region: string | null): MirroredContact[] {
  const out: MirroredContact[] = [];
  for (const contact of contacts) {
    if (!isMirrored(contact)) continue;
    const phones = contact.phones
      .filter(entry => /[0-9]/.test(entry.number))
      .map(entry => ({ value: shownNumber(entry.number, region), ...kindOf(entry.kind, entry.label, ['mobile', 'home', 'work', 'main', 'other']) }));
    const emails = contact.emails.filter(entry => entry.address.trim()).map(entry => ({ value: entry.address.trim(), ...kindOf(entry.kind, entry.label, ['home', 'work', 'other']) }));
    const addresses = contact.addresses
      .filter(entry => [entry.street, entry.postalCode, entry.city, entry.region, entry.country].some(part => part.trim()))
      .map(entry => ({
        ...kindOf(entry.kind, entry.label, ['home', 'work', 'other']),
        street: entry.street.trim(),
        postalCode: entry.postalCode.trim(),
        city: entry.city.trim(),
        region: entry.region.trim(),
        country: entry.country.trim(),
      }));
    const birthday = readBirthday(contact.birthday);
    const fields = {
      firstName: contact.firstName.trim(),
      lastName: contact.lastName.trim(),
      company: contact.company.trim(),
      jobTitle: contact.jobTitle.trim(),
      phones,
      emails,
      addresses,
      birthday: birthday ? writeBirthday(birthday) : null,
      starred: contact.favorite,
    };
    out.push({ id: contact.id, fingerprint: fingerprint(fields), ...fields });
  }
  return out;
}

/** The photos the kept people should carry, by contact. */
export function mirroredPhotos(contacts: Iterable<Contact>): MirroredPhoto[] {
  const out: MirroredPhoto[] = [];
  for (const contact of contacts) if (isMirrored(contact)) out.push({ id: contact.id, photoId: contact.photoId });
  return out;
}
