/**
 * The day's page (« Note du jour ») as this device holds it: Pages' module makes it under a top-level
 * « Journal » page (`POST /api/pages/daily`, `pages/sync/journal`), titled with the day and its first
 * line naming it (`{@date=2026-11-09}`), and finds it again the same way: by its title in either
 * language, or a line holding the day. Agenda's « Aujourd'hui » finds it to open it rather than make
 * it, and keeps its day out of the pages' days listed. The server stays the one that finds it for
 * good (it remembers the one it made even renamed): not found here only means « make it, or find it ».
 */
import { foldText } from '@unlease/core/services/search';
import type { Block } from '../models/blocks';
import { dayTitle, JOURNAL_WORDS } from '../sync/journal';
import { isInBin, type BlockMap } from './blocks';

const JOURNAL_TITLES = new Set(Object.values(JOURNAL_WORDS).map(words => foldText(words.journal)));

/** The day's page under a « Journal », or null. */
export function dailyPageOf(blocks: BlockMap, day: string): string | null {
  const marker = `{@date=${day}}`;
  const all = Object.values(blocks) as Block[];
  const journals = new Set(
    all.filter(block => block.kind === 'page' && block.parentId === null && block.deletedAt === null && block.trashedAt === null && JOURNAL_TITLES.has(foldText(block.text.trim()))).map(block => block.id),
  );
  if (journals.size === 0) return null;
  const pages = all.filter(block => block.kind === 'page' && block.parentId !== null && journals.has(block.parentId) && block.deletedAt === null && block.trashedAt === null);
  const titles = new Set(Object.keys(JOURNAL_WORDS).map(lang => foldText(dayTitle(day, lang as keyof typeof JOURNAL_WORDS))));
  const titled = pages.find(page => titles.has(foldText(page.text.trim())) && !isInBin(blocks, page.id));
  if (titled) return titled.id;
  const days = new Set(pages.map(block => block.id));
  for (const block of all) {
    if (block.deletedAt !== null || block.parentId === null || !days.has(block.parentId) || !block.text.includes(marker)) continue;
    if (!isInBin(blocks, block.parentId)) return block.parentId;
  }
  return null;
}
