/**
 * The import's wizard, in words (`core/services/importFlow`, both clients): each person read as the
 * preview lists them (their name, their numbers or their e-mail, what becomes of them and why), the
 * counts above the list, the labels offered in the choices, and the report once written. The plan
 * itself is `importing.ts`'s; this only says it.
 */
import { localized, t, tx } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import type { ImportFate, PreviewEntry } from '@unlease/core/services/importFlow';
import type { GlyphName } from '@unlease/design/glyphs';
import type { Contact, ContactLabel } from '../models/contacts';
import { addressLine } from './addresses';
import { formatBirthday, readBirthday } from './birthdays';
import type { FileLabel, Gains, ImportedContact, ImportFormat, ImportPlan, PersonFate } from './importing';
import { contactName } from './names';

/** What the preview reads the address book through: the contacts a person completes, the labels they wear. */
export interface PreviewLibrary {
  readonly contacts: Readonly<Record<string, Contact>>;
  readonly labels: Readonly<Record<string, ContactLabel>>;
}

/** The words both clients' wizards share. */
export const CONTACTS_IMPORT_WORDS = localized({
  sourceTitle: tx('From Google Contacts'),
  sourceLead: tx('Google Contacts’ export, as vCard or Google CSV, or the .vcf file of a Takeout archive.'),
  phoneTitle: tx('From this phone'),
  phoneLead: tx('The contacts saved on this phone, your Google account’s included, with their photos and groups.'),
  phoneBlocked: tx('Access to the phone’s contacts is denied: it is given in Android’s settings.'),
  phoneFailed: tx('The phone’s contacts couldn’t be read.'),
  phoneEmpty: tx('No contacts on this phone.'),
  notContacts: tx('This file is neither a vCard (.vcf) nor a Google Contacts CSV.'),
  emptyFile: tx('No contacts in this file.'),
  unreadable: tx('Unreadable file.'),
  kept: tx('Contacts keep their numbers, emails, addresses, birthdays, notes, labels and favourites. Importing the same file twice duplicates no one.'),
  listLabel: tx('The people in the file'),
  existingTitle: tx('Contacts already here'),
  complete: tx('Complete the contacts already here'),
  labelsTitle: tx('Labels'),
  labelsLead: tx('Google’s labels become labels here; a label of the same name already here takes them in.'),
  photosTitle: tx('Photos'),
  photos: tx('Bring the photos over'),
  favoritesTitle: tx('Favourites'),
  favorites: tx('Keep Google’s favourites'),
  nothingToChoose: tx('Nothing to decide for this file: the settings offered will do.'),
  nothingToWrite: tx('Nothing to import with these choices: everything is already here or left out.'),
  writing: tx('Writing the contacts…'),
  undo: tx('Undo the import'),
  undone: tx('Import undone'),
  undoneLead: tx('The contacts and labels added are gone; those already here have what they had back.'),
  seeContacts: tx('See the contacts'),
});

// ── one person ──────────────────────────────────────────────────────────────

/** A person read, named as the list will name them: their name, else their company, an e-mail, a number. */
export function personTitle(person: ImportedContact): string {
  const name = `${person.firstName.trim()} ${person.lastName.trim()}`.trim();
  if (name) return name;
  if (person.company.trim()) return person.company.trim();
  const email = person.emails.find(entry => entry.value.trim())?.value.trim();
  if (email) return email;
  const phone = person.phones.find(entry => entry.value.trim())?.value.trim();
  return phone ?? t('Card without a name');
}

/** One value, and how many more there are: « 06 12 34 56 78 (+2) ». */
const firstOf = (values: readonly string[]): string | null => {
  const kept = values.map(value => value.trim()).filter(Boolean);
  if (kept.length === 0) return null;
  return kept.length > 1 ? `${kept[0]} (+${kept.length - 1})` : kept[0]!;
};

/** What a person's second line shows: their number, their e-mail, their company, their birthday; for one with no name, what they hold. */
export function personDetail(person: ImportedContact): string {
  const title = personTitle(person);
  const birthday = readBirthday(person.birthday);
  const work = [person.jobTitle.trim(), person.company.trim()].filter(part => part && part !== title).join(', ');
  const parts: (string | null)[] = [firstOf(person.phones.map(entry => entry.value)), firstOf(person.emails.map(entry => entry.value)), work || null, birthday ? formatBirthday(birthday) : null];
  const address = person.addresses[0];
  if (!parts.some(Boolean)) parts.push(address ? addressLine(address) : null, person.note.trim().split('\n')[0]!.slice(0, 80) || null);
  return parts
    .filter((part): part is string => part !== null && part !== title)
    .join(' · ');
}

/** What a person adds, in a few words: « 2 numéros, un e-mail, son anniversaire ». */
export function gainsWords(gains: Gains): string {
  const words: string[] = [];
  if (gains.name) words.push(t('their name'));
  if (gains.phones > 0) words.push(plural(gains.phones, 'number'));
  if (gains.emails > 0) words.push(plural(gains.emails, 'email'));
  if (gains.addresses > 0) words.push(plural(gains.addresses, 'address', 'addresses'));
  if (gains.birthday) words.push(t('their birthday'));
  if (gains.company) words.push(t('their company'));
  if (gains.jobTitle) words.push(t('their job title'));
  if (gains.note) words.push(t('a note'));
  if (gains.labels > 0) words.push(plural(gains.labels, 'label'));
  if (gains.favorite) words.push(t('the favourites’ star'));
  if (gains.photo) words.push(t('their photo'));
  return words.join(', ');
}

/** A fate as the shared list shows it. */
function fateOf(fate: PersonFate): ImportFate {
  switch (fate.kind) {
    case 'new':
      return 'new';
    case 'update':
      return 'update';
    case 'same':
      return 'same';
    default:
      return 'skip';
  }
}

const GLYPHS: Readonly<Record<PersonFate['kind'], GlyphName>> = {
  new: 'personPlus',
  update: 'person',
  same: 'check',
  joined: 'people',
  anonymous: 'alert',
  left: 'minus',
};

/** Whether a person can be left out by their box: one coming in, or one left out already (to bring back). */
export function canLeave(fate: PersonFate): boolean {
  return fate.kind === 'new' || fate.kind === 'update' || fate.kind === 'left';
}

/** The names of the labels a new contact wears, those the plan makes included. */
function labelNames(ids: readonly string[], plan: ImportPlan, library: PreviewLibrary): string[] {
  const made = new Map(plan.labels.map(label => [label.id, String(label.fields.name)]));
  return ids.map(id => made.get(id) ?? library.labels[id]?.name).filter((name): name is string => !!name);
}

/** Why a person comes in, or what becomes of them, under their detail. */
function whyOf(fate: PersonFate, imported: readonly ImportedContact[], library: PreviewLibrary): string | undefined {
  const here = (id: string): string => {
    const contact = library.contacts[id];
    return contact ? contactName(contact) : t('No name');
  };
  switch (fate.kind) {
    case 'new':
      return undefined;
    case 'update':
      return t('Completes {name}: {gains}', { name: here(fate.id), gains: gainsWords(fate.gains) });
    case 'same':
      return fate.missed ? t('Already here: {name}, left as is (the file would add {gains})', { name: here(fate.id), gains: gainsWords(fate.missed) }) : t('Already here: {name}, nothing to add', { name: here(fate.id) });
    case 'joined': {
      const name = imported[fate.into] ? personTitle(imported[fate.into]!) : t('No name');
      return gainsWords(fate.gains) ? t('Same person as {name}, earlier in the file: adds {gains}', { name, gains: gainsWords(fate.gains) }) : t('Same person as {name}, earlier in the file: nothing more', { name });
    }
    case 'anonymous':
      return t('No name, number or email: nothing to know them by');
    case 'left':
      return t('Unticked: won’t be imported');
  }
}

/** Every person read, with what becomes of them: the preview's list (`core/services/importFlow`). */
export function previewEntries(imported: readonly ImportedContact[], plan: ImportPlan, library: PreviewLibrary): PreviewEntry[] {
  const created = new Map(plan.creates.map(write => [write.id, write]));
  return imported.map((person, at) => {
    const fate = plan.people[at] ?? { kind: 'left' };
    let note: string | undefined;
    if (fate.kind === 'new') {
      const write = created.get(fate.id);
      const labels = write ? labelNames((write.fields.labelIds as readonly string[] | undefined) ?? [], plan, library) : [];
      const parts = [write?.fields.favorite === true ? t('Favourite') : null, labels.length > 0 ? t('Labels: {labels}', { labels: labels.join(', ') }) : null, write?.photo ? t('With their photo') : null];
      note = parts.filter((part): part is string => part !== null).join(' · ') || undefined;
    }
    return { key: `person-${at}`, title: personTitle(person), detail: personDetail(person), fate: fateOf(fate), why: whyOf(fate, imported, library), glyph: GLYPHS[fate.kind], ...(note ? { note } : {}) };
  });
}

// ── the counts ──────────────────────────────────────────────────────────────

/** One line of the counts over the list. */
export interface CountWords {
  readonly icon: GlyphName;
  readonly text: string;
  readonly meta?: string | null;
}

/** Where the people came from, said under their count. */
export function sourceWords(source: ImportFormat | 'phone' | 'shared', name: string): string {
  if (source === 'phone') return t('This phone’s contacts');
  if (source === 'shared') return name ? t('Shared card “{file}”', { file: name }) : t('A shared card');
  return source === 'vcard' ? t('vCard “{file}”', { file: name }) : t('CSV “{file}”', { file: name });
}

/** How many of each kind are left out, said. */
function leftOutWords(plan: ImportPlan): string | null {
  const count = (kind: PersonFate['kind']): number => plan.people.filter(fate => fate.kind === kind).length;
  const parts = [
    count('anonymous') > 0 ? t('{count} without a name, number or email', { count: count('anonymous') }) : null,
    count('joined') > 0 ? t('{count} twice in the file', { count: count('joined') }) : null,
    count('left') > 0 ? plural(count('left'), 'unticked', 'unticked [many]') : null,
  ];
  const said = parts.filter((part): part is string => part !== null);
  return said.length > 0 ? said.join(' · ') : null;
}

/** The photos Google gives as links, which only a server can fetch. */
export function linkedPhotos(plan: ImportPlan): number {
  return [...plan.creates, ...plan.updates].filter(write => write.photo?.kind === 'url').length;
}

/** The counts over the preview's list: who is read, new, completed, here already, left out; the labels made; the photos. */
export function previewCounts(plan: ImportPlan, source: string, serverless: boolean): CountWords[] {
  const people = plan.people.length;
  const left = plan.people.filter(fate => fate.kind === 'anonymous' || fate.kind === 'joined' || fate.kind === 'left').length;
  const kept = plan.people.filter(fate => fate.kind === 'same' && fate.missed !== null).length;
  const same = plan.people.filter(fate => fate.kind === 'same' && fate.missed === null).length;
  const lines: CountWords[] = [{ icon: 'people', text: plural(people, 'person read', 'people read'), meta: source }];
  lines.push({ icon: 'personPlus', text: plural(plan.creates.length, 'new contact', 'new contacts') });
  if (plan.updates.length > 0) lines.push({ icon: 'person', text: plural(plan.updates.length, 'contact already here, completed', 'contacts already here, completed'), meta: t('What they lack is added; nothing they have is replaced.') });
  if (kept > 0) lines.push({ icon: 'person', text: plural(kept, 'contact already here, left as is', 'contacts already here, left as is'), meta: t('The file would complete them: see the choices.') });
  if (same > 0) lines.push({ icon: 'check', text: t('{contacts} already here, nothing to add', { contacts: plural(same, 'contact') }) });
  if (left > 0) lines.push({ icon: 'minus', text: plural(left, 'person left out', 'people left out'), meta: leftOutWords(plan) });
  if (plan.labels.length > 0) {
    const names = plan.labels.map(label => String(label.fields.name));
    lines.push({ icon: 'tag', text: plural(plan.labels.length, 'label to create', 'labels to create'), meta: names.length > 6 ? `${names.slice(0, 6).join(', ')}…` : names.join(', ') });
  }
  if (plan.photos > 0) lines.push({ icon: 'image', text: plural(plan.photos, 'photo to bring over', 'photos to bring over'), meta: serverless && linkedPhotos(plan) > 0 ? photosNeedServer(linkedPhotos(plan)) : null });
  return lines;
}

/** Google's photos are links: without a server, they stay behind. */
export function photosNeedServer(count: number): string {
  return t('{photos} from Google are links: without a connected server, they can’t be brought over.', { photos: plural(count, 'photo') });
}

// ── the choices ─────────────────────────────────────────────────────────────

/** A label's line in the choices: how many wear it, and whether it is made or joined. */
export function fileLabelWords(label: FileLabel): string {
  const people = plural(label.people, 'person', 'people');
  if (label.marker) return t('{people} · Google adds it at each file import', { people });
  return label.existing ? t('{people} · already exists here', { people }) : t('{people} · new label', { people });
}

/** What « Compléter les contacts déjà là » does, on and off, counted. */
export function completeWords(on: boolean, count: number): string {
  if (!on) return t('Those already here stay as they are; only the new contacts are added.');
  return count === 1 ? t('A contact already here gains what it lacks; nothing it has is replaced.') : t('{count} contacts already here gain what they lack; nothing they have is replaced.', { count });
}

/** What « Reprendre les photos » does, on and off, counted. */
export function photosWords(on: boolean, count: number): string {
  return on ? t('{photos} to bring over, once the contacts are written.', { photos: plural(count, 'photo') }) : t('The contacts come without their photo.');
}

/** What « Garder les favoris de Google » does, counted. */
export function favoritesWords(on: boolean, count: number): string {
  return on ? t('Google’s star makes them favourites here: {people}.', { people: plural(count, 'person', 'people') }) : t('Google’s star is ignored; your favourites stay those here.');
}

/** The import's foot button, counted. */
export function importContactsAction(plan: ImportPlan | null): string {
  if (!plan) return t('Import');
  if (plan.creates.length === 0 && plan.updates.length > 0) return t('Complete {contacts}', { contacts: plural(plan.updates.length, 'contact') });
  return plan.creates.length > 0 ? t('Import {contacts}', { contacts: plural(plan.creates.length, 'contact') }) : t('Import');
}

// ── the report ──────────────────────────────────────────────────────────────

/** What the photos came to: taken, and those that could not be (unreadable, no server for a link). */
export interface PhotosTaken {
  readonly taken: number;
  readonly missed: number;
}

/** The report's lines: what came in, then what was left out and why. */
export function reportLines(plan: ImportPlan, photos: PhotosTaken | null, serverless: boolean): { readonly imported: string[]; readonly skipped: string[] } {
  const imported: string[] = [];
  if (plan.creates.length > 0) imported.push(plural(plan.creates.length, 'contact added', 'contacts added'));
  if (plan.updates.length > 0) imported.push(plural(plan.updates.length, 'contact completed', 'contacts completed'));
  if (plan.labels.length > 0) imported.push(t('{labels}: {names}', { labels: plural(plan.labels.length, 'label created', 'labels created'), names: plan.labels.map(label => String(label.fields.name)).join(', ') }));
  if (photos && photos.taken > 0) imported.push(plural(photos.taken, 'photo brought over', 'photos brought over'));
  const skipped: string[] = [];
  const count = (kind: PersonFate['kind']): number => plan.people.filter(fate => fate.kind === kind).length;
  const same = plan.people.filter(fate => fate.kind === 'same' && fate.missed === null).length;
  const kept = plan.people.filter(fate => fate.kind === 'same' && fate.missed !== null).length;
  if (same > 0) skipped.push(t('{contacts} already here, nothing to add', { contacts: plural(same, 'contact') }));
  if (kept > 0) skipped.push(plural(kept, 'contact already here, left as is', 'contacts already here, left as is'));
  if (count('joined') > 0) skipped.push(plural(count('joined'), 'person twice in the file, joined to the first', 'people twice in the file, joined to the first'));
  if (count('anonymous') > 0) skipped.push(t('{cards} without a name, number or email', { cards: plural(count('anonymous'), 'card') }));
  if (count('left') > 0) skipped.push(plural(count('left'), 'person unticked', 'people unticked'));
  if (photos && photos.missed > 0) skipped.push(serverless && linkedPhotos(plan) > 0 ? photosNeedServer(photos.missed) : t('{photos} couldn’t be brought over.', { photos: plural(photos.missed, 'photo') }));
  return { imported, skipped };
}

/** The report's title, over its sheets: what the import came to. */
export function doneTitle(plan: ImportPlan): string {
  return plan.creates.length > 0 ? t('Your contacts are here') : t('Your contacts are up to date');
}

/** The slip once written: what came in, in a line. */
export function importedMessage(plan: ImportPlan): string {
  const parts = [plan.creates.length > 0 ? plural(plan.creates.length, 'contact added', 'contacts added') : null, plan.updates.length > 0 ? plural(plan.updates.length, 'contact completed', 'contacts completed') : null];
  const said = parts.filter((part): part is string => part !== null);
  return said.length > 0 ? said.join(' · ') : plural(plan.labels.length, 'label created', 'labels created');
}
