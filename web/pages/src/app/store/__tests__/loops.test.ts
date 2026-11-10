import { beforeEach, describe, expect, it } from 'vitest';

import { formatHlc } from '@unlease/core/sync/hlc';
import { writeFields } from '@unlease/core/sync/record';
import { isInBin, ROOT } from '@unlease/pages/services/blocks';

import { freshLibrary } from '@test/library';
import { getRecord, mergeRemote } from '@shared/app/store/records';
import { livePageIds } from '../../hooks/usePages';
import { useBlocksStore } from '../blocks';
import { createPage, movePage } from '../pages';

const T0 = Date.now() + 3_600_000;
const state = () => useBlocksStore.getState();
const kids = (id: string): string[] => [...(state().blocksByParent[id] ?? [])];

/** Another device's move of a page, as the server sends it. */
function movedElsewhere(id: string, parentId: string | null, wall: number): void {
  mergeRemote([writeFields(getRecord('block', id)!, { parentId }, formatHlc(wall, 0, 'other00001'))], wall);
}

describe('a loop of pages two devices made', () => {
  beforeEach(async () => {
    await freshLibrary({ now: T0 });
  });

  it('is shown broken at its newest move, with everything in it, until the server repairs it', () => {
    const a = createPage({ title: 'A' }, T0);
    const b = createPage({ title: 'B' }, T0 + 1);
    const inside = createPage({ parentId: b, title: 'B1' }, T0 + 2);
    // Here B went into A; elsewhere, later, A into B.
    expect(movePage(b, { into: a }, T0 + 3)).toBe(true);
    movedElsewhere(a, b, T0 + 10_000);
    // A, moved last, shows at the top level, B in it, B1 in B: nothing is lost from the lists.
    expect(kids(ROOT)).toContain(a);
    expect(kids(a)).toEqual([b]);
    expect(kids(b)).toEqual([inside]);
    expect(livePageIds(state()).sort()).toEqual([a, b, inside].sort());
    for (const id of [a, b, inside]) expect(isInBin(state().blocks, id)).toBe(false);
    // The server's repair (B back at the top level) files them as stored again.
    movedElsewhere(b, null, T0 + 20_000);
    expect(kids(ROOT)).toEqual(expect.arrayContaining([b]));
    expect(kids(b)).toEqual(expect.arrayContaining([a, inside]));
    expect(kids(a)).toEqual([]);
  });
});
