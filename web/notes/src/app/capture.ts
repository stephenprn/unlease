/**
 * Links in, from anywhere: a paste on the board, the capture dialog, the
 * installed app's share target. A link becomes a link in "Non classé" with
 * `autoFile`, and the server files it once it has read the page; the transfer
 * panel shows it travelling. A paste asks no question first; a share does
 * (`readShare`): any page can open the share target's address.
 *
 * When nothing reads links (no server, or no Claude key), there is nothing to
 * watch travel: the link is kept as a plain link in "Non classé" (`addLinks`
 * marks it `skipped`) and a snackbar says where it went.
 */
import { addedMessage, addedTone } from '@unlease/notes/services/savedLinks';
import { extractUrls } from '@unlease/core/services/url';
import { INBOX_ID } from '@unlease/notes/models/entities';

import { addLinks, createNote, readingEnabled } from './store/actions';
import { useLibraryStore } from './store/library';
import { showSnack } from '@shared/app/store/ui';
import { startTransfer, type SharedNote } from './store/notesUi';

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

/** The title a link takes: the words beside a lone link, else what came with it (a share's page title). */
export function captureTitle(text: string, urls: readonly string[], fallback = ''): string {
  return urls.length === 1 ? titleBesides(text, urls[0]!) || fallback : '';
}

/**
 * File links, with the transfer panel when the server reads them, a snackbar otherwise. An address
 * saved already is not added (Claude would file it beside itself): the snackbar says where it is.
 */
export function fileUrls(urls: readonly string[], title: string): string[] {
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
  return fileUrls(urls, captureTitle(text, urls));
}

/** What a share brings, read without saving anything. */
export type SharedContent =
  /** For the capture dialog: its text, and the page title the browser sent beside a lone link. */
  | { readonly kind: 'links'; readonly text: string; readonly title: string }
  | ({ readonly kind: 'note' } & SharedNote)
  | { readonly kind: 'none' };

/**
 * What the share target receives (`/capture/share?title=…&text=…&url=…`). Any page can open that
 * address, so nothing is saved from it on arrival: links prefill the capture dialog and text waits
 * for the person to make it a note, both kept only once confirmed.
 */
export function readShare(share: { readonly title: string; readonly text: string; readonly url: string }): SharedContent {
  const text = [share.text, share.url].filter(Boolean).join(' ').trim();
  const urls = extractUrls(text || share.title);
  if (urls.length > 0) return { kind: 'links', text: text || share.title.trim(), title: share.title.trim().slice(0, 140) };
  if (text || share.title.trim()) return { kind: 'note', title: share.title.slice(0, 200), body: share.text };
  return { kind: 'none' };
}

/** The note a share without a link becomes, once the person says so. */
export function noteFromShare(shared: SharedNote): string {
  return createNote({ kind: 'text', title: shared.title, body: shared.body });
}
