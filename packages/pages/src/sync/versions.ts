/**
 * A page's past versions, kept by the server (`server/src/apps/pages/versions.ts`), never synced:
 * `GET /api/pages/<page>/versions` lists them, newest first (`PageVersionList`), and
 * `GET /api/pages/<page>/versions/<version>` hands one whole (`PageVersion`): the page's block and
 * every block on it as they stood, its sub-pages as they were placed there (shown, never restored:
 * each keeps its own history). The client restores it as a page action (`services/versions`).
 */
import type { Fields } from '@unlease/core/sync/record';
import { isValidId } from '@unlease/core/sync/schema';

/** A page is snapshotted once nothing has changed on it for this long. */
export const VERSION_QUIET_MS = 5 * 60_000;
/** Every version is kept this long… */
export const VERSION_ALL_KEPT_MS = 24 * 60 * 60_000;
/** …then the day's last one, until this many days. */
export const VERSION_RETENTION_DAYS = 90;
/** The most a list answers (a day's last for 90 days, and a busy day's every one). */
export const VERSION_LIST_LIMIT = 500;

export const versionsPath = (pageId: string): string => `/api/pages/${encodeURIComponent(pageId)}/versions`;
export const versionPath = (pageId: string, versionId: number): string => `${versionsPath(pageId)}/${versionId}`;

/** A block as a version holds it: its id and its fields as stored then. */
export interface VersionBlock {
  readonly id: string;
  readonly fields: Fields;
}

/** How much a version changed from the one before it (null for the oldest kept). */
export interface VersionChange {
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
}

export interface PageVersionSummary {
  readonly id: number;
  /** When the edits it holds were last made (ms). */
  readonly at: number;
  /** The page's blocks then, its own aside. */
  readonly blocks: number;
  readonly change: VersionChange | null;
}

export interface PageVersionList {
  readonly versions: readonly PageVersionSummary[];
}

export interface PageVersion {
  readonly id: number;
  readonly at: number;
  readonly pageId: string;
  readonly blocks: readonly VersionBlock[];
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function parseChange(value: unknown): VersionChange | null | undefined {
  if (value === null) return null;
  if (!isObject(value) || !isCount(value.added) || !isCount(value.removed) || !isCount(value.changed)) return undefined;
  return { added: value.added, removed: value.removed, changed: value.changed };
}

export function parsePageVersionList(body: unknown): PageVersionList | null {
  if (!isObject(body) || !Array.isArray(body.versions)) return null;
  const versions: PageVersionSummary[] = [];
  for (const raw of body.versions) {
    if (!isObject(raw) || !isCount(raw.id) || !isCount(raw.at) || !isCount(raw.blocks)) return null;
    const change = parseChange(raw.change ?? null);
    if (change === undefined) return null;
    versions.push({ id: raw.id, at: raw.at, blocks: raw.blocks, change });
  }
  return { versions };
}

export function parsePageVersion(body: unknown): PageVersion | null {
  if (!isObject(body) || !isCount(body.id) || !isCount(body.at) || !isValidId(body.pageId) || !Array.isArray(body.blocks)) return null;
  const blocks: VersionBlock[] = [];
  for (const raw of body.blocks) {
    if (!isObject(raw) || !isValidId(raw.id) || !isObject(raw.fields)) return null;
    blocks.push({ id: raw.id, fields: raw.fields });
  }
  if (!blocks.some(block => block.id === body.pageId)) return null;
  return { id: body.id, at: body.at, pageId: body.pageId, blocks };
}
