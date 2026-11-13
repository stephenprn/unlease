/**
 * A gift idea for someone: a product's link kept in Carnet's « Cadeaux » collection by the server
 * (`POST /api/notes/gifts`), the contact named among its people, in this device's language. Contacts
 * holds no Carnet record: the slip offers to open the collection in Carnet.
 */
import { APPS } from '@unlease/core/apps';
import { getLocale, t } from '@unlease/core/i18n';
import { extractUrls } from '@unlease/core/services/url';
import { notesPlace, openInApp } from '@shared/app/openApp';
import { selectServer, selectServerRuns, useSettingsStore } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';
import { readClipboard } from '@shared/platform/clipboard';

import { later } from './later';
import { addGiftLink, SyncError } from './sync/transport';

/** Why a gift idea cannot be kept now; null when it can. */
export function giftsUnavailable(): string | null {
  const settings = useSettingsStore.getState();
  if (!selectServer(settings)) return t('Connect a server to keep gift ideas in {app}.', { app: APPS.notes.name });
  if (!selectServerRuns('notes')(settings)) return t('{app} is not turned on on this server.', { app: APPS.notes.name });
  return null;
}

/** The first link the clipboard holds, '' for none. */
export async function clipboardLink(): Promise<string> {
  return extractUrls(await readClipboard())[0] ?? '';
}

/**
 * Keeps the link for the contact: null when it was kept (the slip says where, and opens it), else why
 * not, for the sheet to say on its form's line.
 */
export async function sendGift(url: string, forName: string, contactId?: string): Promise<string | null> {
  const why = giftsUnavailable();
  const server = selectServer(useSettingsStore.getState());
  if (why || !server) return why ?? t('Server unreachable');
  try {
    const kept = await addGiftLink(server, { url: url.trim(), forName, ...(contactId ? { contactId } : {}), lang: getLocale() });
    const open = { label: t('Open'), run: () => later(openInApp('notes', notesPlace('line', kept.collectionId))) };
    showSnack(kept.existing ? t('Already in Gifts, in {app}: {name} is added to it.', { app: APPS.notes.name, name: forName }) : t('Added to Gifts in {app}', { app: APPS.notes.name }), open, { tone: 'success' });
    return null;
  } catch (error) {
    const off = error instanceof SyncError && error.status === 404;
    return off ? t('{app} is not turned on on this server.', { app: APPS.notes.name }) : error instanceof Error && error.message ? error.message : t('Server unreachable');
  }
}
