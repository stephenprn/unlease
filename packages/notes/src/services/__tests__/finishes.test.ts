import { describe, expect, it } from 'vitest';

import { finishChanges, pickedFinish, type Finished } from '../finishes';

const note = (id: string, color: Finished['color'] = null, pattern: Finished['pattern'] = null): Finished => ({ id, kind: 'text', color, pattern });
const collection = (id: string, color: Finished['color'] = 'blue'): Finished => ({ id, kind: 'links', color, pattern: null });

describe('what the picked notes wear in common', () => {
  it('shows the colour and the paper they share, and none when they differ', () => {
    expect(pickedFinish([note('a', 'yellow', 'grid'), note('b', 'yellow', 'grid')])).toEqual({ color: 'yellow', pattern: 'grid', notes: 2, collections: 0 });
    expect(pickedFinish([note('a', 'yellow'), note('b', 'aube')]).color).toBeUndefined();
    expect(pickedFinish([note('a', null, 'grid'), note('b', null, null)])).toMatchObject({ color: null, pattern: undefined });
  });

  it('reads the paper of the notes alone: a collection has none', () => {
    expect(pickedFinish([note('a', 'blue', 'dots'), collection('c', 'blue')])).toEqual({ color: 'blue', pattern: 'dots', notes: 1, collections: 1 });
    expect(pickedFinish([collection('c'), collection('d', 'red')])).toEqual({ color: undefined, pattern: undefined, notes: 0, collections: 2 });
  });
});

describe('a colour or a paper for all of them', () => {
  it('changes only those that do not wear it yet', () => {
    expect(finishChanges([note('a', 'red'), note('b')], { color: 'red' })).toEqual({ changes: [{ id: 'b', patch: { color: 'red' } }], kept: 0 });
    expect(finishChanges([note('a', null, 'grid'), note('b')], { pattern: 'grid' }).changes).toEqual([{ id: 'b', patch: { pattern: 'grid' } }]);
  });

  it('gives a collection a pigment, and lets it keep its own for anything else', () => {
    const picked = [note('a'), collection('c', 'blue')];
    expect(finishChanges(picked, { color: 'red' })).toEqual({ changes: [{ id: 'a', patch: { color: 'red' } }, { id: 'c', patch: { color: 'red' } }], kept: 0 });
    expect(finishChanges(picked, { color: 'aube' })).toEqual({ changes: [{ id: 'a', patch: { color: 'aube' } }], kept: 1 });
    expect(finishChanges(picked, { color: null })).toEqual({ changes: [], kept: 1 });
    expect(finishChanges(picked, { pattern: 'lines' })).toEqual({ changes: [{ id: 'a', patch: { pattern: 'lines' } }], kept: 1 });
  });
});
