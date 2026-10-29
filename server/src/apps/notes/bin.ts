/**
 * Carnet's bin on the server. Hourly, it empties itself: a note trashed more than
 * TRASH_RETENTION_DAYS ago gets a `deletedAt` tombstone, and so do its checklist lines, links and
 * photos (records are never removed, or an offline device would bring them back); a page likewise,
 * with every block under it. A note a device restores after that comes back with what the purge took.
 */
import type { StatementSync } from 'node:sqlite';
import { TRASH_RETENTION_DAYS } from '@unlease/notes/models/entities';
import { hlcNode, hlcWall } from '@unlease/core/sync/hlc';
import { writeFields, type SyncRecord } from '@unlease/core/sync/record';
import type { Database } from '../../db/database';
import { log } from '../../log';
import type { RecordStore, StoredRecord } from '../../sync/records';
import type { PushRule, ServerEdit, SyncService } from '../../sync/service';

const DAY = 86_400_000;

const statements = new WeakMap<Database, { readonly expiredNotes: StatementSync; readonly children: StatementSync; readonly expiredPages: StatementSync; readonly liveBlocks: StatementSync }>();

function prepared(db: Database) {
  let found = statements.get(db);
  if (!found) {
    found = {
      expiredNotes: db.prepare(
        `SELECT id, json_extract(clocks, '$.trashedAt') AS clock FROM records WHERE type = 'note'
         AND json_extract(fields, '$.deletedAt') IS NULL
         AND json_type(fields, '$.trashedAt') IN ('integer', 'real')
         AND json_extract(fields, '$.trashedAt') < ?`,
      ),
      children: db.prepare(
        `SELECT type, id, fields, clocks, seq FROM records WHERE type IN ('check', 'link', 'attachment')
         AND json_extract(fields, '$.noteId') = ?`,
      ),
      expiredPages: db.prepare(
        `SELECT id, json_extract(clocks, '$.trashedAt') AS clock FROM records WHERE type = 'block'
         AND json_extract(fields, '$.kind') = 'page'
         AND json_extract(fields, '$.deletedAt') IS NULL
         AND json_type(fields, '$.trashedAt') IN ('integer', 'real')
         AND json_extract(fields, '$.trashedAt') < ?`,
      ),
      liveBlocks: db.prepare(
        `SELECT id, json_extract(fields, '$.parentId') AS parentId,
         json_extract(fields, '$.kind') = 'page' AND json_type(fields, '$.trashedAt') IN ('integer', 'real') AS binned
         FROM records WHERE type = 'block' AND json_extract(fields, '$.deletedAt') IS NULL`,
      ),
    };
    statements.set(db, found);
  }
  return found;
}

/** A note's checklist lines, links and photos, tombstoned ones included. */
function childrenOf(records: RecordStore, noteId: string): StoredRecord[] {
  return (prepared(records.db).children.all(noteId) as unknown as { type: string; id: string; fields: string; clocks: string; seq: number }[]).map(row => ({
    type: row.type,
    id: row.id,
    fields: JSON.parse(row.fields) as Record<string, unknown>,
    clocks: JSON.parse(row.clocks) as Record<string, string>,
    seq: row.seq,
  }));
}

/** Tombstones what has stayed in the bin past its week. Returns how many records it changed. */
export function emptyBin(db: Database, sync: SyncService, now: number): number {
  const { expiredNotes, children, expiredPages, liveBlocks } = prepared(db);
  const cutoff = now - TRASH_RETENTION_DAYS * DAY;
  // A device with a slow clock writes an old `trashedAt`; its write's clock still says when it happened.
  const expired = (rows: unknown): { id: string }[] => (rows as { id: string; clock: string | null }[]).filter(row => !row.clock || hlcWall(row.clock) < cutoff);
  const notes = expired(expiredNotes.all(cutoff));
  const pages = expired(expiredPages.all(cutoff));
  if (notes.length === 0 && pages.length === 0) return 0;
  const tombstone: ServerEdit['patch'] = current => (typeof current.fields.deletedAt === 'number' ? null : { deletedAt: now });
  const edits: ServerEdit[] = [];
  for (const { id } of notes) {
    edits.push({ type: 'note', id, patch: tombstone });
    // Those already tombstoned are left as they are (`tombstone` answers null).
    for (const child of children.all(id) as unknown as { type: string; id: string }[]) edits.push({ type: child.type, id: child.id, patch: tombstone });
  }
  if (pages.length > 0) {
    // A sub-page put in the bin on its own waits for its own week.
    const under = new Map<string, string[]>();
    for (const row of liveBlocks.all() as unknown as { id: string; parentId: unknown; binned: number }[]) {
      if (typeof row.parentId !== 'string' || row.binned === 1) continue;
      const siblings = under.get(row.parentId);
      if (siblings) siblings.push(row.id);
      else under.set(row.parentId, [row.id]);
    }
    const seen = new Set<string>();
    const stack = pages.map(page => page.id);
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      edits.push({ type: 'block', id, patch: tombstone });
      stack.push(...(under.get(id) ?? []));
    }
  }
  return sync.apply(edits).length;
}

/**
 * A note the bin emptied (a server tombstone) that a device restores later, having restored it
 * offline before or after the purge: it and what the purge took with it come back.
 */
export const reviveNote: PushRule = (current, incoming, merged, { records, clock }) => {
  if (current.type !== 'note' || typeof merged.fields.deletedAt !== 'number' || merged.fields.trashedAt !== null) return [];
  const purge = merged.clocks.deletedAt;
  if (!purge || hlcNode(purge) !== clock.node) return [];
  const restore = incoming.clocks.trashedAt;
  const trashed = current.clocks.trashedAt;
  if (!restore || incoming.fields.trashedAt !== null || (trashed !== undefined && restore <= trashed)) return [];
  // Deleted for good by a person too ("Supprimer définitivement" empties the text), whichever tombstone won: it stays gone.
  const erased = (['title', 'body'] as const).every(field => {
    const written = merged.clocks[field];
    return merged.fields[field] === '' && written !== undefined && hlcNode(written) !== clock.node && (trashed === undefined || written > trashed);
  });
  if (erased) return [];
  const purgedAt = merged.fields.deletedAt;
  const stamp = clock.tick();
  const out: SyncRecord[] = [writeFields(merged, { deletedAt: null }, stamp)];
  for (const child of childrenOf(records, current.id)) {
    const childClock = child.clocks.deletedAt;
    if (child.fields.deletedAt === purgedAt && childClock && hlcNode(childClock) === clock.node) out.push(writeFields(child, { deletedAt: null }, stamp));
  }
  log.info('sync: a note restored on a device after the bin emptied it came back', { id: current.id, children: out.length - 1 });
  return out;
};
