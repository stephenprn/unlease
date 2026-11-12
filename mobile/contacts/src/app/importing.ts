/**
 * Moving in: from Google's export (a `.vcf` or Google's CSV, from contacts.google.com › Exporter or
 * Takeout), from a card shared to the app, or from the phone's own contacts (Google's synced ones
 * included). Every source is read into `ImportedContact`s, those with nothing to know them by too (the
 * preview says why they stay out); `planImport` says what becomes of each, with the person's choices;
 * the labels, the new contacts and what the others gained go in one batch, then the photos (a
 * picture's bytes kept here until the sync sends them, an address fetched by the server), in one batch
 * more. « Annuler » takes it back (`forgetImport`).
 */
import { createId } from '@unlease/core/services/ids';
import { forgetImport, planImport, readImportFile, type ImportedContact, type ImportedPhoto, type ImportFormat, type ImportPlan, type PlanOptions } from '@unlease/contacts/services/importing';
import { CONTACTS_IMPORT_WORDS } from '@unlease/contacts/services/importPreview';
import { readVCardDate } from '@unlease/contacts/services/vcard';
import { pickDocument } from '@shared/platform/documents';
import { readText, removePath } from '@shared/platform/media';
import { selectServer, useSettingsStore } from '@shared/app/store/settingsStore';
import { requestSync } from '@shared/app/sync/syncManager';
import { importPhoto, importPhotoData, readPhoneContacts, type PhoneContactRow } from '@platform/phoneContacts';
import { t } from '@unlease/core/i18n';

import { keepPhoto } from './photos';
import { deviceRegion } from './reach';
import { applyImport } from './store/actions';
import { useLibraryStore, writeLocal, type LibraryState, type LocalChange } from './store/libraryStore';
import { fetchContactPhoto } from './sync/transport';

export type ImportSource = 'file' | 'phone' | 'shared';

/** What was read, waiting for its preview. */
export interface ImportRead {
  readonly source: ImportSource;
  /** A file's format (the phone's book has none). */
  readonly format: ImportFormat | null;
  /** The file's name, when one was picked or shared. */
  readonly name: string;
  readonly people: readonly ImportedContact[];
}

export type ReadOutcome = { readonly status: 'ok'; readonly read: ImportRead } | { readonly status: 'cancelled' } | { readonly status: 'error'; readonly message: string };

/** What a file manager may call a `.vcf` or a `.csv`. */
const CONTACT_FILE_TYPES = ['text/x-vcard', 'text/vcard', 'text/directory', 'text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream'];

/** The people of a file already in the app's storage (a picked or a shared one), removed once read. */
export async function readContactsPath(path: string, name: string, source: ImportSource = 'file'): Promise<ReadOutcome> {
  try {
    const read = readImportFile(name || path, await readText(path));
    if (!read) return { status: 'error', message: CONTACTS_IMPORT_WORDS.notContacts };
    if (read.people.length === 0) return { status: 'error', message: CONTACTS_IMPORT_WORDS.emptyFile };
    return { status: 'ok', read: { source, format: read.format, name, people: read.people } };
  } catch {
    return { status: 'error', message: CONTACTS_IMPORT_WORDS.unreadable };
  } finally {
    await removePath(path);
  }
}

/** « Choisir un fichier »: a `.vcf` or Google's CSV, read. */
export async function readPickedFile(): Promise<ReadOutcome> {
  const picked = await pickDocument(CONTACT_FILE_TYPES);
  if (picked.status === 'cancelled') return { status: 'cancelled' };
  if (picked.status !== 'ok' || !picked.path) return { status: 'error', message: picked.message ? t(picked.message) : CONTACTS_IMPORT_WORDS.unreadable };
  return readContactsPath(picked.path, picked.name);
}

/** Several cards shared at once, read as one import. */
export async function readSharedFiles(paths: readonly string[], name = ''): Promise<ReadOutcome> {
  const people: ImportedContact[] = [];
  let format: ImportFormat | null = null;
  let failure: string | null = null;
  for (const path of paths) {
    const read = await readContactsPath(path, path.split('/').pop() ?? '', 'shared');
    if (read.status === 'ok') {
      people.push(...read.read.people);
      format ??= read.read.format;
    } else if (read.status === 'error') failure = read.message;
  }
  if (people.length === 0) return { status: 'error', message: failure ?? CONTACTS_IMPORT_WORDS.emptyFile };
  return { status: 'ok', read: { source: 'shared', format, name: name || (paths[0]?.split('/').pop() ?? ''), people } };
}

const PHONE_PAGE = 200;

/** A phone contact as an import reads it. */
export function fromPhoneRow(row: PhoneContactRow): ImportedContact {
  const text = (value: unknown): string => (typeof value === 'string' ? value : '');
  const entries = (list: unknown) =>
    Array.isArray(list) ? list.map(entry => ({ value: text(entry?.value), kind: text(entry?.kind) || 'other', label: text(entry?.label) })).filter(entry => entry.value.trim()) : [];
  return {
    firstName: text(row.firstName),
    lastName: text(row.lastName),
    company: text(row.company),
    jobTitle: text(row.jobTitle),
    note: text(row.note),
    birthday: row.birthday ? readVCardDate(text(row.birthday)) : null,
    favorite: row.favorite === true,
    photo: row.photo ? { kind: 'file', uri: text(row.photo), mime: 'image/jpeg' } : null,
    phones: entries(row.phones),
    emails: entries(row.emails),
    addresses: Array.isArray(row.addresses)
      ? row.addresses.map(address => ({
          kind: text(address?.kind) || 'other',
          label: text(address?.label),
          street: text(address?.street),
          postalCode: text(address?.postalCode),
          city: text(address?.city),
          region: text(address?.region),
          country: text(address?.country),
        }))
      : [],
    labels: Array.isArray(row.labels) ? row.labels.filter((label): label is string => typeof label === 'string') : [],
  };
}

/** A row holding nothing at all (no name, number, e-mail, address, note, birthday nor photo): not even worth a line. */
const blank = (person: ImportedContact): boolean =>
  !person.firstName.trim() && !person.lastName.trim() && !person.company.trim() && person.phones.length === 0 && person.emails.length === 0 && person.addresses.length === 0 && !person.note.trim() && !person.birthday && !person.photo;

/** Every contact of the phone, a page at a time (the permission already given). */
export async function readPhoneBook(onProgress?: (read: number, total: number) => void): Promise<ImportedContact[]> {
  const out: ImportedContact[] = [];
  let total = Infinity;
  for (let offset = 0; offset < total; offset += PHONE_PAGE) {
    const page = await readPhoneContacts(offset, PHONE_PAGE);
    total = page.total;
    out.push(...page.contacts.map(fromPhoneRow));
    onProgress?.(Math.min(offset + PHONE_PAGE, total), total);
    if (page.contacts.length === 0) break;
  }
  return out.filter(person => !blank(person));
}

/** What the person decides in the wizard (`PlanOptions`). */
export type ImportChoices = Pick<PlanOptions, 'leave' | 'complete' | 'labels' | 'photos' | 'favorites'>;

/** What an import would write, against the address book (as it is now, unless one is given). */
export function planFor(imported: readonly ImportedContact[], choices: ImportChoices = {}, library: Pick<LibraryState, 'contacts' | 'labels'> = useLibraryStore.getState(), now: number = Date.now()): ImportPlan {
  return planImport(Object.values(library.contacts), Object.values(library.labels), imported, { now, newId: () => createId(now), region: deviceRegion(), ...choices });
}

export interface ImportReport {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly labels: number;
  readonly photos: number;
  /** Photos that could not be taken (unreadable, no server for an address). */
  readonly photosMissed: number;
  /** The photos worn now, by contact: what « Annuler » takes back. */
  readonly worn: ReadonlyMap<string, string>;
}

/** A photo into the app's storage, or the server's blob for an address; null when it cannot be taken. */
async function takePhoto(photo: ImportedPhoto, now: number): Promise<{ id: string; mime: string; uploaded: boolean } | null> {
  if (photo.kind === 'url') {
    const server = selectServer(useSettingsStore.getState());
    if (!server) return null;
    try {
      const kept = await fetchContactPhoto(server, photo.url);
      return { id: kept.id, mime: kept.mime, uploaded: true };
    } catch {
      return null;
    }
  }
  const imported = photo.kind === 'file' ? await importPhoto(photo.uri) : await importPhotoData(photo.base64);
  if (!imported) return null;
  const kept = keepPhoto(imported.path, imported.mime, now);
  return { ...kept, uploaded: false };
}

/** The plan written (one batch), then its photos (one batch more); `onPhoto` counts them as they come. */
export async function runImport(plan: ImportPlan, onPhoto?: (done: number, total: number) => void, now: number = Date.now()): Promise<ImportReport> {
  applyImport(plan, now);
  const withPhoto = [...plan.creates, ...plan.updates].filter(write => write.photo !== null);
  const changes: LocalChange[] = [];
  const worn = new Map<string, string>();
  let missed = 0;
  for (const [index, write] of withPhoto.entries()) {
    const taken = await takePhoto(write.photo!, now);
    // Worn only by a contact still without one (a photo set meanwhile stands).
    const contact = useLibraryStore.getState().contacts[write.id];
    if (taken && contact && contact.deletedAt === null && contact.photoId === null) {
      changes.push({ type: 'contact', id: write.id, patch: { photoId: taken.id, photoMime: taken.mime, photoUploaded: taken.uploaded } });
      worn.set(write.id, taken.id);
    } else if (!taken) missed += 1;
    onPhoto?.(index + 1, withPhoto.length);
  }
  if (changes.length > 0) writeLocal(changes);
  requestSync();
  return { created: plan.creates.length, updated: plan.updates.length, unchanged: plan.unchanged, labels: plan.labels.length, photos: changes.length, photosMissed: missed, worn };
}

/** « Annuler » after an import (`forgetImport`): what it made goes, and those it completed get back what they had where nothing changed since, in one batch. */
export function undoImport(plan: ImportPlan, worn: ReadonlyMap<string, string>, now: number = Date.now()): void {
  const changes = forgetImport(plan, worn, useLibraryStore.getState().contacts, now);
  if (changes.length > 0) writeLocal(changes, now);
  requestSync();
}
