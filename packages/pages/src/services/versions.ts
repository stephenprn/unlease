/**
 * A page's past versions (`sync/versions`), the same on the server and both clients:
 *
 * - what a version holds (`snapshotBlocks`): the page's block, every live block on it, and its
 *   sub-pages as they were placed there (not what they hold: each sub-page is its own page, with its
 *   own history);
 * - when two versions are the same (`versionKey`) and how much one changed (`compareVersions`);
 * - which versions the server lets go (`versionsToDrop`): every one for a day, then the last of each
 *   day for `VERSION_RETENTION_DAYS`, the newest always;
 * - how a client shows one (`versionOutline`, each block marked against the page as it is now);
 * - how a client restores one (`restorePlan`): one batch, a page action recorded in the page's undo.
 *   A block of the version gets its fields back (one deleted since comes back, one moved away comes
 *   home), a block added since is deleted (Undo brings it back), the page keeps its place, its
 *   privacy and its sub-pages (one that sat in a block the restore deletes moves to the page's end).
 */
import { t } from '@unlease/core/i18n';
import { comparePositions, positionsBetween } from '@unlease/core/services/fractionalIndex';
import { dayDelta, formatDay, plural } from '@unlease/core/services/format';
import type { Fields } from '@unlease/core/sync/record';
import { BLOCK_FIELD_DEFAULTS, type Block } from '../models/blocks';
import { blockFromRecord } from '../sync/entities';
import { VERSION_ALL_KEPT_MS, VERSION_RETENTION_DAYS, type PageVersion, type PageVersionSummary, type VersionBlock, type VersionChange } from '../sync/versions';

const DAY = 86_400_000;
/** Deeper than any real page: a walk down stops here. */
const MAX_DEPTH = 256;

/** The page's own fields a restore writes back: its title and icon, never its place, its bin or its privacy. */
const PAGE_FIELDS = ['text', 'icon'] as const;

/** What the server and the clients read the current blocks through. */
export interface BlockSource {
  /** A block's stored fields, a deleted one's too; undefined: never seen here. */
  readonly fieldsOf: (id: string) => Fields | undefined;
  /** A block's live children (not deleted), any kind, in no particular order. */
  readonly childrenOf: (id: string) => readonly string[];
}

const isLive = (fields: Fields | undefined): fields is Fields => !!fields && typeof fields.deletedAt !== 'number';
const isPage = (fields: Fields | undefined): boolean => fields?.kind === 'page';
const positionOf = (fields: Fields | undefined): string => (typeof fields?.position === 'string' ? fields.position : '');

/** A value as text, its objects' keys sorted: two equal values give the same text whatever their keys' order. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

const same = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);

/** A field as a block reads it when it was never written. */
const fieldOr = (fields: Fields, field: string): unknown => (Object.hasOwn(fields, field) ? fields[field] : (BLOCK_FIELD_DEFAULTS[field] ?? null));

/** The live non-page blocks on a page, wherever they sit (in a column, under a toggle), and its sub-pages with the block they sit in. */
function walkPage(pageId: string, source: BlockSource): { readonly blocks: string[]; readonly subPages: { id: string; parentId: string }[] } {
  const blocks: string[] = [];
  const subPages: { id: string; parentId: string }[] = [];
  const seen = new Set<string>([pageId]);
  const walk = (parent: string, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    for (const child of source.childrenOf(parent)) {
      if (seen.has(child)) continue;
      seen.add(child);
      const fields = source.fieldsOf(child);
      if (!isLive(fields)) continue;
      if (isPage(fields)) {
        subPages.push({ id: child, parentId: parent });
        continue;
      }
      blocks.push(child);
      walk(child, depth + 1);
    }
  };
  walk(pageId, 0);
  return { blocks, subPages };
}

/** A page as a version holds it, sorted by id; null when the page is gone. */
export function snapshotBlocks(pageId: string, source: BlockSource): VersionBlock[] | null {
  const page = source.fieldsOf(pageId);
  if (!isLive(page) || !isPage(page)) return null;
  const { blocks, subPages } = walkPage(pageId, source);
  const out: VersionBlock[] = [{ id: pageId, fields: page }];
  for (const id of [...blocks, ...subPages.map(sub => sub.id)]) out.push({ id, fields: source.fieldsOf(id)! });
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The same text for two versions holding the same blocks. */
export function versionKey(blocks: readonly VersionBlock[]): string {
  return canonical([...blocks].sort((a, b) => (a.id < b.id ? -1 : 1)).map(block => [block.id, block.fields]));
}

/** Blocks added, removed and changed from one version to the next (the page's own block counts as changed when its title is). */
export function compareVersions(older: readonly VersionBlock[], newer: readonly VersionBlock[]): VersionChange {
  const before = new Map(older.map(block => [block.id, block.fields]));
  let added = 0;
  let changed = 0;
  for (const block of newer) {
    const was = before.get(block.id);
    if (!was) added += 1;
    else {
      if (!same(was, block.fields)) changed += 1;
      before.delete(block.id);
    }
  }
  return { added, removed: before.size, changed };
}

/**
 * The versions of one page to let go at `now`: those past the retention, and of each day before the
 * last 24 hours all but its last; the newest is always kept. `dayOf` names a moment's day (UTC by default).
 */
export function versionsToDrop(versions: readonly { readonly id: number; readonly at: number }[], now: number, dayOf: (at: number) => string = at => new Date(at).toISOString().slice(0, 10)): number[] {
  if (versions.length === 0) return [];
  const sorted = [...versions].sort((a, b) => b.at - a.at || b.id - a.id);
  const newest = sorted[0]!.id;
  const dropped: number[] = [];
  const daysKept = new Set<string>();
  for (const version of sorted) {
    const age = now - version.at;
    if (age < VERSION_ALL_KEPT_MS) continue;
    if (version.id === newest) {
      daysKept.add(dayOf(version.at));
      continue;
    }
    if (age > VERSION_RETENTION_DAYS * DAY) {
      dropped.push(version.id);
      continue;
    }
    const day = dayOf(version.at);
    if (daysKept.has(day)) dropped.push(version.id);
    else daysKept.add(day);
  }
  return dropped;
}

/** How a block of a version stands against the page now: as it is, changed since, or no longer there. */
export type VersionMark = 'same' | 'changed' | 'gone';

export interface OutlineRow {
  readonly block: Block;
  /** Nesting under list items, toggles and callouts (columns are read one after the other). */
  readonly depth: number;
  readonly mark: VersionMark;
  /** A table's rows, in order. */
  readonly rows?: readonly Block[];
}

/** Fields whose change is not one a reader sees: a block moved within the page reads the same. */
const PLACE_FIELDS: ReadonlySet<string> = new Set(['position', 'parentId', 'uploaded']);

function contentSame(a: Fields, b: Fields): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (!PLACE_FIELDS.has(key) && !same(fieldOr(a, key), fieldOr(b, key))) return false;
  return true;
}

const toBlock = (block: VersionBlock): Block => blockFromRecord({ type: 'block', id: block.id, fields: block.fields, clocks: {} });

/** A version in reading order, the page's own block aside, each block marked against `current`. */
export function versionOutline(version: PageVersion, current: (id: string) => Fields | undefined): OutlineRow[] {
  const byParent = new Map<string, VersionBlock[]>();
  for (const block of version.blocks) {
    if (block.id === version.pageId) continue;
    const parent = typeof block.fields.parentId === 'string' ? block.fields.parentId : '';
    const list = byParent.get(parent);
    if (list) list.push(block);
    else byParent.set(parent, [block]);
  }
  const ordered = (parent: string): VersionBlock[] =>
    (byParent.get(parent) ?? []).map(block => ({ block, position: positionOf(block.fields), id: block.id })).sort(comparePositions).map(entry => entry.block);
  const markOf = (block: VersionBlock): VersionMark => {
    const now = current(block.id);
    if (!isLive(now)) return 'gone';
    return contentSame(block.fields, now) ? 'same' : 'changed';
  };
  const out: OutlineRow[] = [];
  const walk = (parent: string, depth: number, guard: number): void => {
    if (guard > MAX_DEPTH) return;
    for (const entry of ordered(parent)) {
      const block = toBlock(entry);
      if (block.kind === 'columns' || block.kind === 'column') {
        walk(entry.id, depth, guard + 1);
        continue;
      }
      if (block.kind === 'table') {
        out.push({ block, depth, mark: markOf(entry), rows: ordered(entry.id).map(toBlock) });
        continue;
      }
      out.push({ block, depth, mark: markOf(entry) });
      if (block.kind !== 'page') walk(entry.id, depth + 1, guard + 1);
    }
  };
  walk(version.pageId, 0, 0);
  return out;
}

/** The page's title and icon as the version holds them. */
export function versionPage(version: PageVersion): Block {
  return toBlock(version.blocks.find(block => block.id === version.pageId)!);
}

export interface RestorePlan {
  readonly changes: readonly { readonly id: string; readonly patch: Fields }[];
  /** Blocks of the version deleted since, brought back. */
  readonly restored: number;
  /** Blocks added since, deleted. */
  readonly removed: number;
  /** Blocks still there, given their fields back (the page's title counts). */
  readonly changed: number;
}

/** What restoring `version` writes, as one batch at `now`; no change when the page already reads as the version does. */
export function restorePlan(version: PageVersion, source: BlockSource, now: number): RestorePlan {
  const pageId = version.pageId;
  const changes: { id: string; patch: Fields }[] = [];
  let restored = 0;
  let changed = 0;

  const page = version.blocks.find(block => block.id === pageId);
  const currentPage = source.fieldsOf(pageId);
  if (page && currentPage) {
    const patch: Fields = {};
    for (const field of PAGE_FIELDS) if (!same(fieldOr(currentPage, field), fieldOr(page.fields, field))) patch[field] = fieldOr(page.fields, field);
    if (Object.keys(patch).length > 0) {
      changes.push({ id: pageId, patch });
      changed += 1;
    }
  }

  const kept = new Set<string>();
  for (const block of version.blocks) {
    if (block.id === pageId || isPage(block.fields)) continue;
    const stored = source.fieldsOf(block.id);
    // Turned into a page since: it is a page of its own now, with its own history.
    if (isLive(stored) && isPage(stored)) continue;
    kept.add(block.id);
    if (!stored) {
      changes.push({ id: block.id, patch: { ...block.fields, deletedAt: null } });
      restored += 1;
      continue;
    }
    const patch: Fields = {};
    for (const field of new Set([...Object.keys(block.fields), ...Object.keys(stored)])) {
      const wanted = field === 'deletedAt' ? null : fieldOr(block.fields, field);
      if (!same(fieldOr(stored, field), wanted)) patch[field] = wanted;
    }
    if (Object.keys(patch).length === 0) continue;
    changes.push({ id: block.id, patch });
    if (isLive(stored)) changed += 1;
    else restored += 1;
  }

  const { blocks: present, subPages } = walkPage(pageId, source);
  const going = new Set(present.filter(id => !kept.has(id)));
  for (const id of going) changes.push({ id, patch: { deletedAt: now } });

  // A sub-page that sat in a block now deleted moves to the page's end, after what the version puts there.
  const stranded = subPages.filter(sub => going.has(sub.parentId));
  if (stranded.length > 0) {
    const atTop = [
      ...version.blocks.filter(block => block.fields.parentId === pageId && kept.has(block.id)).map(block => ({ id: block.id, position: positionOf(block.fields) })),
      ...subPages.filter(sub => sub.parentId === pageId).map(sub => ({ id: sub.id, position: positionOf(source.fieldsOf(sub.id)) })),
    ].sort(comparePositions);
    const last = atTop.length > 0 ? atTop[atTop.length - 1]!.position : null;
    const keys = positionsBetween(last, null, stranded.length);
    stranded.forEach((sub, index) => changes.push({ id: sub.id, patch: { parentId: pageId, position: keys[index]! } }));
  }
  return { changes, restored, removed: going.size, changed };
}

/** The versions listed by day, newest first: « Today », « Yesterday », then the day. */
export function versionDays(versions: readonly PageVersionSummary[], now: number): { readonly label: string; readonly versions: PageVersionSummary[] }[] {
  const days: { label: string; versions: PageVersionSummary[] }[] = [];
  for (const version of versions) {
    const delta = dayDelta(version.at, now);
    const label = delta === 0 ? t('Today') : delta === -1 ? t('Yesterday') : formatDay(version.at, now);
    const last = days[days.length - 1];
    if (last && last.label === label) last.versions.push(version);
    else days.push({ label, versions: [version] });
  }
  return days;
}

/** What a version changed from the one before it, in words: « 2 blocs ajoutés · 1 bloc modifié ». */
export function changeWords(change: VersionChange | null): string {
  if (!change) return t('The oldest version kept');
  const parts = [
    change.added > 0 ? plural(change.added, 'block added', 'blocks added') : null,
    change.removed > 0 ? plural(change.removed, 'block removed', 'blocks removed') : null,
    change.changed > 0 ? plural(change.changed, 'block changed', 'blocks changed') : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : t('No change');
}

/** What restoring will do, in words; null when it does nothing. */
export function restoreWords(plan: RestorePlan): string | null {
  const parts = [
    plan.restored > 0 ? plural(plan.restored, 'block brought back', 'blocks brought back') : null,
    plan.removed > 0 ? plural(plan.removed, 'block removed', 'blocks removed') : null,
    plan.changed > 0 ? plural(plan.changed, 'block changed', 'blocks changed') : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}
