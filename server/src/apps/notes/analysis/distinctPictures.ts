/**
 * Once per server: links read before a page's copies of one picture were told apart
 * (`reading/likeness.ts`) shed the copies they keep (the franceinfo photo three times, YouTube's
 * frame with and without its bars), through the server's own writes, the first picture first. The
 * pictures they drop go with the file collector. Marked done only once every link was seen, so a
 * stop halfway goes on at the next start.
 */
import { readMeta, writeMeta, type Database } from '../../../db/database';
import type { BlobStore } from '../../../blobs/store';
import { log } from '../../../log';
import { distinctKept } from '../../../reading/keep-images';
import type { RecordStore } from '../../../sync/records';
import type { SyncService } from '../../../sync/service';

const DONE = 'notes.distinctPictures';

const idsOf = (value: unknown): string[] => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);

const sameIds = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((id, index) => id === b[index]);

export interface DistinctPicturesOptions {
  readonly db: Database;
  readonly records: RecordStore;
  readonly blobs: BlobStore;
  readonly sync: SyncService;
  readonly signal: AbortSignal;
}

/** Drops the copies saved links keep, once; returns how many links changed. */
export async function shedPictureCopies({ db, records, blobs, sync, signal }: DistinctPicturesOptions): Promise<number> {
  if (readMeta(db, DONE) === 1) return 0;
  let changed = 0;
  for (const record of records.ofType('link')) {
    if (signal.aborted) return changed;
    const before = idsOf(record.fields.imageIds);
    if (before.length < 2 || record.fields.deletedAt) continue;
    const kept = await distinctKept(before, blobs, signal);
    if (signal.aborted) return changed;
    if (sameIds(kept, before)) continue;
    // Read again since: a link changed meanwhile (read again, its pictures new) is left as it is.
    const written = sync.apply([{ type: 'link', id: record.id, patch: current => (sameIds(idsOf(current.fields.imageIds), before) ? { imageIds: kept } : null) }]);
    changed += written.length;
  }
  writeMeta(db, DONE, 1);
  if (changed > 0) log.info('saved links shed copies of their pictures', { links: changed });
  return changed;
}
