/**
 * Contacts on the server: its bin (`bin.ts`), a photo taken from an address for imports from Google
 * (`routes.ts`, `photos.ts`), and how its photos, its vCard and its list look in the drive and in
 * archives (`files.ts`, `markdown.ts`), under its own folder there. It reads no other app.
 */
import type { StatementSync } from 'node:sqlite';
import type { BlobStore } from '../../blobs/store';
import type { Database } from '../../db/database';
import type { Fetcher } from '../../reading/fetcher';
import type { PushRule, SyncService } from '../../sync/service';
import type { ServerApp } from '../types';
import { reviveRule } from '../../sync/revive';
import { emptyContactsBin } from './bin';
import { contactsFilesInUse, FOLDER, layoutContacts, readContacts } from './files';
import { contactsMarkdown } from './markdown';
import { PhotoTaker } from './photos';
import { contactsRoutes } from './routes';

/** Contacts' rules for what a push brings (`SyncService`): a contact the bin emptied that a device restores afterwards comes back. */
export const CONTACTS_PUSH_RULES: readonly PushRule[] = [reviveRule('contact')];

export interface ContactsAppOptions {
  readonly db: Database;
  readonly sync: SyncService;
  readonly blobs: BlobStore;
  /** The suite's guarded web reader (`reading/`), made once by the registry. */
  readonly fetcher: Fetcher;
}

export interface ContactsApp extends ServerApp {
  /** Takes photos from addresses (the tests watch it). */
  readonly photos: PhotoTaker;
}

export function createContactsApp(options: ContactsAppOptions): ContactsApp {
  const { db, sync, blobs, fetcher } = options;
  const photos = new PhotoTaker({ fetcher, blobs });
  const count: StatementSync = db.prepare(`SELECT COUNT(*) AS count FROM records WHERE type = 'contact' AND json_extract(fields, '$.deletedAt') IS NULL AND json_extract(fields, '$.trashedAt') IS NULL`);
  return {
    id: 'contacts',
    readme: `\`${FOLDER}/\` : vos contacts en vCard (\`${FOLDER}.vcf\`, que Google Contacts et les téléphones importent) et en liste (\`${FOLDER}.md\`), leurs photos dans \`Photos/\`.`,
    photos,
    routes: app => contactsRoutes(app, { photos }),
    chores: at => emptyContactsBin(db, sync, at),
    filesInUse: contactsFilesInUse,
    files: (all, filesOptions) => layoutContacts(readContacts(all), filesOptions),
    markdown: (all, filesOptions) => {
      const contacts = readContacts(all);
      return contactsMarkdown(contacts, all, layoutContacts(contacts, filesOptions));
    },
    counts: () => ({ contacts: Number((count.get() as { count: number }).count) }),
  };
}
