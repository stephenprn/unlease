import { formatHlc } from '@unlease/core/sync/hlc';
import { writeFields, type SyncRecord } from '@unlease/core/sync/record';
import { ROOT } from '@unlease/pages/services/blocks';

import { blocksProjection } from '../blocksProjection';

const page = (id: string, parentId: string | null, wall: number, node = 'phone00001'): SyncRecord =>
  writeFields({ type: 'block', id, fields: {}, clocks: {} }, { kind: 'page', parentId, position: 'a0', text: id, trashedAt: null, deletedAt: null, createdAt: 1 }, formatHlc(wall, 0, node));

describe('a loop of pages two devices made', () => {
  it('is filed broken at its newest move, with everything in it, and as stored once repaired', () => {
    const projection = blocksProjection();
    let state = projection.decode(projection.empty, [page('A', null, 1000), page('B', null, 1000), page('C', 'B', 1000)]);
    // Here B went into A; elsewhere, later, A into B.
    state = projection.decode(state, [page('B', 'A', 2000)]);
    state = projection.decode(state, [page('A', 'B', 3000, 'web0000001')]);
    expect(state.blocksByParent[ROOT]).toEqual(['A']);
    expect(state.blocksByParent.A).toEqual(['B']);
    expect(state.blocksByParent.B).toEqual(['C']);
    // The server's repair: B back at the top level.
    state = projection.decode(state, [page('B', null, 4000, 'srvtest001')]);
    expect(state.blocksByParent[ROOT]).toEqual(['B']);
    expect([...(state.blocksByParent.B ?? [])].sort()).toEqual(['A', 'C']);
    expect(state.blocksByParent.A).toBeUndefined();
  });
});
