/**
 * Shares into the app, never asking first (Android's share sheet is the person's own choice): links
 * go to "Non classé" (the server files them), or straight into the collection whose sharing shortcut
 * the share came through (the share sheet's first row, `shareShortcuts.ts`), the first
 * `MAX_SHARED_URLS` of a share only; images become a photo note, plain text a note. Text selected in
 * another app (« Noter dans Carnet ») comes as a share of that text.
 */
import { extractUrls } from '@unlease/core/services/url';
import { capSharedUrls } from '@unlease/notes/services/savedLinks';
import type { Share } from '@platform/intake';

import { attachSharedPaths } from './media';
import { collectionOfShortcut } from './shareShortcuts';
import { addLinks, createNote, readingEnabled, type PlacedLink } from './store/actions';

export type IntakeResult =
  /**
   * `reading`: the server reads and files the new ones; otherwise they stay plain in "Non classé". An address saved already is not added.
   * `more`: the links the share offered past the first `MAX_SHARED_URLS`, left out.
   * `into`: the collection the share was sent to (its sharing shortcut), the person's choice; null: « Non classé », for the server to file.
   */
  | { readonly kind: 'links'; readonly links: readonly PlacedLink[]; readonly reading: boolean; readonly more: number; readonly into: string | null }
  | { readonly kind: 'note'; readonly id: string }
  | { readonly kind: 'none' };

/** The words around a shared link, when they look like its title. */
function titleBesides(text: string, url: string): string {
  const rest = text.replace(url, '').replace(/\s+/g, ' ').trim().replace(/[:\-–—|]+$/, '').trim();
  return rest.length >= 3 && rest.length <= 140 ? rest : '';
}

export async function receiveShare(share: Share): Promise<IntakeResult> {
  const text = share.text || '';
  const { urls, more } = capSharedUrls(extractUrls(text || share.subject));
  if (share.files.length > 0) {
    const id = createNote({ kind: 'text', title: share.subject.slice(0, 200), body: text });
    await attachSharedPaths(id, share.files);
    return { kind: 'note', id };
  }
  if (urls.length > 0) {
    // Browsers send the page title as the subject; other apps leave it beside the link.
    const title = urls.length === 1 ? share.subject.trim().slice(0, 140) || titleBesides(text, urls[0]!) : '';
    // Sent to a collection: they go there as the person placed them (never filed again by Claude).
    const into = collectionOfShortcut(share.shortcutId);
    const links = into ? addLinks(urls, { noteId: into, title }) : addLinks(urls, { autoFile: true, title });
    return { kind: 'links', links, reading: readingEnabled(), more, into };
  }
  if (text.trim() || share.subject.trim()) {
    return { kind: 'note', id: createNote({ kind: 'text', title: share.subject.slice(0, 200), body: text }) };
  }
  return { kind: 'none' };
}
