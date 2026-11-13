/**
 * A gift idea for someone whose birthday comes: a product's link kept in Carnet's « Cadeaux »
 * collection by the server (`POST /api/notes/gifts`), the contact named among its people, in this
 * device's language. Agenda writes no Carnet record: the slip offers to open the collection in Carnet.
 */
import { APPS } from '@unlease/core/apps';
import { getLocale, t } from '@unlease/core/i18n';
import { extractUrls } from '@unlease/core/services/url';
import { giftIdeasFor } from '@unlease/notes/services/gifts';
import { notesPlace, openInApp } from '@shared/app/openApp';
import { selectServer, selectServerRuns, useSettingsStore } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';
import { readClipboard } from '@shared/platform/clipboard';

import { later } from './later';
import type { LibraryState } from './store/libraryStore';
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

/** Keeps the link for the contact; true when it was kept (a slip says where, or why not). */
/**
 * A gift idea sent to Carnet's « Cadeaux » through the server. Kept, it says so on the slip (with
 * « Ouvrir ») and resolves null; refused, it resolves what went wrong, for the form to say by its
 * actions.
 */
export async function sendGift(url: string, forName: string, contactId?: string): Promise<string | null> {
  const why = giftsUnavailable();
  const server = selectServer(useSettingsStore.getState());
  if (why || !server) return why ?? t('Connect a server to keep gift ideas in {app}.', { app: APPS.notes.name });
  try {
    const kept = await addGiftLink(server, { url: url.trim(), forName, ...(contactId ? { contactId } : {}), lang: getLocale() });
    const open = { label: t('Open'), run: () => later(openInApp('notes', notesPlace('line', kept.collectionId))) };
    showSnack(kept.existing ? t('Already in Gifts, in {app}: {name} is added to it.', { app: APPS.notes.name, name: forName }) : t('Added to Gifts in {app}', { app: APPS.notes.name }), open, { tone: 'success' });
    return null;
  } catch (error) {
    const off = error instanceof SyncError && error.status === 404;
    return off ? t('{app} is not turned on on this server.', { app: APPS.notes.name }) : error instanceof Error && error.message ? t(error.message) : t('Server unreachable');
  }
}

export interface GiftIdea {
  readonly linkId: string;
  readonly title: string;
  readonly url: string;
  readonly done: boolean;
}

/** The gift ideas kept for a contact (or those merged into it) in Carnet's « Cadeaux » collection, those still to buy first. */
export function giftIdeas(state: LibraryState, contactId: string, name: string): GiftIdea[] {
  const ids = [contactId, ...Object.values(state.people.contacts).flatMap(other => (other.mergedInto === contactId ? [other.id] : []))];
  return giftIdeasFor(state.carnet.notes, state.carnet.links, { ids, name }).map(link => ({ linkId: link.id, title: link.title.trim() || link.url, url: link.url, done: link.done }));
}
