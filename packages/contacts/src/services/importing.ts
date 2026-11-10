/**
 * Importing contacts (Google's vCard or CSV export, Takeout, the phone's own contacts) into the
 * address book. Each source is read into `ImportedContact`s (`vcard.ts`, `googleCsv.ts`, the phone's
 * reader); `planImport` then says what to write, as one batch: who is new, who is already here
 * (the same email, the same number, or the same name) and only gains what they lacked, and the
 * labels to make. Nothing already here is overwritten. Photos come after (a picture's bytes are
 * uploaded, an address is fetched by the server): `planImport` says whose photo to take.
 */
import { positionBetween } from '@unlease/core/services/fractionalIndex';
import { foldText } from '@unlease/core/services/search';
import { LINE_COLORS, type LineColor } from '@unlease/design/colors';
import { CONTACT_LIMITS, type AddressEntry, type Contact, type ContactLabel, type EmailEntry, type PhoneEntry } from '../models/contacts';
import { contactFields, contactLabelFields } from '../sync/entities';
import type { Fields } from '@unlease/core/sync/record';
import { isEmptyAddress } from './addresses';
import { parseGoogleCsv } from './googleCsv';
import { phoneKey, samePhone } from './phones';
import { parseVCards } from './vcard';

/** A number, an email: its value, its kind (`mobile`, `work`…) and a label of the person's own. */
export interface ImportedEntry {
  readonly value: string;
  readonly kind: string;
  readonly label: string;
}

export type ImportedAddress = Omit<AddressEntry, 'id'>;

/** A photo to take: its bytes (a vCard's, the phone's) or an address the server fetches (Google's). */
export type ImportedPhoto = { readonly kind: 'data'; readonly mime: string; readonly base64: string } | { readonly kind: 'url'; readonly url: string } | { readonly kind: 'file'; readonly uri: string; readonly mime: string };

export interface ImportedContact {
  readonly firstName: string;
  readonly lastName: string;
  readonly company: string;
  readonly jobTitle: string;
  readonly note: string;
  readonly birthday: string | null;
  readonly favorite: boolean;
  readonly photo: ImportedPhoto | null;
  readonly phones: readonly ImportedEntry[];
  readonly emails: readonly ImportedEntry[];
  readonly addresses: readonly ImportedAddress[];
  /** Label names (Google's), matched to the address book's by name. */
  readonly labels: readonly string[];
}

export type ImportFormat = 'vcard' | 'csv';

/** What a file holds, by its name and its first characters; null for neither. */
export function importFormat(name: string, text: string): ImportFormat | null {
  if (/BEGIN:VCARD/i.test(text.slice(0, 2000))) return 'vcard';
  if (/\.vcf$/i.test(name)) return 'vcard';
  if (/\.csv$/i.test(name) || /^\uFEFF?[^\n]*(First Name|Given Name)/i.test(text)) return 'csv';
  return null;
}

/** The contacts of a `.vcf` or a Google CSV; null for a file that is neither. */
export function readContactsFile(name: string, text: string): ImportedContact[] | null {
  const format = importFormat(name, text);
  if (format === 'vcard') return parseVCards(text);
  if (format === 'csv') return parseGoogleCsv(text);
  return null;
}

// ── the plan ────────────────────────────────────────────────────────────────

export interface PlannedWrite {
  /** The contact's id: a new one, or one already here. */
  readonly id: string;
  /** Every field of a new contact; only those that change for one already here. */
  readonly fields: Fields;
  /** Its photo to take once written: it had none. */
  readonly photo: ImportedPhoto | null;
}

export interface ImportPlan {
  readonly creates: readonly PlannedWrite[];
  readonly updates: readonly PlannedWrite[];
  /** New labels, their fields whole. */
  readonly labels: readonly { readonly id: string; readonly fields: Fields }[];
  /** Already here with nothing to add. */
  readonly unchanged: number;
  /** How many photos the plan takes. */
  readonly photos: number;
}

const emailKey = (address: string): string => address.trim().toLowerCase();
const nameKey = (contact: Pick<Contact, 'firstName' | 'lastName'>): string => foldText(`${contact.firstName} ${contact.lastName}`.replace(/\s+/g, ' ').trim());

const cut = (value: string, max: number): string => value.trim().slice(0, max);

/** The same address, however it was typed. */
function sameAddress(a: Omit<AddressEntry, 'id' | 'kind' | 'label'>, b: Omit<AddressEntry, 'id' | 'kind' | 'label'>): boolean {
  const key = (address: typeof a): string => foldText([address.street, address.postalCode, address.city].join(' ').replace(/[\s,.]+/g, ' ').trim());
  return key(a) === key(b);
}

/** A contact being completed: by an import, or by a merge (`duplicates.ts`). */
export interface Draft {
  id: string;
  existing: Contact | null;
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  note: string;
  birthday: string | null;
  favorite: boolean;
  phones: PhoneEntry[];
  emails: EmailEntry[];
  addresses: AddressEntry[];
  labelIds: string[];
  photo: ImportedPhoto | null;
  hasPhoto: boolean;
}

export function draftOf(contact: Contact): Draft {
  return {
    id: contact.id,
    existing: contact,
    firstName: contact.firstName,
    lastName: contact.lastName,
    company: contact.company,
    jobTitle: contact.jobTitle,
    note: contact.note,
    birthday: contact.birthday,
    favorite: contact.favorite,
    phones: [...contact.phones],
    emails: [...contact.emails],
    addresses: [...contact.addresses],
    labelIds: [...contact.labelIds],
    photo: null,
    hasPhoto: contact.photoId !== null,
  };
}

/** Adds what `from` holds and `into` lacks; never overwrites. `region` reads national numbers (`samePhone`). */
export function fill(into: Draft, from: ImportedContact, labelIds: readonly string[], newId: () => string, region: string | null = null): void {
  if (!into.firstName && !into.lastName) {
    into.firstName = cut(from.firstName, CONTACT_LIMITS.name);
    into.lastName = cut(from.lastName, CONTACT_LIMITS.name);
  }
  if (!into.company) into.company = cut(from.company, CONTACT_LIMITS.company);
  if (!into.jobTitle) into.jobTitle = cut(from.jobTitle, CONTACT_LIMITS.jobTitle);
  if (!into.note.trim()) into.note = from.note.trim();
  else if (from.note.trim() && !into.note.includes(from.note.trim())) into.note = `${into.note.trim()}\n\n${from.note.trim()}`;
  into.birthday ??= from.birthday;
  into.favorite ||= from.favorite;
  for (const phone of from.phones) {
    if (into.phones.length >= CONTACT_LIMITS.phones || !/[0-9]/.test(phone.value)) continue;
    if (into.phones.some(entry => samePhone(entry.number, phone.value, region) || entry.number.trim() === phone.value.trim())) continue;
    into.phones.push({ id: newId(), number: cut(phone.value, CONTACT_LIMITS.number), kind: phone.kind, label: cut(phone.label, CONTACT_LIMITS.entryLabel) });
  }
  for (const email of from.emails) {
    if (into.emails.length >= CONTACT_LIMITS.emails || !email.value.includes('@')) continue;
    if (into.emails.some(entry => emailKey(entry.address) === emailKey(email.value))) continue;
    into.emails.push({ id: newId(), address: cut(email.value, CONTACT_LIMITS.email), kind: email.kind, label: cut(email.label, CONTACT_LIMITS.entryLabel) });
  }
  for (const address of from.addresses) {
    if (into.addresses.length >= CONTACT_LIMITS.addresses || isEmptyAddress(address)) continue;
    if (into.addresses.some(entry => sameAddress(entry, address))) continue;
    into.addresses.push({
      id: newId(),
      kind: address.kind,
      label: cut(address.label, CONTACT_LIMITS.entryLabel),
      street: cut(address.street, CONTACT_LIMITS.addressLine),
      postalCode: cut(address.postalCode, CONTACT_LIMITS.addressPart),
      city: cut(address.city, CONTACT_LIMITS.addressPart),
      region: cut(address.region, CONTACT_LIMITS.addressPart),
      country: cut(address.country, CONTACT_LIMITS.addressPart),
    });
  }
  for (const id of labelIds) if (!into.labelIds.includes(id) && into.labelIds.length < CONTACT_LIMITS.labels) into.labelIds.push(id);
  if (!into.hasPhoto && !into.photo && from.photo) into.photo = from.photo;
}

const sameList = (a: readonly unknown[], b: readonly unknown[]): boolean => JSON.stringify(a) === JSON.stringify(b);

/** What changed of a contact already here, field by field. */
export function patchOf(draft: Draft, existing: Contact): Fields {
  const patch: Fields = {};
  const keys = ['firstName', 'lastName', 'company', 'jobTitle', 'note', 'birthday', 'favorite'] as const;
  for (const key of keys) if (draft[key] !== existing[key]) patch[key] = draft[key];
  if (!sameList(draft.phones, existing.phones)) patch.phones = draft.phones.map(entry => ({ ...entry }));
  if (!sameList(draft.emails, existing.emails)) patch.emails = draft.emails.map(entry => ({ ...entry }));
  if (!sameList(draft.addresses, existing.addresses)) patch.addresses = draft.addresses.map(entry => ({ ...entry }));
  if (!sameList(draft.labelIds, existing.labelIds)) patch.labelIds = [...draft.labelIds];
  return patch;
}

export interface PlanOptions {
  readonly now: number;
  /** Mints ids (`createId`), for contacts, their entries and labels. */
  readonly newId: () => string;
  /** The person's « Indicatif par défaut »: a national number's country, so numbers of two countries never meet. */
  readonly region?: string | null;
}

/**
 * What to write for `imported`, given the address book (`contacts`, `labels`, every record, live or
 * not: only live ones are matched). A person imported twice in one file is one contact.
 */
export function planImport(contacts: readonly Contact[], labels: readonly ContactLabel[], imported: readonly ImportedContact[], options: PlanOptions): ImportPlan {
  const { now, newId } = options;
  const region = options.region ?? null;
  const live = contacts.filter(contact => contact.deletedAt === null && contact.trashedAt === null);
  const drafts: Draft[] = live.map(draftOf);
  const byEmail = new Map<string, Draft>();
  // Numbers grouped by their last digits; in a group, `samePhone` picks the one that is the same.
  const byPhone = new Map<string, { number: string; draft: Draft }[]>();
  const byName = new Map<string, Draft>();
  const phoneOwner = (number: string): Draft | undefined => byPhone.get(phoneKey(number))?.find(entry => samePhone(entry.number, number, region))?.draft;
  const index = (draft: Draft): void => {
    for (const email of draft.emails) if (email.address.trim()) byEmail.set(emailKey(email.address), draft);
    for (const phone of draft.phones) {
      const key = phoneKey(phone.number);
      if (key.length < 6) continue;
      const group = byPhone.get(key) ?? [];
      if (!group.some(entry => entry.draft === draft && entry.number === phone.number)) group.push({ number: phone.number, draft });
      byPhone.set(key, group);
    }
    const name = nameKey(draft);
    if (name && !byName.has(name)) byName.set(name, draft);
  };
  drafts.forEach(index);

  // Labels by folded name; a new name makes a label, after the last one, in the palette's turn.
  const liveLabels = labels.filter(label => label.deletedAt === null);
  const labelByName = new Map(liveLabels.map(label => [foldText(label.name.trim()), label.id]));
  const newLabels: { id: string; fields: Fields }[] = [];
  let lastPosition = [...liveLabels].map(label => label.position).sort().at(-1) ?? null;
  const labelId = (name: string): string | null => {
    const clean = name.trim().slice(0, CONTACT_LIMITS.labelName);
    if (!clean) return null;
    const key = foldText(clean);
    const known = labelByName.get(key);
    if (known) return known;
    const id = newId();
    const position = positionBetween(lastPosition, null);
    lastPosition = position;
    const color: LineColor = LINE_COLORS[(liveLabels.length + newLabels.length) % LINE_COLORS.length]!;
    newLabels.push({ id, fields: contactLabelFields({ name: clean, color, position, createdAt: now, deletedAt: null }) });
    labelByName.set(key, id);
    return id;
  };

  const created: Draft[] = [];
  const matched = new Set<Draft>();
  for (const person of imported) {
    const ids = person.labels.map(labelId).filter((id): id is string => id !== null);
    const name = nameKey(person);
    const match =
      person.emails.map(entry => byEmail.get(emailKey(entry.value))).find(Boolean) ??
      person.phones.map(entry => phoneOwner(entry.value)).find(Boolean) ??
      (name ? byName.get(name) : undefined);
    if (match) {
      if (match.existing) matched.add(match);
      fill(match, person, ids, newId, region);
      index(match);
      continue;
    }
    const draft: Draft = { id: newId(), existing: null, firstName: '', lastName: '', company: '', jobTitle: '', note: '', birthday: null, favorite: false, phones: [], emails: [], addresses: [], labelIds: [], photo: null, hasPhoto: false };
    fill(draft, person, ids, newId, region);
    created.push(draft);
    index(draft);
  }

  const creates: PlannedWrite[] = created.map(draft => ({
    id: draft.id,
    fields: contactFields({
      firstName: draft.firstName,
      lastName: draft.lastName,
      company: draft.company,
      jobTitle: draft.jobTitle,
      phones: draft.phones,
      emails: draft.emails,
      addresses: draft.addresses,
      birthday: draft.birthday,
      note: draft.note,
      labelIds: draft.labelIds,
      favorite: draft.favorite,
      photoId: null,
      photoUploaded: false,
      photoMime: '',
      mergedInto: null,
      trashedAt: null,
      createdAt: now,
      deletedAt: null,
    }),
    photo: draft.photo,
  }));
  const updates: PlannedWrite[] = [];
  let unchanged = 0;
  for (const draft of matched) {
    const patch = patchOf(draft, draft.existing!);
    if (Object.keys(patch).length === 0 && !draft.photo) {
      unchanged += 1;
      continue;
    }
    updates.push({ id: draft.id, fields: patch, photo: draft.photo });
  }
  return {
    creates,
    updates,
    labels: newLabels,
    unchanged,
    photos: [...creates, ...updates].filter(write => write.photo !== null).length,
  };
}
