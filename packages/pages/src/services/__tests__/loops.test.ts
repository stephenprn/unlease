/** A loop two devices' moves made (page A into B as B went into A): shown broken, never lost. */
import { formatHlc } from '@unlease/core/sync/hlc';
import { writeFields, type SyncRecord } from '@unlease/core/sync/record';
import { ancestorPages, containingPage, isInBin, isWithin, loopsToRefile, shownParent, type BlockMap } from '../blocks';
import { blockFromRecord } from '../../sync/entities';

const page = (id: string, parentId: string | null, wall: number, node = 'phone00001'): SyncRecord =>
  writeFields({ type: 'block', id, fields: {}, clocks: {} }, { kind: 'page', parentId, position: 'a0', text: id, trashedAt: null, deletedAt: null, createdAt: 1 }, formatHlc(wall, 0, node));
const map = (...records: SyncRecord[]): BlockMap => Object.fromEntries(records.map(record => [record.id, blockFromRecord(record)]));

describe('a loop of pages', () => {
  // The phone put A into B (its move the newer), the web B into A; C lives in A.
  const blocks = map(page('A', 'B', 2000), page('B', 'A', 1000, 'web0000001'), page('C', 'A', 500));

  it('is shown broken at its newest move: nothing in it counts as in the bin', () => {
    expect(shownParent(blocks, 'A')).toBeNull();
    expect(shownParent(blocks, 'B')).toBe('A');
    expect(isInBin(blocks, 'A')).toBe(false);
    expect(isInBin(blocks, 'B')).toBe(false);
    expect(isInBin(blocks, 'C')).toBe(false);
    expect(containingPage(blocks, 'A')).toBeNull();
    expect(ancestorPages(blocks, 'C').map(block => block.id)).toEqual(['A']);
    expect(ancestorPages(blocks, 'B').map(block => block.id)).toEqual(['A']);
    // Moving A into B (or under C) still counts as a loop.
    expect(isWithin(blocks, 'B', 'A')).toBe(true);
  });

  it('files the block it is broken at at the top level, and back once the loop is gone', () => {
    const stranded = new Set<string>();
    expect(loopsToRefile(blocks, ['A', 'B', 'C'], stranded).sort()).toEqual(['A', 'B']);
    expect([...stranded]).toEqual(['A']);
    // The server's repair: B back at the top level.
    const repaired = map(page('A', 'B', 2000), page('B', null, 3000, 'srvtest001'), page('C', 'A', 500));
    expect(loopsToRefile(repaired, ['B'], stranded)).toEqual(['A']);
    expect(stranded.size).toBe(0);
    expect(shownParent(repaired, 'A')).toBe('B');
  });

  it('still counts a page under one in the bin as in the bin', () => {
    const binned = map(page('A', 'B', 2000), { ...page('B', 'A', 1000, 'web0000001'), fields: { ...page('B', 'A', 1000).fields, trashedAt: 5 } }, page('C', 'A', 500));
    expect(isInBin(binned, 'C')).toBe(false);
    expect(isInBin(binned, 'B')).toBe(true);
    // A missing parent still hides a block.
    expect(isInBin(map(page('D', 'nowhere', 1)), 'D')).toBe(true);
  });
});
