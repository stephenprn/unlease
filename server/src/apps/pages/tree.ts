/**
 * Pages' tree kept whole across devices. Each move is a write of one block's `parentId`, merged by
 * itself, so two devices can leave a tree no device made:
 *
 * - a loop: one moved page A into B while another moved B into A. Neither reaches the top level, so
 *   both, and all they hold, would vanish from every list. The move that closed it last is undone
 *   (back where this push says the block came from), or else a page of the loop goes to the top level;
 * - a block living in a container another device deleted (moved into a toggle as it was deleted,
 *   typed into a column the other device's move emptied and tidied away): hidden for good. It goes
 *   back where this push says it came from, or else where the deleted container stood. What lived in
 *   a page deleted for good stays with it, but a page in there goes to the top level.
 *
 * The server repairs once, with its own clock (`stampOver`), so every device takes the same tree:
 * after each push (`repairPageTree`), and hourly over every block for what was left before
 * (`repairPagesTree`). The apps also read a loop as broken at its newest move (`pages/services/blocks`)
 * until the repair reaches them.
 */
import type { StatementSync } from 'node:sqlite';
import { comparePositions, positionBetween } from '@unlease/core/services/fractionalIndex';
import { writeFields, type SyncRecord } from '@unlease/core/sync/record';
import type { Database } from '../../db/database';
import { log } from '../../log';
import type { RecordStore, StoredRecord } from '../../sync/records';
import type { PushRepair, ServerEdit, SyncService } from '../../sync/service';

/** Deeper than any real tree: a walk up stops here. */
const MAX_DEPTH = 256;

/** The tree as the repair reads it. */
export interface TreeLookup {
  get(id: string): SyncRecord | undefined;
  /** The blocks not deleted whose parent is `id`. */
  liveChildren(id: string): readonly SyncRecord[];
}

/** A block's new place. */
export interface Rehome {
  readonly id: string;
  readonly parentId: string | null;
  readonly position: string;
}

const parentOf = (block: SyncRecord): string | null => (typeof block.fields.parentId === 'string' ? block.fields.parentId : null);
const positionOf = (block: SyncRecord): string => (typeof block.fields.position === 'string' ? block.fields.position : '');
const isDeleted = (block: SyncRecord): boolean => typeof block.fields.deletedAt === 'number';
const isTrashed = (block: SyncRecord): boolean => typeof block.fields.trashedAt === 'number';
const isPage = (block: SyncRecord): boolean => block.fields.kind === 'page';

/**
 * Where the blocks of `loops` (those whose parent changed: they may close a loop) and of `orphans`
 * (those whose container may be gone) should be. `before`: how a block stood before the push that
 * changed it, when known (its last move can then be undone).
 */
export function planTreeRepairs(lookup: TreeLookup, loops: Iterable<string>, orphans: Iterable<string>, before: (id: string) => SyncRecord | undefined = () => undefined): Rehome[] {
  const moved = new Map<string, Rehome>();
  const view = (id: string): SyncRecord | undefined => {
    const block = lookup.get(id);
    const place = moved.get(id);
    return block && place ? { ...block, fields: { ...block.fields, parentId: place.parentId, position: place.position } } : block;
  };
  const place = (id: string, parentId: string | null, position: string): void => {
    moved.set(id, { id, parentId, position });
  };

  /** The loop above `id` (its blocks, in walking order), if its walk up comes back on itself. */
  const loopAbove = (id: string): string[] | null => {
    const seen = new Map<string, number>();
    const path: string[] = [];
    let current: string | null = id;
    for (let depth = 0; current !== null && depth < MAX_DEPTH; depth += 1) {
      const at = seen.get(current);
      if (at !== undefined) return path.slice(at);
      seen.set(current, path.length);
      path.push(current);
      const block = view(current);
      if (!block) return null;
      current = parentOf(block);
    }
    return null;
  };

  /** A parent that would close no loop: it exists, it is not deleted, and its walk up meets none of `loop`. */
  const safeParent = (parentId: string | null, loop: ReadonlySet<string>): boolean => {
    let current = parentId;
    for (let depth = 0; current !== null && depth < MAX_DEPTH; depth += 1) {
      if (loop.has(current)) return false;
      const block = view(current);
      if (!block) return depth > 0;
      if (depth === 0 && isDeleted(block)) return false;
      current = parentOf(block);
    }
    return true;
  };

  const breakLoop = (loop: readonly string[]): void => {
    const members = new Set(loop);
    // The newest move first: the one that closed the loop, as far as anyone can tell.
    const newest = [...loop].sort((a, b) => {
      const ca = lookup.get(a)?.clocks.parentId ?? '';
      const cb = lookup.get(b)?.clocks.parentId ?? '';
      return ca !== cb ? (ca > cb ? -1 : 1) : a > b ? -1 : 1;
    });
    for (const id of newest) {
      const prior = before(id);
      const now = view(id);
      if (!prior || !now || parentOf(prior) === parentOf(now)) continue;
      const old = parentOf(prior);
      if (old === null ? !isPage(now) : !safeParent(old, members)) continue;
      place(id, old, positionOf(prior));
      return;
    }
    const page = newest.find(id => {
      const block = view(id);
      return block !== undefined && isPage(block);
    });
    if (page !== undefined) {
      place(page, null, positionOf(view(page)!));
      return;
    }
    log.warn('pages: a loop of blocks with no page in it and no move to undo, left as it is', { blocks: loop });
  };

  for (const id of loops) {
    const loop = loopAbove(id);
    if (loop) breakLoop(loop);
  }

  /** Each live container's next free place after a deleted one, for the blocks set where it stood. */
  const slots = new Map<string, string>();
  const slotAfter = (container: string, gone: SyncRecord): string => {
    const key = `${container}:${gone.id}`;
    const after = slots.get(key) ?? positionOf(gone);
    const next = [...lookup.liveChildren(container)]
      .map(child => view(child.id) ?? child)
      .filter(child => parentOf(child) === container && !moved.has(child.id))
      .map(child => ({ id: child.id, position: positionOf(child) }))
      .sort(comparePositions)
      .find(child => comparePositions(child, { id: gone.id, position: after }) > 0);
    const position = positionBetween(after, next?.position ?? null);
    slots.set(key, position);
    return position;
  };

  const homeless = [...new Set(orphans)]
    .map(id => view(id))
    .filter((block): block is SyncRecord => block !== undefined)
    .map(block => ({ id: block.id, position: positionOf(block) }))
    .sort(comparePositions);
  for (const { id } of homeless) {
    const block = view(id);
    if (!block || isDeleted(block) || isTrashed(block)) continue;
    const parentId = parentOf(block);
    const parent = parentId === null ? undefined : view(parentId);
    if (!parent || !isDeleted(parent)) continue;
    // Moved in by this push: back where it came from.
    const prior = before(id);
    if (prior && parentOf(prior) !== parentId) {
      const old = parentOf(prior);
      const oldBlock = old === null ? undefined : view(old);
      if (old === null ? isPage(block) : oldBlock !== undefined && !isDeleted(oldBlock)) {
        place(id, old, positionOf(prior));
        continue;
      }
    }
    // Up through the deleted containers to the first block that lives.
    let top = parent;
    let crossesPage = isPage(parent);
    let above: SyncRecord | undefined;
    for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
      const next = parentOf(top);
      above = next === null ? undefined : view(next);
      if (!above || !isDeleted(above)) break;
      top = above;
      crossesPage ||= isPage(above);
    }
    if (crossesPage || !above) {
      // The content of a page deleted for good stays with it; a page is a page of its own.
      if (isPage(block)) place(id, null, positionOf(block));
      continue;
    }
    place(id, above.id, slotAfter(above.id, top));
  }
  return [...moved.values()];
}

// ── after each push ────────────────────────────────────────────────────────

const statements = new WeakMap<Database, { readonly children: StatementSync; readonly childrenOfAny: StatementSync; readonly blocks: StatementSync }>();

function prepared(db: Database) {
  let found = statements.get(db);
  if (!found) {
    found = {
      children: db.prepare(
        `SELECT type, id, fields, clocks, seq FROM records WHERE type = 'block'
         AND json_extract(fields, '$.parentId') = ? AND json_extract(fields, '$.deletedAt') IS NULL`,
      ),
      childrenOfAny: db.prepare(
        `SELECT type, id, fields, clocks, seq FROM records WHERE type = 'block'
         AND json_extract(fields, '$.parentId') IN (SELECT value FROM json_each(?)) AND json_extract(fields, '$.deletedAt') IS NULL`,
      ),
      blocks: db.prepare(`SELECT type, id, fields, clocks, seq FROM records WHERE type = 'block'`),
    };
    statements.set(db, found);
  }
  return found;
}

type Row = { type: string; id: string; fields: string; clocks: string; seq: number };
const fromRow = (row: Row): StoredRecord => ({
  type: row.type,
  id: row.id,
  fields: JSON.parse(row.fields) as Record<string, unknown>,
  clocks: JSON.parse(row.clocks) as Record<string, string>,
  seq: row.seq,
});

/** Each block of a push that moved, or left a container's blocks behind as it was deleted, checked: the repairs as server writes. */
export const repairPageTree: PushRepair = (pushed, { records, clock }) => {
  const blocks = pushed.filter(({ record }) => record.type === 'block');
  if (blocks.length === 0) return [];
  const { children, childrenOfAny } = prepared(records.db);
  const lookup: TreeLookup = {
    get: id => records.get('block', id),
    liveChildren: id => (children.all(id) as unknown as Row[]).map(fromRow),
  };
  const loops: string[] = [];
  const orphans: string[] = [];
  const deleted: string[] = [];
  for (const { record, before } of blocks) {
    if (isDeleted(record)) {
      if (!before || !isDeleted(before)) deleted.push(record.id);
      continue;
    }
    if (!before || parentOf(before) !== parentOf(record)) loops.push(record.id);
    orphans.push(record.id);
  }
  // What lives on in the containers this push deleted, in one read.
  if (deleted.length > 0) for (const row of childrenOfAny.all(JSON.stringify(deleted)) as unknown as Row[]) orphans.push(row.id);
  const before = new Map(blocks.map(({ record, before: prior }) => [record.id, prior]));
  const out: SyncRecord[] = [];
  for (const { id, parentId, position } of planTreeRepairs(lookup, loops, orphans, id => before.get(id))) {
    const current = records.get('block', id);
    if (!current) continue;
    const patch: Record<string, unknown> = {};
    if (current.fields.parentId !== parentId) patch.parentId = parentId;
    if (current.fields.position !== position) patch.position = position;
    if (Object.keys(patch).length === 0) continue;
    out.push(writeFields(current, patch, clock.stampOver([current.clocks.parentId, current.clocks.position])));
  }
  if (out.length > 0) log.info('pages: a tree two devices changed at once repaired', { blocks: out.map(block => block.id) });
  return out;
};

/** Every block checked (what was broken before the repair after each push existed): returns how many records it changed. */
export function repairPagesTree(db: Database, sync: SyncService): number {
  const all = (prepared(db).blocks.all() as unknown as Row[]).map(fromRow);
  const byId = new Map(all.map(block => [block.id, block]));
  const under = new Map<string, SyncRecord[]>();
  for (const block of all) {
    const parentId = parentOf(block);
    if (parentId === null || isDeleted(block)) continue;
    const siblings = under.get(parentId);
    if (siblings) siblings.push(block);
    else under.set(parentId, [block]);
  }
  const lookup: TreeLookup = { get: id => byId.get(id), liveChildren: id => under.get(id) ?? [] };
  // A walk up from every block, each block walked once: those on a loop, and those under a deleted one.
  const state = new Map<string, 'walking' | 'done'>();
  const loops: string[] = [];
  const orphans: string[] = [];
  for (const block of all) {
    if (isDeleted(block)) continue;
    const parentId = parentOf(block);
    const parent = parentId === null ? undefined : byId.get(parentId);
    if (parent && isDeleted(parent)) orphans.push(block.id);
    const path: string[] = [];
    let current: string | null = block.id;
    while (current !== null && !state.has(current)) {
      state.set(current, 'walking');
      path.push(current);
      const at: SyncRecord | undefined = byId.get(current);
      current = at ? parentOf(at) : null;
    }
    if (current !== null && state.get(current) === 'walking') loops.push(current);
    for (const id of path) state.set(id, 'done');
  }
  if (loops.length === 0 && orphans.length === 0) return 0;
  const plan = planTreeRepairs(lookup, loops, orphans);
  const edits: ServerEdit[] = plan.map(({ id, parentId, position }) => ({ type: 'block', id, patch: () => ({ parentId, position }) }));
  const written = sync.apply(edits).length;
  if (written > 0) log.info('pages: blocks out of every list put back in the tree', { blocks: written });
  return written;
}

/** A page's blocks and sub-pages at any depth, tombstoned ones included: what its purge took with it (`reviveRule`). */
export function descendantsOf(records: RecordStore, page: SyncRecord): StoredRecord[] {
  let statement = descendants.get(records.db);
  if (!statement) {
    statement = records.db.prepare(
      `WITH RECURSIVE under(id) AS (
         SELECT id FROM records WHERE type = 'block' AND json_extract(fields, '$.parentId') = ?
         UNION SELECT block.id FROM records AS block JOIN under ON block.type = 'block' AND json_extract(block.fields, '$.parentId') = under.id
       )
       SELECT type, id, fields, clocks, seq FROM records WHERE type = 'block' AND id IN (SELECT id FROM under)`,
    );
    descendants.set(records.db, statement);
  }
  return (statement.all(page.id) as unknown as Row[]).map(fromRow);
}

const descendants = new WeakMap<Database, StatementSync>();
