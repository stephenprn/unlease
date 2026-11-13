/**
 * « Effacer des données » in Pages (`core/services/erase`): two parts, disjoint, every block of each
 * erased with the pages, the bin's included, so ticking one keeps the other whole:
 *
 * - `pages`: every page but the journal's, with all it holds, those in the bin, and the blocks
 *   whose page is gone;
 * - `journal`: the « Journal » at the top (Agenda's « Note du jour » and Pages' « Journal du jour »
 *   write there, `sync/journal`) and its day pages, a diary a person may well keep apart.
 *
 * A page kept away from Claude is a page like any other here: being private says nothing of keeping it.
 */
import { t } from '@unlease/core/i18n';
import { tombstones, type EraseChange, type ErasePart } from '@unlease/core/services/erase';
import { plural } from '@unlease/core/services/format';
import { foldText } from '@unlease/core/services/search';
import type { Block } from '../models/blocks';
import { JOURNAL_WORDS } from '../sync/journal';
import { isInBin, type BlockMap } from './blocks';

export const PAGES_ERASE_PARTS = ['pages', 'journal'] as const;

export type PagesErasePart = (typeof PAGES_ERASE_PARTS)[number];

/** What both clients' stores hold: every block, the deleted ones too. */
export interface PagesEraseLibrary {
  readonly blocks: BlockMap;
}

const JOURNAL_TITLES = new Set(Object.values(JOURNAL_WORDS).map(words => foldText(words.journal)));

/** Deeper than any real tree: a walk up stops here. */
const MAX_DEPTH = 256;

const isJournal = (block: Block): boolean => block.kind === 'page' && block.parentId === null && JOURNAL_TITLES.has(foldText(block.text.trim()));

interface Sorted {
  readonly ids: Record<PagesErasePart, string[]>;
  /** The pages of each part (the journal's own page aside: its days). */
  readonly pages: Record<PagesErasePart, number>;
  /** The pages of `pages` in the bin. */
  readonly binned: number;
}

/** Each live block in its part: the journal's when the page at the top of its chain is a « Journal ». */
function sort(library: PagesEraseLibrary): Sorted {
  const { blocks } = library;
  const part = new Map<string, PagesErasePart>();
  const partOf = (id: string): PagesErasePart => {
    const known = part.get(id);
    if (known) return known;
    const chain: string[] = [];
    let current: Block | undefined = blocks[id];
    let found: PagesErasePart = 'pages';
    for (let depth = 0; current && depth < MAX_DEPTH; depth += 1) {
      const seen = part.get(current.id);
      if (seen) {
        found = seen;
        break;
      }
      chain.push(current.id);
      if (current.parentId === null) {
        found = isJournal(current) ? 'journal' : 'pages';
        break;
      }
      // A loop two devices' moves made, or a chain too deep, is the pages'.
      if (chain.includes(current.parentId)) break;
      current = blocks[current.parentId];
    }
    for (const each of chain) part.set(each, found);
    return found;
  };
  const ids: Record<PagesErasePart, string[]> = { pages: [], journal: [] };
  const pages: Record<PagesErasePart, number> = { pages: 0, journal: 0 };
  let binned = 0;
  for (const block of Object.values(blocks)) {
    if (block.deletedAt !== null) continue;
    const which = partOf(block.id);
    ids[which].push(block.id);
    if (block.kind !== 'page' || isJournal(block)) continue;
    pages[which] += 1;
    if (which === 'pages' && isInBin(blocks, block.id)) binned += 1;
  }
  return { ids, pages, binned };
}

/** The parts as Réglages › Données › « Effacer des données » lists them, counted now. */
export function pagesEraseParts(library: PagesEraseLibrary): ErasePart[] {
  const { ids, pages, binned } = sort(library);
  const pagesDetail = pages.pages > 0 ? (binned > 0 ? t('{pages}, {binned} of them in the bin', { pages: plural(pages.pages, 'page'), binned }) : plural(pages.pages, 'page')) : plural(ids.pages.length, 'block without a page', 'blocks without a page');
  const journalDetail = pages.journal > 0 ? t('“Journal” and {days}', { days: plural(pages.journal, 'daily note', 'daily notes') }) : t('The “Journal” page, with no daily note');
  return [
    { id: 'pages', title: t('Your pages'), detail: pagesDetail, count: ids.pages.length, glyph: 'page' },
    { id: 'journal', title: t('The journal'), detail: journalDetail, count: ids.journal.length, glyph: 'today' },
  ];
}

/** The tombstones of the parts chosen: every live block of each, in one batch. */
export function pagesEraseChanges(library: PagesEraseLibrary, chosen: ReadonlySet<string>, now: number): EraseChange[] {
  const { ids } = sort(library);
  return PAGES_ERASE_PARTS.filter(part => chosen.has(part)).flatMap(part => tombstones('block', ids[part], now));
}
