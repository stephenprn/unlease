/** After each exchange, the photos taken on this phone go up (`addSyncTask`); the attachment then says it is on the server. */
import { loadLocalFiles, markFileUploaded } from '@shared/data/repositories/fileRepository';
import type { ServerConfig } from '@shared/app/store/settingsStore';
import { addSyncTask } from '@shared/app/sync/syncManager';
import { isRefusal, uploadFile } from '@app/sync/transport';

import { markAttachmentUploaded } from '../store/actions';
import { useLibraryStore } from '../store/libraryStore';

/** Photos the server refused (not an image it can read, too large): not retried until the next start. */
const refused = new Set<string>();

/** Photos kept here that `uploadPhotos` would still send: the sync counts them as waiting. */
function photosWaiting(): number {
  const { attachments } = useLibraryStore.getState();
  return loadLocalFiles().filter(file => !file.uploaded && !refused.has(file.id) && attachments[file.id]?.deletedAt === null).length;
}

async function uploadPhotos(config: ServerConfig): Promise<void> {
  const { attachments } = useLibraryStore.getState();
  for (const file of loadLocalFiles()) {
    if (file.uploaded || refused.has(file.id)) continue;
    const attachment = attachments[file.id];
    if (!attachment || attachment.deletedAt !== null) continue;
    try {
      await uploadFile(config, file);
    } catch (error) {
      if (!isRefusal(error)) throw error;
      refused.add(file.id);
      continue;
    }
    markFileUploaded(file.id);
    if (!attachment.uploaded) markAttachmentUploaded(file.id);
  }
}

let added = false;

/** Once, at start (bootstrap). */
export function startPhotoUploads(): void {
  if (added) return;
  added = true;
  addSyncTask({ run: uploadPhotos, restart: () => refused.clear(), pending: photosWaiting });
}
