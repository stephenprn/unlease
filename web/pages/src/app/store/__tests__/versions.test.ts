import { beforeEach, describe, expect, it } from 'vitest';

import { snapshotBlocks } from '@unlease/pages/services/versions';
import type { PageVersion } from '@unlease/pages/sync/versions';

import { freshLibrary } from '@test/library';
import { getRecord } from '@shared/app/store/records';
import { useBlocksStore } from '../blocks';
import { undoPage } from '../pageHistory';
import { createPage, deleteBlocks, insertBlock, renamePage, restoreVersion, updateBlock } from '../pages';

const T0 = Date.now() + 3_600_000;
const state = () => useBlocksStore.getState();
const kids = (id: string): string[] => [...(state().blocksByParent[id] ?? [])];

/** The page as the server would keep it now. */
function version(pageId: string): PageVersion {
  const blocks = snapshotBlocks(pageId, { fieldsOf: id => getRecord('block', id)?.fields, childrenOf: id => state().blocksByParent[id] ?? [] })!;
  return { id: 1, at: T0, pageId, blocks };
}

describe('restoring a version', () => {
  beforeEach(async () => {
    await freshLibrary({ now: T0 });
  });

  it('brings the page back as it was in one step, which Undo and the page’s undo both take back', () => {
    const voyage = createPage({ title: 'Voyage' }, T0);
    const intro = insertBlock(voyage, voyage, 0, { kind: 'text', text: 'Lisbonne' }, T0 + 1);
    const task = insertBlock(voyage, voyage, 1, { kind: 'todo', text: 'Passeport' }, T0 + 2);
    const kept = version(voyage);

    renamePage(voyage, 'Voyage', 'Voyage au Portugal');
    updateBlock(voyage, task, { checked: true });
    deleteBlocks(voyage, [intro], null, T0 + 3);
    const added = insertBlock(voyage, voyage, 1, { kind: 'text', text: 'Porto' }, T0 + 4);

    const { plan, undo } = restoreVersion(kept, T0 + 5);
    expect([plan.restored, plan.removed, plan.changed]).toEqual([1, 1, 2]);
    expect(state().blocks[voyage]!.text).toBe('Voyage');
    expect(kids(voyage)).toEqual([intro, task]);
    expect(state().blocks[task]!.checked).toBe(false);
    expect(state().blocks[added]!.deletedAt).not.toBeNull();

    undo!();
    expect(kids(voyage)).toEqual([task, added]);
    expect(state().blocks[voyage]!.text).toBe('Voyage au Portugal');

    // Restored again, then taken back through the page's own undo.
    restoreVersion(kept, T0 + 6);
    expect(kids(voyage)).toEqual([intro, task]);
    undoPage(voyage);
    expect(kids(voyage)).toEqual([task, added]);
  });

  it('writes nothing when the page already reads as the version', () => {
    const voyage = createPage({ title: 'Voyage' }, T0);
    insertBlock(voyage, voyage, 0, { kind: 'text', text: 'Lisbonne' }, T0 + 1);
    const { plan, undo } = restoreVersion(version(voyage), T0 + 2);
    expect(plan.changes).toEqual([]);
    expect(undo).toBeNull();
  });
});
