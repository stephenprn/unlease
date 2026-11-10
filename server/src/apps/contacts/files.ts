/**
 * Where Contacts' photos go in a readable tree, the same in the drive (Seafile) and in a backup
 * archive, under a folder named after the app: `Contacts/Photos/<name>.<ext>`. Names come from the
 * people's names (`blobs/names`), oldest first, so a name never moves to another person.
 */
import { APP_NAME } from '@unlease/contacts/brand';
import type { Contact } from '@unlease/contacts/models/contacts';
import { nameOrNull } from '@unlease/contacts/services/names';
import { contactFromRecord } from '@unlease/contacts/sync/entities';
import { extensionFor, safeName, uniqueName } from '../../blobs/names';
import type { StoredRecord } from '../../sync/records';
import type { FilesOptions } from '../types';

/** The app's own folder in the drive and in an archive. */
export const FOLDER = APP_NAME;
export const PHOTOS = `${FOLDER}/Photos`;

/** Contacts' live people (the bin's too: they come back), from every record the server holds. */
export function readContacts(all: readonly StoredRecord[]): Contact[] {
  return all
    .filter(record => record.type === 'contact')
    .map(contactFromRecord)
    .filter(contact => contact.deletedAt === null)
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Blob id -> its path in the tree, for the photos live contacts wear. */
export function layoutContacts(contacts: readonly Contact[], options: FilesOptions): Map<string, string> {
  const files = new Map<string, string>();
  const taken = new Set<string>();
  for (const contact of contacts) {
    if (!contact.photoId || files.has(contact.photoId)) continue;
    const mime = options.mimeOf?.(contact.photoId) ?? contact.photoMime;
    files.set(contact.photoId, `${PHOTOS}/${uniqueName(safeName(nameOrNull(contact) ?? '', 'Sans nom'), taken, extensionFor(mime || 'image/jpeg'))}`);
  }
  return files;
}

/** Every photo a contact wears, live or kept (`keep`: a tombstone the purge just wrote). */
export function contactsFilesInUse(records: readonly StoredRecord[], keep: (record: StoredRecord) => boolean): Set<string> {
  const ids = new Set<string>();
  for (const record of records) {
    if (record.type !== 'contact' || typeof record.fields.photoId !== 'string') continue;
    const live = record.fields.deletedAt === null || record.fields.deletedAt === undefined;
    if (live || keep(record)) ids.add(record.fields.photoId);
  }
  return ids;
}
