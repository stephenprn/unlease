/**
 * Pages' version history on the server (`@unlease/pages/sync/versions`). Each minute it reads the
 * blocks stored since it last looked (a device's push, a server write, a restore: everything goes
 * through the records' sequence) and marks their pages edited; a page left alone for
 * `VERSION_QUIET_MS` is snapshotted (`snapshotBlocks`), unless it reads as its last version. Hourly
 * it thins them (`versionsToDrop`: every one for a day, the last of each day for 90 days). A page
 * deleted for good (its bin emptied, « Effacer des données ») loses its versions at once.
 *
 * Versions stay on the server: never synced, never in a backup (a backup holds the records as they
 * are), never sent to Claude. The pictures and files they name are kept as long as they are
 * (`fileIds`), so a restored picture still has its file.
 */
import { createHash } from 'node:crypto';
import type { StatementSync } from 'node:sqlite';
import type { Fields } from '@unlease/core/sync/record';
import { compareVersions, snapshotBlocks, versionKey, versionsToDrop } from '@unlease/pages/services/versions';
import { VERSION_LIST_LIMIT, VERSION_QUIET_MS, type PageVersion, type PageVersionList, type PageVersionSummary, type VersionBlock } from '@unlease/pages/sync/versions';
import { readMeta, transaction, writeMeta, type Database } from '../../db/database';
import { log } from '../../log';
import type { RecordStore } from '../../sync/records';

/** How often it looks for edited pages. */
export const VERSIONS_TICK_MS = 60_000;
/** The records' sequence read so far. */
const CURSOR = 'pages.versionsSeq';
/** Changed records read at once. */
const PAGE = 2000;
const MAX_DEPTH = 256;

interface BlockRow {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: string | null;
  readonly deleted: number;
}

const hash = (blocks: readonly VersionBlock[]): string => createHash('sha256').update(versionKey(blocks)).digest('base64url');

export class PageVersions {
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Where each block was last seen, so a block moved to another page marks the page it left too (lost at a restart: the next edit there catches up). */
  private readonly lastPage = new Map<string, string>();
  private readonly statements: {
    readonly changed: StatementSync;
    readonly tree: StatementSync;
    readonly livePages: StatementSync;
    readonly mark: StatementSync;
    readonly due: StatementSync;
    readonly unmark: StatementSync;
    readonly last: StatementSync;
    readonly insert: StatementSync;
    readonly forget: StatementSync;
    readonly forgetPending: StatementSync;
    readonly everyVersion: StatementSync;
    readonly drop: StatementSync;
    readonly list: StatementSync;
    readonly one: StatementSync;
    readonly files: StatementSync;
  };

  constructor(
    private readonly db: Database,
    private readonly records: RecordStore,
    private readonly now: () => number = Date.now,
  ) {
    this.statements = {
      changed: db.prepare(
        `SELECT id, seq, json_extract(fields, '$.kind') AS kind, json_type(fields, '$.deletedAt') IN ('integer', 'real') AS deleted
         FROM records WHERE type = 'block' AND seq > ? ORDER BY seq LIMIT ?`,
      ),
      tree: db.prepare(
        `SELECT id, json_extract(fields, '$.parentId') AS parentId, json_extract(fields, '$.kind') AS kind,
         json_type(fields, '$.deletedAt') IN ('integer', 'real') AS deleted FROM records WHERE type = 'block'`,
      ),
      livePages: db.prepare(`SELECT id FROM records WHERE type = 'block' AND json_extract(fields, '$.kind') = 'page' AND json_extract(fields, '$.deletedAt') IS NULL`),
      mark: db.prepare('INSERT INTO page_versions_pending (page_id, changed_at) VALUES (?, ?) ON CONFLICT (page_id) DO UPDATE SET changed_at = excluded.changed_at'),
      due: db.prepare('SELECT page_id AS pageId, changed_at AS changedAt FROM page_versions_pending WHERE changed_at <= ?'),
      unmark: db.prepare('DELETE FROM page_versions_pending WHERE page_id = ?'),
      last: db.prepare('SELECT key FROM page_versions WHERE page_id = ? ORDER BY at DESC, id DESC LIMIT 1'),
      insert: db.prepare('INSERT INTO page_versions (page_id, at, key, blocks, count) VALUES (?, ?, ?, ?, ?)'),
      forget: db.prepare('DELETE FROM page_versions WHERE page_id = ?'),
      forgetPending: db.prepare('DELETE FROM page_versions_pending WHERE page_id = ?'),
      everyVersion: db.prepare('SELECT id, page_id AS pageId, at FROM page_versions'),
      drop: db.prepare('DELETE FROM page_versions WHERE id = ?'),
      list: db.prepare('SELECT id, at, count, blocks FROM page_versions WHERE page_id = ? ORDER BY at DESC, id DESC LIMIT ?'),
      one: db.prepare('SELECT id, page_id AS pageId, at, blocks FROM page_versions WHERE page_id = ? AND id = ?'),
      files: db.prepare(`SELECT DISTINCT json_extract(entry.value, '$.fields.fileId') AS fileId FROM page_versions, json_each(page_versions.blocks) AS entry WHERE json_type(entry.value, '$.fields.fileId') = 'text'`),
    };
  }

  start(): void {
    if (this.timer) return;
    this.safeTick();
    this.timer = setInterval(() => this.safeTick(), VERSIONS_TICK_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private safeTick(): void {
    try {
      this.tick();
    } catch (error) {
      log.warn('pages: version history failed', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /** Marks the pages edited since the last look, then snapshots those left alone long enough. Returns the versions written. */
  tick(at: number = this.now()): number {
    this.markEdited(at);
    return this.snapshotDue(at);
  }

  /** Reads the blocks stored since the cursor and marks their pages; the first look marks every page, so each gets a first version. */
  markEdited(at: number = this.now()): void {
    const { db, statements } = this;
    transaction(db, () => {
      const cursor = readMeta(db, CURSOR);
      if (typeof cursor !== 'number') {
        for (const row of statements.livePages.all() as unknown as { id: string }[]) statements.mark.run(row.id, 0);
        writeMeta(db, CURSOR, this.records.maxSeq());
        return;
      }
      let since = cursor;
      let tree: Map<string, BlockRow> | null = null;
      for (;;) {
        const rows = statements.changed.all(since, PAGE) as unknown as { id: string; seq: number; kind: string | null; deleted: number }[];
        if (rows.length === 0) break;
        tree ??= this.tree();
        for (const row of rows) {
          if (row.kind === 'page' && row.deleted === 1) {
            statements.forget.run(row.id);
            statements.forgetPending.run(row.id);
            continue;
          }
          const page = pageOf(tree, row.id);
          const before = this.lastPage.get(row.id);
          if (page) {
            statements.mark.run(page, at);
            this.lastPage.set(row.id, page);
          }
          if (before && before !== page && tree.get(before)?.deleted === 0) statements.mark.run(before, at);
        }
        since = rows[rows.length - 1]!.seq;
        if (rows.length < PAGE) break;
      }
      if (since !== cursor) writeMeta(db, CURSOR, since);
    });
  }

  /** Snapshots every page quiet for `VERSION_QUIET_MS`; one that reads as its last version writes nothing. */
  snapshotDue(at: number = this.now()): number {
    const { db, statements } = this;
    const due = statements.due.all(at - VERSION_QUIET_MS) as unknown as { pageId: string; changedAt: number }[];
    if (due.length === 0) return 0;
    let written = 0;
    transaction(db, () => {
      const tree = this.tree();
      const children = new Map<string, string[]>();
      for (const row of tree.values()) {
        if (row.deleted === 1 || !row.parentId) continue;
        const list = children.get(row.parentId);
        if (list) list.push(row.id);
        else children.set(row.parentId, [row.id]);
      }
      const cache = new Map<string, Fields | undefined>();
      const fieldsOf = (id: string): Fields | undefined => {
        if (!cache.has(id)) cache.set(id, this.records.get('block', id)?.fields);
        return cache.get(id);
      };
      for (const { pageId, changedAt } of due) {
        statements.unmark.run(pageId);
        const blocks = snapshotBlocks(pageId, { fieldsOf, childrenOf: id => children.get(id) ?? [] });
        if (!blocks) {
          if (!tree.has(pageId) || tree.get(pageId)!.deleted === 1) statements.forget.run(pageId);
          continue;
        }
        const key = hash(blocks);
        const last = statements.last.get(pageId) as { key: string } | undefined;
        if (last?.key === key) continue;
        // The first look's versions say when they were taken; the others, when their edits were made.
        statements.insert.run(pageId, changedAt > 0 ? changedAt : at, key, JSON.stringify(blocks), blocks.length - 1);
        written += 1;
      }
    });
    return written;
  }

  /** Lets go of the versions past their keeping (hourly). Returns how many. */
  thin(at: number = this.now()): number {
    const { db, statements } = this;
    const byPage = new Map<string, { id: number; at: number }[]>();
    for (const row of statements.everyVersion.all() as unknown as { id: number; pageId: string; at: number }[]) {
      const list = byPage.get(row.pageId);
      if (list) list.push({ id: row.id, at: row.at });
      else byPage.set(row.pageId, [{ id: row.id, at: row.at }]);
    }
    const dropped = [...byPage.values()].flatMap(versions => versionsToDrop(versions, at));
    if (dropped.length > 0) transaction(db, () => dropped.forEach(id => statements.drop.run(id)));
    return dropped.length;
  }

  /** A page's versions, newest first, each with what changed from the one before it. */
  list(pageId: string): PageVersionList {
    const rows = this.statements.list.all(pageId, VERSION_LIST_LIMIT + 1) as unknown as { id: number; at: number; count: number; blocks: string }[];
    const parsed = rows.map(row => JSON.parse(row.blocks) as VersionBlock[]);
    const versions: PageVersionSummary[] = rows.slice(0, VERSION_LIST_LIMIT).map((row, index) => ({
      id: row.id,
      at: row.at,
      blocks: row.count,
      change: parsed[index + 1] ? compareVersions(parsed[index + 1]!, parsed[index]!) : null,
    }));
    return { versions };
  }

  /** One version whole; null when this page has no such version. */
  get(pageId: string, id: number): PageVersion | null {
    const row = this.statements.one.get(pageId, id) as { id: number; pageId: string; at: number; blocks: string } | undefined;
    return row ? { id: row.id, at: row.at, pageId: row.pageId, blocks: JSON.parse(row.blocks) as VersionBlock[] } : null;
  }

  /** The files the versions name: kept while a version may bring them back. */
  fileIds(): string[] {
    return (this.statements.files.all() as unknown as { fileId: string }[]).map(row => row.fileId);
  }

  private tree(): Map<string, BlockRow> {
    const rows = this.statements.tree.all() as unknown as BlockRow[];
    return new Map(rows.map(row => [row.id, row]));
  }
}

/** The page a block is on (a page is on itself); null when its chain breaks or loops. */
function pageOf(tree: ReadonlyMap<string, BlockRow>, id: string): string | null {
  let current = tree.get(id);
  for (let depth = 0; current && depth < MAX_DEPTH; depth += 1) {
    if (current.kind === 'page') return current.deleted === 1 ? null : current.id;
    current = current.parentId ? tree.get(current.parentId) : undefined;
  }
  return null;
}
