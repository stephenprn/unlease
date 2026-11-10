/**
 * Pages' bin on the server. Hourly, it empties itself: a page trashed more than TRASH_RETENTION_DAYS
 * ago gets a `deletedAt` tombstone, and so does every block under it (records are never removed, or
 * an offline device would bring them back), except a sub-page put in the bin on its own, which waits
 * for its own week. Then a Carnet link whose copy (« Garder une copie ») is a page gone for good, by
 * this purge or a person, forgets it.
 */
import type { StatementSync } from 'node:sqlite';
import { hlcWall } from '@unlease/core/sync/hlc';
import { TRASH_RETENTION_DAYS } from '@unlease/notes/models/entities';
import type { Database } from '../../db/database';
import type { ServerEdit, SyncService } from '../../sync/service';

const DAY = 86_400_000;

const statements = new WeakMap<Database, { readonly expiredPages: StatementSync; readonly liveBlocks: StatementSync; readonly lostCopies: StatementSync }>();

function prepared(db: Database) {
  let found = statements.get(db);
  if (!found) {
    found = {
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
      lostCopies: db.prepare(
        `SELECT link.id AS id FROM records AS link
         JOIN records AS page ON page.type = 'block' AND page.id = json_extract(link.fields, '$.copy')
         WHERE link.type = 'link' AND json_type(page.fields, '$.deletedAt') IN ('integer', 'real')`,
      ),
    };
    statements.set(db, found);
  }
  return found;
}

/** Tombstones the pages that stayed in the bin past their week, then forgets the copies gone. Returns how many records it changed. */
export function emptyPagesBin(db: Database, sync: SyncService, now: number): number {
  const { expiredPages, liveBlocks, lostCopies } = prepared(db);
  const cutoff = now - TRASH_RETENTION_DAYS * DAY;
  // A device with a slow clock writes an old `trashedAt`; its write's clock still says when it happened.
  const pages = (expiredPages.all(cutoff) as { id: string; clock: string | null }[]).filter(row => !row.clock || hlcWall(row.clock) < cutoff);
  let changed = 0;
  if (pages.length > 0) {
    const tombstone: ServerEdit['patch'] = current => (typeof current.fields.deletedAt === 'number' ? null : { deletedAt: now });
    // A sub-page put in the bin on its own waits for its own week.
    const under = new Map<string, string[]>();
    for (const row of liveBlocks.all() as unknown as { id: string; parentId: unknown; binned: number }[]) {
      if (typeof row.parentId !== 'string' || row.binned === 1) continue;
      const siblings = under.get(row.parentId);
      if (siblings) siblings.push(row.id);
      else under.set(row.parentId, [row.id]);
    }
    const edits: ServerEdit[] = [];
    const seen = new Set<string>();
    const stack = pages.map(page => page.id);
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      edits.push({ type: 'block', id, patch: tombstone });
      stack.push(...(under.get(id) ?? []));
    }
    changed += sync.apply(edits).length;
  }
  const lost = lostCopies.all() as { id: string }[];
  if (lost.length > 0) {
    changed += sync.apply(lost.map(({ id }) => ({ type: 'link', id, patch: current => (typeof current.fields.copy === 'string' ? { copy: null } : null) }))).length;
  }
  return changed;
}
