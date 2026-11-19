/**
 * A file kept by the suite (an event's ticket, a page's PDF or video), opened in the phone's app for
 * its type: this phone's copy while it waits to upload, else the server's, fetched with the token
 * (a browser could not send it, so the file never goes through the web app).
 */
import { t } from '@unlease/core/i18n';
import { authHeader } from '@unlease/core/sync/protocol';
import { loadLocalFiles } from '@shared/data/repositories/fileRepository';
import { openFile } from '@shared/platform/media';

import { useSettingsStore } from './store/settingsStore';
import { dismissSnack, showSnack } from './store/uiStore';

export interface KeptFile {
  readonly id: string;
  readonly name: string;
  readonly mime: string;
  /** Whether the server has it. */
  readonly uploaded: boolean;
}

/** A fetch quicker than this opens without a word; a longer one says it is coming. */
const QUIET_MS = 400;

export async function openKeptFile(file: KeptFile): Promise<void> {
  const local = loadLocalFiles().find(one => one.id === file.id)?.path;
  const server = useSettingsStore.getState().server;
  const source = local ?? (file.uploaded && server ? `${server.url}/api/blobs/${encodeURIComponent(file.id)}?variant=original` : null);
  if (!source) {
    showSnack(t('This file opens once it is sent to the server.'));
    return;
  }
  const authorization = !local && server ? (authHeader(server.token).Authorization ?? '') : '';
  let waiting: number | null = null;
  const timer = setTimeout(() => {
    waiting = showSnack(t('Opening {name}…', { name: file.name }), undefined, { sticky: true });
  }, QUIET_MS);
  const outcome = await openFile(file.id, source, authorization, file.name, file.mime);
  clearTimeout(timer);
  if (waiting !== null) dismissSnack(waiting);
  if (outcome === 'none') showSnack(t('No app on this phone opens this kind of file.'), undefined, { tone: 'warning' });
  else if (outcome === 'error') showSnack(local ? t('Couldn’t open this file') : t('Couldn’t fetch this file from the server'), undefined, { tone: 'error' });
}
