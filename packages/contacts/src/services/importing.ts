/**
 * Importing contacts (Google's vCard or CSV export, Takeout, the phone's own contacts) into the
 * address book. Each source is read into `ImportedContact`s (`vcard.ts`, `googleCsv.ts`, the phone's
 * reader; for the wizard, those with nothing to know them by too, `readImportFile`); `planImport`
 * then says what to write, as one batch: who is new, who is already here (the same email, the same
 * number, or the same name) and only gains what they lacked, and the labels to make; and what becomes
 * of each person read (`ImportPlan.people`), for the wizard's preview (`importPreview.ts`). The
 * person's choices shape it (`PlanOptions`: someone left out, those here left as they are, the
 * file's labels one by one, the photos, Google's stars). Nothing already here is overwritten. Photos
 * come after (a picture's bytes are uploaded, an address is fetched by the server): `planImport` says
 * whose photo to take. `forgetImport` takes an import back.
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

/** What a file read for the import's wizard holds. */
export interface ReadFile {
  readonly format: ImportFormat;
  /** Everyone it holds, in order, those with nothing to know them by too (`isAnonymous`): the preview says why they stay out. */
  readonly people: readonly ImportedContact[];
}

/** A `.vcf` or a Google CSV read for the wizard; null for a file that is neither. */
export function readImportFile(name: string, text: string): ReadFile | null {
  const format = importFormat(name, text);
  if (format === null) return null;
  return { format, people: format === 'vcard' ? parseVCards(text, { anonymous: true }) : parseGoogleCsv(text, { anonymous: true }) };
}

/** Nothing to know them by: no name, company, number nor email. Such a person is never imported. */
export function isAnonymous(person: ImportedContact): boolean {
  return !person.firstName.trim() && !person.lastName.trim() && !person.company.trim() && !person.phones.some(entry => entry.value.trim()) && !person.emails.some(entry => entry.value.trim());
}

// ── the file's labels ───────────────────────────────────────────────────────

/** The labels Google and Android keep for themselves, should one come through: never a label here. */
const SYSTEM_LABEL = /^\*?\s*(my ?contacts|starred( in android)?|favou?rites|system group:.*)$/i;
/** The label Google Contacts adds to everyone of each file it imports (« Imported on 3/12/2024 »). */
const IMPORT_MARKER = /^(imported on|import(é|e)e?s? (le|du))\s/i;

const labelName = (name: string): string => name.trim().slice(0, CONTACT_LIMITS.labelName);
const labelKey = (name: string): string => foldText(labelName(name));

/** One label the file's people wear, as the wizard offers it. */
export interface FileLabel {
  /** Its name folded: the plan's choice (`PlanOptions.labels`). */
  readonly key: string;
  readonly name: string;
  /** How many people of the file wear it. */
  readonly people: number;
  /** The address book's label of that name, which they join; null: it would be made. */
  readonly existing: string | null;
  /** Google's « Imported on … »: what the file was, not who they are. Left out at first. */
  readonly marker: boolean;
}

/** Every label of the file, in the order they first come, counted; the system's left out. */
export function fileLabels(imported: readonly ImportedContact[], labels: readonly ContactLabel[]): FileLabel[] {
  const here = new Map(labels.filter(label => label.deletedAt === null).map(label => [labelKey(label.name), label.id]));
  const found = new Map<string, { name: string; people: number }>();
  for (const person of imported) {
    if (isAnonymous(person)) continue;
    const worn = new Set<string>();
    for (const name of person.labels) {
      const clean = labelName(name);
      const key = foldText(clean);
      if (!key || SYSTEM_LABEL.test(clean) || worn.has(key)) continue;
      worn.add(key);
      const entry = found.get(key) ?? { name: clean, people: 0 };
      entry.people += 1;
      found.set(key, entry);
    }
  }
  return [...found].map(([key, { name, people }]) => ({ key, name, people, existing: here.get(key) ?? null, marker: IMPORT_MARKER.test(name) }));
}

/** The labels brought at first: all but Google's import markers. */
export function defaultLabels(labels: readonly FileLabel[]): Set<string> {
  return new Set(labels.filter(label => !label.marker).map(label => label.key));
}

// ── the plan ────────────────────────────────────────────────────────────────

export interface PlannedWrite {
  /** The contact's id: a new one, or one already here. */
  readonly id: string;
  /** Every field of a new contact; only those that change for one already here. */
  readonly fields: Fields;
  /** Its photo to take once written: it had none. */
  readonly photo: ImportedPhoto | null;
  /** For one already here: what those fields held before (`forgetImport` writes them back). */
  readonly before?: Fields;
}

/** What one person adds to a contact (counted, or said). */
export interface Gains {
  readonly name: boolean;
  readonly company: boolean;
  readonly jobTitle: boolean;
  readonly note: boolean;
  readonly birthday: boolean;
  readonly favorite: boolean;
  readonly phones: number;
  readonly emails: number;
  readonly addresses: number;
  readonly labels: number;
  readonly photo: boolean;
}

/** Whether it adds anything at all. */
export function hasGains(gains: Gains): boolean {
  return Object.values(gains).some(value => value === true || (typeof value === 'number' && value > 0));
}

/**
 * What becomes of one person read (`ImportPlan.people`, in the file's order): a new contact; one
 * already here completed (`update`) or not (`same`: nothing to add, or `missed` what it would have
 * gained, the completing turned off); the same person as an earlier one of the file (`joined`, by
 * their index), whose contact gains what they add; no name, number nor email (`anonymous`); left out
 * by the person (`left`).
 */
export type PersonFate =
  | { readonly kind: 'new'; readonly id: string }
  | { readonly kind: 'update'; readonly id: string; readonly gains: Gains }
  | { readonly kind: 'same'; readonly id: string; readonly missed: Gains | null }
  | { readonly kind: 'joined'; readonly id: string; readonly into: number; readonly gains: Gains }
  | { readonly kind: 'anonymous' }
  | { readonly kind: 'left' };

export interface ImportPlan {
  readonly creates: readonly PlannedWrite[];
  readonly updates: readonly PlannedWrite[];
  /** New labels, their fields whole. */
  readonly labels: readonly { readonly id: string; readonly fields: Fields }[];
  /** Already here with nothing to add. */
  readonly unchanged: number;
  /** How many photos the plan takes. */
  readonly photos: number;
  /** What becomes of each person of `imported`, in order. */
  readonly people: readonly PersonFate[];
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

/** A copy to fill and throw away: what a person would add, the completing turned off. */
const copyDraft = (draft: Draft): Draft => ({ ...draft, phones: [...draft.phones], emails: [...draft.emails], addresses: [...draft.addresses], labelIds: [...draft.labelIds] });

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

/** What `fill` added to a draft, from what it held before (`copyDraft`) to what it holds now. */
function gainsOf(before: Draft, after: Draft): Gains {
  return {
    name: !before.firstName && !before.lastName && !!(after.firstName || after.lastName),
    company: before.company !== after.company,
    jobTitle: before.jobTitle !== after.jobTitle,
    note: before.note !== after.note,
    birthday: before.birthday !== after.birthday,
    favorite: before.favorite !== after.favorite,
    phones: after.phones.length - before.phones.length,
    emails: after.emails.length - before.emails.length,
    addresses: after.addresses.length - before.addresses.length,
    labels: after.labelIds.length - before.labelIds.length,
    photo: before.photo === null && after.photo !== null,
  };
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

/** A contact's fields as they are, for those a patch names: what `forgetImport` writes back. */
function beforeOf(existing: Contact, patch: Fields): Fields {
  const before: Fields = {};
  for (const field of Object.keys(patch)) {
    const value = (existing as unknown as Record<string, unknown>)[field];
    before[field] = Array.isArray(value) ? value.map(entry => (typeof entry === 'object' && entry !== null ? { ...entry } : entry)) : (value ?? null);
  }
  return before;
}

export interface PlanOptions {
  readonly now: number;
  /** Mints ids (`createId`), for contacts, their entries and labels. */
  readonly newId: () => string;
  /** The person's « Indicatif par défaut »: a national number's country, so numbers of two countries never meet. */
  readonly region?: string | null;
  /** The people of `imported` left out (their indexes): nothing of theirs is written. */
  readonly leave?: ReadonlySet<number>;
  /** Contacts already here gain what they lack (the default); off, they are left as they are, and only the new ones come. */
  readonly complete?: boolean;
  /** The file's labels brought (`FileLabel.key`); the others are not made nor put on anyone. Every one when unset. */
  readonly labels?: ReadonlySet<string> | null;
  /** The photos are taken (the default). */
  readonly photos?: boolean;
  /** Google's stars make favourites here (the default). */
  readonly favorites?: boolean;
}

/**
 * What to write for `imported`, given the address book (`contacts`, `labels`, every record, live or
 * not: only live ones are matched). A person imported twice in one file is one contact. Each
 * person's fate is said in `people`, in order, for the preview.
 */
export function planImport(contacts: readonly Contact[], labels: readonly ContactLabel[], imported: readonly ImportedContact[], options: PlanOptions): ImportPlan {
  const { now, newId } = options;
  const region = options.region ?? null;
  const complete = options.complete ?? true;
  const chosenLabels = options.labels ?? null;
  const takePhotos = options.photos ?? true;
  const takeStars = options.favorites ?? true;
  const live = contacts.filter(contact => contact.deletedAt === null && contact.trashedAt === null);
  const drafts: Draft[] = live.map(draftOf);
  const byEmail = new Map<string, Draft>();
  // Numbers grouped by their last digits; in a group, `samePhone` picks the one that is the same.
  const byPhone = new Map<string, { number: string; draft: Draft }[]>();
  const byName = new Map<string, Draft>();
  const phoneOwner = (number: string): Draft | undefined => byPhone.get(phoneKey(number))?.find(entry => samePhone(entry.number, number, region))?.draft;
  /** Indexes what `draft` holds as `owner`'s (a throwaway copy's numbers lead to the contact it copies). */
  const index = (draft: Draft, owner: Draft = draft): void => {
    for (const email of draft.emails) if (email.address.trim()) byEmail.set(emailKey(email.address), owner);
    for (const phone of draft.phones) {
      const key = phoneKey(phone.number);
      if (key.length < 6) continue;
      const group = byPhone.get(key) ?? [];
      if (!group.some(entry => entry.draft === owner && entry.number === phone.number)) group.push({ number: phone.number, draft: owner });
      byPhone.set(key, group);
    }
    const name = nameKey(draft);
    if (name && !byName.has(name)) byName.set(name, owner);
  };
  drafts.forEach(draft => index(draft));

  // Labels by folded name; a new name makes a label, after the last one, in the palette's turn, once someone wears it.
  const liveLabels = labels.filter(label => label.deletedAt === null);
  const labelByName = new Map(liveLabels.map(label => [labelKey(label.name), label.id]));
  const newLabels: { id: string; fields: Fields }[] = [];
  let lastPosition = [...liveLabels].map(label => label.position).sort().at(-1) ?? null;
  /** The label of that name, made if it must be (`make`), else a stand-in for one to make. */
  const labelId = (name: string, make: boolean): string | null => {
    const clean = labelName(name);
    const key = foldText(clean);
    if (!key || SYSTEM_LABEL.test(clean) || (chosenLabels !== null && !chosenLabels.has(key))) return null;
    const known = labelByName.get(key);
    if (known) return known;
    if (!make) return `new:${key}`;
    const id = newId();
    const position = positionBetween(lastPosition, null);
    lastPosition = position;
    const color: LineColor = LINE_COLORS[(liveLabels.length + newLabels.length) % LINE_COLORS.length]!;
    newLabels.push({ id, fields: contactLabelFields({ name: clean, color, position, createdAt: now, deletedAt: null }) });
    labelByName.set(key, id);
    return id;
  };
  const labelIds = (person: ImportedContact, make: boolean): string[] => [...new Set(person.labels.map(name => labelId(name, make)).filter((id): id is string => id !== null))];

  const created: Draft[] = [];
  /** Each new contact's first person, by their index in the file. */
  const firstOf = new Map<Draft, number>();
  const matched = new Set<Draft>();
  const people: PersonFate[] = [];
  for (const [at, read] of imported.entries()) {
    if (options.leave?.has(at)) {
      people.push({ kind: 'left' });
      continue;
    }
    if (isAnonymous(read)) {
      people.push({ kind: 'anonymous' });
      continue;
    }
    const person: ImportedContact = { ...read, photo: takePhotos ? read.photo : null, favorite: takeStars && read.favorite };
    const name = nameKey(person);
    const match =
      person.emails.map(entry => byEmail.get(emailKey(entry.value))).find(Boolean) ??
      person.phones.map(entry => phoneOwner(entry.value)).find(Boolean) ??
      (name ? byName.get(name) : undefined);
    if (match?.existing && !complete) {
      // Left as it is: what it would have gained is said, and the person's numbers still lead to it.
      const copy = copyDraft(match);
      fill(copy, person, labelIds(person, false), newId, region);
      const missed = gainsOf(match, copy);
      index(copy, match);
      people.push({ kind: 'same', id: match.id, missed: hasGains(missed) ? missed : null });
      continue;
    }
    if (match) {
      const before = copyDraft(match);
      fill(match, person, labelIds(person, true), newId, region);
      index(match);
      const gains = gainsOf(before, match);
      if (match.existing) {
        matched.add(match);
        people.push(hasGains(gains) ? { kind: 'update', id: match.id, gains } : { kind: 'same', id: match.id, missed: null });
      } else people.push({ kind: 'joined', id: match.id, into: firstOf.get(match)!, gains });
      continue;
    }
    const draft: Draft = { id: newId(), existing: null, firstName: '', lastName: '', company: '', jobTitle: '', note: '', birthday: null, favorite: false, phones: [], emails: [], addresses: [], labelIds: [], photo: null, hasPhoto: false };
    fill(draft, person, labelIds(person, true), newId, region);
    created.push(draft);
    firstOf.set(draft, at);
    index(draft);
    people.push({ kind: 'new', id: draft.id });
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
  for (const draft of matched) {
    const patch = patchOf(draft, draft.existing!);
    if (Object.keys(patch).length > 0 || draft.photo) updates.push({ id: draft.id, fields: patch, photo: draft.photo, before: beforeOf(draft.existing!, patch) });
  }
  // The contacts here the file names and leaves as they are.
  const named = new Set(people.flatMap(fate => (fate.kind === 'update' || fate.kind === 'same' ? [fate.id] : [])));
  for (const write of updates) named.delete(write.id);
  return {
    creates,
    updates,
    labels: newLabels,
    unchanged: named.size,
    photos: [...creates, ...updates].filter(write => write.photo !== null).length,
    people,
  };
}

/** How many contacts the plan writes: those it makes and those it completes. */
export function plannedCount(plan: ImportPlan): number {
  return plan.creates.length + plan.updates.length;
}

// ── taking it back ──────────────────────────────────────────────────────────

/** A change `forgetImport` asks for, as each client's `writeLocal` takes it. */
export interface ImportChange {
  readonly type: 'contact' | 'contactLabel';
  readonly id: string;
  readonly patch: Fields;
}

/** Two stored values alike, whatever the order of their keys. */
function sameValue(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : typeof value === 'object' && value !== null
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map(key => [key, canonical((value as Record<string, unknown>)[key])]),
          )
        : (value ?? null);
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/**
 * « Annuler » after an import: what it made goes (its contacts and its labels get their tombstones),
 * and each contact it completed gets back what it had, field by field, where the field still holds
 * what the import wrote; a field changed since (here, or on another device and synced) is left as it
 * is now, but for the labels the import made, which leave it. The photos it gave (`photos`: contact
 * id to photo id) go too, where still worn. `contacts` is the address book as it is now; written with
 * a newer clock, as every undo.
 */
export function forgetImport(plan: ImportPlan, photos: ReadonlyMap<string, string>, contacts: Readonly<Record<string, Contact>>, now: number): ImportChange[] {
  const changes = new Map<string, ImportChange>();
  const patch = (id: string, fields: Fields): void => {
    const known = changes.get(id);
    changes.set(id, { type: 'contact', id, patch: { ...known?.patch, ...fields } });
  };
  const forgotten = new Set(plan.labels.map(label => label.id));
  const made = new Set(plan.creates.map(write => write.id));
  for (const write of plan.creates) if (contacts[write.id] && contacts[write.id]!.deletedAt === null) patch(write.id, { deletedAt: now });
  for (const write of plan.updates) {
    const contact = contacts[write.id];
    if (!contact || contact.deletedAt !== null) continue;
    const back: Fields = {};
    for (const [field, written] of Object.entries(write.fields)) {
      const current = (contact as unknown as Record<string, unknown>)[field];
      if (sameValue(current, written)) back[field] = write.before?.[field] ?? null;
    }
    if (Object.keys(back).length > 0) patch(write.id, back);
  }
  for (const [id, photoId] of photos) {
    const contact = contacts[id];
    if (!contact || made.has(id) || contact.deletedAt !== null || contact.photoId !== photoId) continue;
    patch(id, { photoId: null, photoMime: '', photoUploaded: false });
  }
  // The labels made leave whoever still wears them (a contact changed since, one labelled after).
  if (forgotten.size > 0) {
    for (const contact of Object.values(contacts)) {
      if (contact.deletedAt !== null || made.has(contact.id)) continue;
      const pending = changes.get(contact.id)?.patch.labelIds;
      const worn = (Array.isArray(pending) ? pending : contact.labelIds) as readonly string[];
      if (worn.some(id => forgotten.has(id))) patch(contact.id, { labelIds: worn.filter(id => !forgotten.has(id)) });
    }
  }
  return [...plan.labels.map(label => ({ type: 'contactLabel' as const, id: label.id, patch: { deletedAt: now } })), ...changes.values()];
}
