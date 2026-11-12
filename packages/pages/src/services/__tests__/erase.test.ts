import type { Block, BlockKind } from '../../models/blocks';
import { blockFields, blockFromRecord } from '../../sync/entities';
import { pagesEraseChanges, pagesEraseParts } from '../erase';

function block(id: string, kind: BlockKind, parentId: string | null, extra: Partial<Block> = {}): Block {
  return blockFromRecord({ type: 'block', id, fields: blockFields({ parentId, position: 'a0', kind, createdAt: 0, ...extra }), clocks: {} });
}

/** Voyage (a picture, a sub-page in the bin), a block whose page is gone, the journal and two days, a page deleted for good. */
function library() {
  const list = [
    block('voyage', 'page', null, { text: 'Voyage' }),
    block('photo', 'image', 'voyage'),
    block('lisbonne', 'page', 'voyage', { text: 'Lisbonne', trashedAt: 5 }),
    block('note', 'text', 'lisbonne'),
    block('stray', 'text', 'missing'),
    block('journal', 'page', null, { text: 'Journal' }),
    block('day1', 'page', 'journal', { text: 'Lundi 2 novembre 2026' }),
    block('day1text', 'text', 'day1'),
    block('day2', 'page', 'journal', { text: 'Mardi 3 novembre 2026', private: true }),
    block('gone', 'page', null, { text: 'Partie', deletedAt: 3 }),
    // A page named « Journal » further down is a page like any other.
    block('subjournal', 'page', 'voyage', { text: 'Journal' }),
  ];
  return { blocks: Object.fromEntries(list.map(entry => [entry.id, entry])) };
}

describe('erasing Pages’ data', () => {
  it('counts two disjoint parts: the pages with the bin, the journal with its days', () => {
    const parts = pagesEraseParts(library());
    expect(parts.map(part => [part.id, part.count, part.detail])).toEqual([
      ['pages', 6, '3\u00a0pages, dont 1 dans la corbeille'],
      ['journal', 4, '« Journal » et 2\u00a0notes du jour'],
    ]);
  });

  it('tombstones every live block of the parts chosen, nothing else', () => {
    const changes = pagesEraseChanges(library(), new Set(['journal']), 9);
    expect(changes.map(change => change.id).sort()).toEqual(['day1', 'day1text', 'day2', 'journal']);
    expect(changes.every(change => change.type === 'block' && change.patch.deletedAt === 9)).toBe(true);
    const all = pagesEraseChanges(library(), new Set(['pages', 'journal']), 9).map(change => change.id);
    expect(all).toHaveLength(10);
    expect(all).not.toContain('gone');
  });

  it('says a part holding nothing, and erases nothing when nothing is chosen', () => {
    const empty = pagesEraseParts({ blocks: {} });
    expect(empty.map(part => part.count)).toEqual([0, 0]);
    expect(pagesEraseChanges(library(), new Set(), 9)).toEqual([]);
  });
});
