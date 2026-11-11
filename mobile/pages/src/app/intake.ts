/**
 * Text shared to Pages (« Ajouter à Pages » in Android's share sheet): a new page at the top level,
 * opened at once. Its title is what the sending app named it (a web page's title, a mail's subject),
 * else its first line; the rest is its content, read as a paste is (a paragraph per line, Markdown's
 * headings, lists and links understood), so a shared link is a paragraph linking to it. Text only:
 * pictures and files are not taken.
 */
import { blocksFromText, type BlockDraft } from '@unlease/pages/services/pageText';
import { onShare, takePendingShare, type Share } from '@platform/intake';

import { createPageFrom } from './store/pages';

/** A title longer than this is no title: the line stays in the page. */
const TITLE_MAX = 200;

const LINK_ALONE = /^https?:\/\/\S+$/i;

/** The page a share makes, or null when it holds nothing. */
export function sharedPage(share: Pick<Share, 'text' | 'subject'>): { readonly title: string; readonly drafts: BlockDraft[] } | null {
  const text = share.text.replace(/\r\n?/g, '\n').trim();
  const subject = share.subject.replace(/\s+/g, ' ').trim();
  if (subject) return { title: subject.slice(0, TITLE_MAX), drafts: text === subject ? [] : blocksFromText(text) };
  if (!text) return null;
  const [first = '', ...rest] = text.split('\n');
  const line = first.trim().replace(/^#{1,6}\s+/, '');
  // A link alone, or a long first line, is content: the page goes untitled.
  if (LINK_ALONE.test(line) || line.length > TITLE_MAX) return { title: '', drafts: blocksFromText(text) };
  return { title: line, drafts: blocksFromText(rest.join('\n')) };
}

const handled = new Set<string>();

function receive(share: Share, open: (id: string) => void): void {
  // A share can arrive both as the pending one and as an event: once is enough.
  if (handled.has(share.id)) return;
  handled.add(share.id);
  const page = sharedPage(share);
  if (page) open(createPageFrom(page));
}

/** From the root, once the navigator is ready: the share that opened the app, then those that come while it runs; `open` shows the new page. */
export function listenForShares(open: (id: string) => void): () => void {
  takePendingShare()
    .then(share => (share ? receive(share, open) : undefined))
    .catch(() => undefined);
  return onShare(share => receive(share, open));
}
