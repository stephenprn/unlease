/**
 * The demo's stand-in for a page's version history (`GET /api/pages/<page>/versions`,
 * `server/src/apps/pages/versions.ts`): three versions made up from the page as it is now (twenty
 * minutes ago, yesterday afternoon without its last blocks, four days ago with only its first half),
 * so the list, the preview and « Restaurer cette version » can be tried. Nothing is kept.
 */
import type { Fields, SyncRecord } from '@unlease/core/sync/record';
import { isValidId } from '@unlease/core/sync/schema';
import { compareVersions, snapshotBlocks } from '@unlease/pages/services/versions';
import type { PageVersion, PageVersionList, VersionBlock } from '@unlease/pages/sync/versions';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

/** The page's blocks, its top-level ones only those `keep` picks by their place (with what they hold). */
function without(blocks: readonly VersionBlock[], pageId: string, keep: (index: number, count: number) => boolean): VersionBlock[] {
  const top = blocks
    .filter(block => block.fields.parentId === pageId && block.fields.kind !== 'page')
    .sort((a, b) => (String(a.fields.position) < String(b.fields.position) ? -1 : 1));
  const dropped = new Set(top.filter((_, index) => !keep(index, top.length)).map(block => block.id));
  const parentOf = new Map(blocks.map(block => [block.id, typeof block.fields.parentId === 'string' ? block.fields.parentId : null]));
  const under = (id: string): boolean => {
    for (let at: string | null = id, depth = 0; at && depth < 256; at = parentOf.get(at) ?? null, depth += 1) if (dropped.has(at)) return true;
    return false;
  };
  return blocks.filter(block => !under(block.id));
}

/** The made-up versions of a page, newest first; null when it is no page here. */
function versionsOf(records: readonly SyncRecord[], pageId: string, now: number): PageVersion[] | null {
  const blocks = new Map<string, Fields>();
  for (const record of records) if (record.type === 'block') blocks.set(record.id, record.fields);
  const children = new Map<string, string[]>();
  for (const [id, fields] of blocks) {
    if (typeof fields.deletedAt === 'number' || typeof fields.parentId !== 'string') continue;
    const list = children.get(fields.parentId);
    if (list) list.push(id);
    else children.set(fields.parentId, [id]);
  }
  const current = snapshotBlocks(pageId, { fieldsOf: id => blocks.get(id), childrenOf: id => children.get(id) ?? [] });
  if (!current) return null;
  const yesterday = new Date(now - DAY);
  yesterday.setHours(16, 40, 0, 0);
  return [
    { id: 3, at: now - 20 * MINUTE, pageId, blocks: current },
    { id: 2, at: yesterday.getTime(), pageId, blocks: without(current, pageId, (index, count) => index < Math.max(1, count - 2)) },
    { id: 1, at: now - 4 * DAY, pageId, blocks: without(current, pageId, (index, count) => index < Math.max(1, Math.ceil(count / 2))) },
  ];
}

/** Answers the history's routes; null for any other address. */
export function pageVersionsRoute(records: () => readonly SyncRecord[], url: URL, method: string, now: number = Date.now()): Response | null {
  const match = /^\/api\/pages\/([^/]+)\/versions(?:\/([^/]+))?$/.exec(url.pathname);
  if (!match || method !== 'GET') return null;
  const pageId = decodeURIComponent(match[1]!);
  if (!isValidId(pageId)) return json({ error: 'Invalid request' }, 400);
  const versions = versionsOf(records(), pageId, now) ?? [];
  if (match[2] === undefined) {
    const list: PageVersionList = {
      versions: versions.map((version, index) => ({
        id: version.id,
        at: version.at,
        blocks: version.blocks.length - 1,
        change: versions[index + 1] ? compareVersions(versions[index + 1]!.blocks, version.blocks) : null,
      })),
    };
    return json(list);
  }
  const version = versions.find(entry => entry.id === Number(match[2]));
  return version ? json(version) : json({ error: 'This version is no longer kept' }, 404);
}
