/**
 * The days written in pages (`{@date=2026-11-12}` in a block's text), for Agenda's « Pages » layer:
 * each page once per day it names, with the time when one is written. Nothing in the bin, nothing
 * from a private page (`isPrivatePage`): a day written there stays there.
 */
import { parseRich } from '@unlease/core/services/richText';
import type { Block } from '../models/blocks';
import { containingPage, isInBin, type BlockMap } from './blocks';
import { isPrivatePage } from './pagesAsk';

export interface PageDate {
  /** `page-date:<page>:<day>`. */
  readonly key: string;
  readonly pageId: string;
  /** '' for an untitled page (the client says « Sans titre »). */
  readonly title: string;
  readonly icon: string | null;
  readonly day: string;
  /** `14:30`, or null for the day. */
  readonly time: string | null;
}

/** The pages naming a day in [from, to). */
export function pageDatesIn(blocks: BlockMap, from: string, to: string): PageDate[] {
  const out = new Map<string, PageDate>();
  for (const block of Object.values(blocks) as Block[]) {
    if (block.deletedAt !== null || !block.text.includes('{@date=')) continue;
    const pageId = block.kind === 'page' ? block.id : containingPage(blocks, block.id);
    if (!pageId || isInBin(blocks, pageId) || isPrivatePage(blocks, pageId)) continue;
    const page = blocks[pageId];
    if (!page) continue;
    for (const run of parseRich(block.text)) {
      if (run.kind !== 'date' || run.date < from || run.date >= to) continue;
      const key = `page-date:${pageId}:${run.date}`;
      const before = out.get(key);
      if (before && (before.time === null || run.time === null || before.time <= run.time)) continue;
      out.set(key, { key, pageId, title: page.text.trim(), icon: page.icon, day: run.date, time: run.time });
    }
  }
  return [...out.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : (a.time ?? '') < (b.time ?? '') ? -1 : 1));
}
