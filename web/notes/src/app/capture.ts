/**
 * Links in, from anywhere: a paste on the board, the capture dialog, the
 * installed app's share target. A link becomes a link in "Non classé" with
 * `autoFile`, and the server files it once it has read the page; the transfer
 * panel shows it travelling. Nothing asks a question first.
 *
 * When nothing reads links (no server, or no Claude key), there is nothing to
 * watch travel: the link is kept as a plain link in "Non classé" (`addLinks`
 * marks it `skipped`) and a snackbar says where it went.
 */
import { addedMessage } from '@unlease/notes/services/savedLinks';
import { extractUrls } from '@unlease/core/services/url';
import { INBOX_ID } from '@unlease/notes/models/entities';

import { addLinks, createNote, readingEnabled } from './store/actions';
import { useLibraryStore } from './store/library';
import { addedTone, showSnack, startTransfer } from './store/ui';

/** The words around a shared link, when they look like its title (the phone's rule). */
export function titleBesides(text: string, url: string): string {
  const rest = text
    .replace(url, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[:\-–|]+$/, '')
    .trim();
  return rest.length >= 3 && rest.length <= 140 ? rest : '';
}

/**
 * File links, with the transfer panel when the server reads them, a snackbar otherwise. An address
 * saved already is not added (Claude would file it beside itself): the snackbar says where it is.
 */
function fileUrls(urls: readonly string[], title: string): string[] {
  const reading = readingEnabled();
  const placed = addLinks(urls, { autoFile: true, title });
  if (reading) placed.filter(link => link.existing === null).forEach(link => startTransfer(link.id, link.cleaned));
  const message = addedMessage(placed, reading ? { into: null } : { into: INBOX_ID, announce: true }, useLibraryStore.getState().notes);
  if (message) showSnack(message, undefined, { tone: addedTone(placed) });
  return placed.map(link => link.id);
}

/** File every link in `text`. Returns their links' ids: new, or saved already. */
export function classifyText(text: string): string[] {
  const urls = extractUrls(text);
  return fileUrls(urls, urls.length === 1 ? titleBesides(text, urls[0]!) : '');
}

export type ShareResult = { readonly kind: 'links'; readonly ids: readonly string[] } | { readonly kind: 'note'; readonly id: string } | { readonly kind: 'none' };

/** What the share target receives (`/capture/share?title=…&text=…&url=…`). */
export function receiveShare(share: { readonly title: string; readonly text: string; readonly url: string }): ShareResult {
  const text = [share.text, share.url].filter(Boolean).join(' ').trim();
  const urls = extractUrls(text || share.title);
  if (urls.length > 0) {
    const title = urls.length === 1 ? titleBesides(text, urls[0]!) || share.title.slice(0, 140) : '';
    return { kind: 'links', ids: fileUrls(urls, title) };
  }
  if (text || share.title.trim()) {
    return { kind: 'note', id: createNote({ kind: 'text', title: share.title.slice(0, 200), body: share.text }) };
  }
  return { kind: 'none' };
}
