import type { Fields } from '@unlease/core/sync/record';
import type { BlockKind } from '../../models/blocks';
import { blockFields } from '../../sync/entities';
import type { PageVersion, VersionBlock } from '../../sync/versions';
import { canonical, compareVersions, restorePlan, snapshotBlocks, versionKey, versionOutline, versionsToDrop, type BlockSource } from '../versions';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function fields(kind: BlockKind, parentId: string | null, position: string, extra: Fields = {}): Fields {
  return { ...blockFields({ parentId, position, kind, createdAt: 1 }), ...extra };
}

/** A store of blocks, as the server or a client reads it. */
function source(blocks: Record<string, Fields>): BlockSource & { blocks: Record<string, Fields> } {
  return {
    blocks,
    fieldsOf: id => blocks[id],
    childrenOf: id => Object.keys(blocks).filter(child => blocks[child]!.parentId === id && typeof blocks[child]!.deletedAt !== 'number'),
  };
}

/** « Voyage »: a heading, a list with an item under it, a sub-page in a toggle, and a page elsewhere. */
function voyage(): Record<string, Fields> {
  return {
    voyage: fields('page', null, 'a0', { text: 'Voyage', icon: '🧳' }),
    title: fields('h1', 'voyage', 'a0', { text: 'Lisbonne' }),
    list: fields('bullet', 'voyage', 'a1', { text: 'Valise' }),
    item: fields('todo', 'list', 'a0', { text: 'Passeport', checked: false }),
    toggle: fields('toggle', 'voyage', 'a2', { text: 'Plus' }),
    sub: fields('page', 'toggle', 'a0', { text: 'Hôtels' }),
    subText: fields('text', 'sub', 'a0', { text: 'Pas dans Voyage' }),
    gone: fields('text', 'voyage', 'a3', { text: 'Effacé', deletedAt: 5 }),
    other: fields('page', null, 'a1', { text: 'Ailleurs' }),
  };
}

const version = (blocks: readonly VersionBlock[], id = 1): PageVersion => ({ id, at: 10, pageId: 'voyage', blocks });

describe('a page’s versions', () => {
  it('holds the page, its live blocks and its sub-pages, not what the sub-pages hold', () => {
    const snapshot = snapshotBlocks('voyage', source(voyage()))!;
    expect(snapshot.map(block => block.id)).toEqual(['item', 'list', 'sub', 'title', 'toggle', 'voyage']);
    expect(snapshotBlocks('missing', source(voyage()))).toBeNull();
    expect(snapshotBlocks('title', source(voyage()))).toBeNull();
  });

  it('reads the same whatever the order of keys and blocks', () => {
    expect(canonical({ b: 1, a: [{ d: 2, c: null }] })).toBe(canonical({ a: [{ c: null, d: 2 }], b: 1 }));
    const snapshot = snapshotBlocks('voyage', source(voyage()))!;
    expect(versionKey([...snapshot].reverse())).toBe(versionKey(snapshot));
  });

  it('counts what changed from one version to the next', () => {
    const before = snapshotBlocks('voyage', source(voyage()))!;
    const blocks = voyage();
    blocks.item = { ...blocks.item!, checked: true };
    blocks.title = { ...blocks.title!, deletedAt: 9 };
    blocks.added = fields('text', 'voyage', 'a4', { text: 'Nouveau' });
    expect(compareVersions(before, snapshotBlocks('voyage', source(blocks))!)).toEqual({ added: 1, removed: 1, changed: 1 });
  });

  it('keeps every version for a day, then the last of each day until 90 days, the newest always', () => {
    const now = Date.UTC(2026, 10, 13, 12);
    const versions = [
      { id: 1, at: now - 1 * HOUR },
      { id: 2, at: now - 3 * HOUR },
      { id: 3, at: Date.UTC(2026, 10, 11, 18) },
      { id: 4, at: Date.UTC(2026, 10, 11, 9) },
      { id: 5, at: Date.UTC(2026, 10, 10, 9) },
      { id: 6, at: now - 91 * DAY },
    ];
    expect(versionsToDrop(versions, now).sort()).toEqual([4, 6]);
    // The only one left, however old, stays.
    expect(versionsToDrop([{ id: 7, at: now - 400 * DAY }], now)).toEqual([]);
  });

  it('marks each block of a version against the page now, in reading order', () => {
    const old = version(snapshotBlocks('voyage', source(voyage()))!);
    const blocks = voyage();
    blocks.item = { ...blocks.item!, checked: true };
    blocks.list = { ...blocks.list!, deletedAt: 9 };
    blocks.title = { ...blocks.title!, position: 'a5' };
    const rows = versionOutline(old, id => blocks[id]);
    expect(rows.map(row => [row.block.id, row.depth, row.mark])).toEqual([
      ['title', 0, 'same'],
      ['list', 0, 'gone'],
      ['item', 1, 'changed'],
      ['toggle', 0, 'same'],
      ['sub', 1, 'same'],
    ]);
  });

  it('restores a version as one batch: fields back, deleted blocks back, new blocks deleted, sub-pages kept', () => {
    const old = version(snapshotBlocks('voyage', source(voyage()))!);
    const now = source(voyage());
    now.blocks.voyage = { ...now.blocks.voyage!, text: 'Voyage au Portugal', private: true, parentId: 'other' };
    now.blocks.item = { ...now.blocks.item!, checked: true, caption: 'ajouté' };
    now.blocks.list = { ...now.blocks.list!, deletedAt: 9 };
    now.blocks.toggle = { ...now.blocks.toggle!, deletedAt: 9 };
    now.blocks.extra = fields('callout', 'voyage', 'a6', { text: 'Nouveau' });
    now.blocks.inner = fields('text', 'extra', 'a0', { text: 'Dedans' });
    now.blocks.sub = { ...now.blocks.sub!, parentId: 'extra' };
    const plan = restorePlan(old, now, 50);
    const byId = Object.fromEntries(plan.changes.map(change => [change.id, change.patch]));
    // The page gets its title back, never its place nor its privacy.
    expect(byId.voyage).toEqual({ text: 'Voyage' });
    expect(byId.item).toEqual({ checked: false, caption: '' });
    expect(byId.list).toEqual({ deletedAt: null });
    expect(byId.toggle).toEqual({ deletedAt: null });
    expect(byId.extra).toEqual({ deletedAt: 50 });
    expect(byId.inner).toEqual({ deletedAt: 50 });
    // The sub-page sat in a block the restore deletes: it moves to the page's end.
    expect(byId.sub!.parentId).toBe('voyage');
    expect(String(byId.sub!.position) > 'a2').toBe(true);
    expect(byId.title).toBeUndefined();
    expect(byId.subText).toBeUndefined();
    expect([plan.restored, plan.removed, plan.changed]).toEqual([2, 2, 2]);
  });

  it('creates a block this device never saw, and writes nothing for a page already as the version', () => {
    const old = version(snapshotBlocks('voyage', source(voyage()))!);
    const blocks = voyage();
    delete blocks.title;
    const plan = restorePlan(old, source(blocks), 50);
    expect(plan.changes).toEqual([{ id: 'title', patch: { ...voyage().title, deletedAt: null } }]);
    expect(restorePlan(old, source(voyage()), 50).changes).toEqual([]);
  });
});
