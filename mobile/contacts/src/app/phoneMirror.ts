/**
 * « Copier dans les contacts du téléphone » (Réglages): the address book copied, one way, into the
 * phone's own under the app's account (`@shared/app/phoneMirror`, `PhoneMirrorModule.kt`), so the
 * dialer, Messages, WhatsApp and the keyboard know the people kept here. Each run reads what the
 * account holds, writes the people new or changed (`mirroredContacts`, `mirrorChanges`), a hundred
 * at a time, takes away those gone, then the photos that changed: this phone's copy until it
 * uploads, then the server's display copy.
 */
import { SUITE_NAME } from '@unlease/core/apps';
import { authHeader } from '@unlease/core/sync/protocol';
import { mirrorChanges } from '@unlease/core/services/mirror';
import { mirroredContacts, mirroredPhotos } from '@unlease/contacts/services/phoneMirror';
import { createPhoneMirror } from '@shared/app/phoneMirror';
import { DEV_BUILD } from '@shared/app/variant';
import { selectServer, useSettingsStore } from '@shared/app/store/settingsStore';
import { loadLocalFiles } from '@shared/data/repositories/fileRepository';
import type { PhoneMirrorNative } from '@shared/platform/phoneMirror';

import { deviceRegion } from './reach';
import { useLibraryStore } from './store/libraryStore';

/** What the account holds of a person: its fingerprint, and the photo's blob written ('' for none). */
interface WrittenContact {
  readonly id: string;
  readonly fingerprint: string;
  readonly photo: string;
}

/** A photo to write: where to read it (a file here, or the server's copy with the token), or nothing to clear it. */
interface PhotoChange {
  readonly id: string;
  readonly photoId: string;
  readonly uri: string;
  readonly headers: Record<string, string>;
}

const CHUNK = 100;

function photoSource(photoId: string, local: ReadonlyMap<string, string>): Pick<PhotoChange, 'uri' | 'headers'> | null {
  const path = local.get(photoId);
  if (path) return { uri: path.startsWith('file://') ? path : `file://${path}`, headers: {} };
  const server = selectServer(useSettingsStore.getState());
  if (!server) return null;
  return { uri: `${server.url}/api/blobs/${photoId}?variant=display`, headers: authHeader(server.token) };
}

async function run(native: PhoneMirrorNative): Promise<void> {
  const contacts = Object.values(useLibraryStore.getState().contacts);
  const written = (JSON.parse(await native.written()) as { contacts: WrittenContact[] }).contacts;
  const { upserts, deletes } = mirrorChanges(mirroredContacts(contacts, deviceRegion()), written);
  if (deletes.length > 0) await native.apply(JSON.stringify({ upserts: [], deletes, photos: [] }));
  for (let at = 0; at < upserts.length; at += CHUNK) await native.apply(JSON.stringify({ upserts: upserts.slice(at, at + CHUNK), deletes: [], photos: [] }));

  // The photos, apart: fetched, so one may come later than its person (written again until it does).
  const writtenPhoto = new Map(written.map(row => [row.id, row.photo]));
  for (const row of upserts) writtenPhoto.set(row.id, writtenPhoto.get(row.id) ?? '');
  const local = new Map(loadLocalFiles().map(file => [file.id, file.path]));
  const photos: PhotoChange[] = [];
  for (const { id, photoId } of mirroredPhotos(contacts)) {
    const want = photoId ?? '';
    if (writtenPhoto.get(id) === want) continue;
    if (!want) {
      photos.push({ id, photoId: '', uri: '', headers: {} });
      continue;
    }
    const source = photoSource(want, local);
    if (source) photos.push({ id, photoId: want, ...source });
  }
  for (let at = 0; at < photos.length; at += 20) await native.apply(JSON.stringify({ upserts: [], deletes: [], photos: photos.slice(at, at + 20) }));
}

export const contactsMirror = createPhoneMirror({
  key: 'contacts.phoneMirror',
  permissions: 'contacts',
  accountName: DEV_BUILD ? `${SUITE_NAME} Dev` : SUITE_NAME,
  run,
  subscribe: listener =>
    useLibraryStore.subscribe((state, before) => {
      if (state.contacts !== before.contacts) listener();
    }),
});
