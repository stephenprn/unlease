/**
 * The pages that mention something (`GET /api/pages/mentions`, `core/sync/mentions`): a block's text
 * holding its mention (`{@contact=<id>}`), or a bookmark or an embed pointing at it. Each page once,
 * the most recently changed first; nothing in the bin.
 */
import { MENTION_PLACES_MAX, mentionMarkups, type MentionPlace } from '@unlease/core/sync/mentions';
import { UNTITLED_PAGE, type Block } from '@unlease/pages/models/blocks';
import { ancestorPages, containingPage, isInBin } from '@unlease/pages/services/blocks';
import { blockFromRecord } from '@unlease/pages/sync/entities';
import type { RecordStore } from '../../sync/records';

function allBlocks(records: RecordStore): Record<string, Block> {
  const out: Record<string, Block> = {};
  for (const record of records.ofType('block')) {
    const block = blockFromRecord(record);
    if (block.deletedAt === null) out[block.id] = block;
  }
  return out;
}

export function pagesMentioning(records: RecordStore, type: string, ids: readonly string[]): MentionPlace[] {
  const blocks = allBlocks(records);
  const markups = mentionMarkups(type, ids);
  const wanted = new Set(ids);
  const pages = new Map<string, number>();
  for (const block of Object.values(blocks)) {
    const mentions = markups.some(markup => block.text.includes(markup)) || (block.target !== null && block.target.type === type && wanted.has(block.target.id));
    if (!mentions) continue;
    const page = block.kind === 'page' ? block.id : containingPage(blocks, block.id);
    if (!page || isInBin(blocks, page)) continue;
    pages.set(page, Math.max(pages.get(page) ?? 0, block.editedAt));
  }
  return [...pages.entries()]
    .map(([id, editedAt]): MentionPlace => {
      const page = blocks[id]!;
      const within = ancestorPages(blocks, id)
        .map(above => above.text.trim() || UNTITLED_PAGE)
        .join(' / ');
      return { app: 'pages', type: 'page', id, title: page.text.trim(), within, icon: page.icon, editedAt: Math.max(editedAt, page.editedAt) };
    })
    .sort((a, b) => b.editedAt - a.editedAt)
    .slice(0, MENTION_PLACES_MAX);
}
