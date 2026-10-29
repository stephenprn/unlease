/**
 * Shares into the app, never asking first: links go to "Non classé" (the server files them),
 * images become a photo note, plain text a note.
 */
import { extractUrls } from '@unlease/core/services/url';
import type { Share } from '@platform/intake';

import { attachSharedPaths } from './media';
import { addLinks, createNote, readingEnabled, type PlacedLink } from './store/actions';

export type IntakeResult =
  /** `reading`: the server reads and files the new ones; otherwise they stay plain in "Non classé". An address saved already is not added. */
  | { readonly kind: 'links'; readonly links: readonly PlacedLink[]; readonly reading: boolean }
  | { readonly kind: 'note'; readonly id: string }
  | { readonly kind: 'none' };

/** The words around a shared link, when they look like its title. */
function titleBesides(text: string, url: string): string {
  const rest = text.replace(url, '').replace(/\s+/g, ' ').trim().replace(/[:\-–—|]+$/, '').trim();
  return rest.length >= 3 && rest.length <= 140 ? rest : '';
}

export async function receiveShare(share: Share): Promise<IntakeResult> {
  const text = share.text || '';
  const urls = extractUrls(text || share.subject);
  if (share.files.length > 0) {
    const id = createNote({ kind: 'text', title: share.subject.slice(0, 200), body: text });
    await attachSharedPaths(id, share.files);
    return { kind: 'note', id };
  }
  if (urls.length > 0) {
    // Browsers send the page title as the subject; other apps leave it beside the link.
    const title = urls.length === 1 ? share.subject.trim().slice(0, 140) || titleBesides(text, urls[0]!) : '';
    return { kind: 'links', links: addLinks(urls, { autoFile: true, title }), reading: readingEnabled() };
  }
  if (text.trim() || share.subject.trim()) {
    return { kind: 'note', id: createNote({ kind: 'text', title: share.subject.slice(0, 200), body: text }) };
  }
  return { kind: 'none' };
}
