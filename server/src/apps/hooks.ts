/** What the platform asks of every app at once (`ServerApp`): their files, their Markdown, their lines in `LISEZMOI.md`. */
import type { MarkdownFile } from '../backup/markdown';
import type { StoredRecord } from '../sync/records';
import type { FilesOptions, ServerApp } from './types';

/** Blob id -> its path in the drive or an archive, every app's together. */
export function filesOf(apps: readonly ServerApp[], records: readonly StoredRecord[], options: FilesOptions): Map<string, string> {
  const files = new Map<string, string>();
  for (const app of apps) for (const [id, path] of app.files?.(records, options) ?? []) files.set(id, path);
  return files;
}

/** Every file the apps' records point at: the live ones', and a tombstoned one's when `keep` says so. */
export function filesInUse(apps: readonly ServerApp[], records: readonly StoredRecord[], keep: (record: StoredRecord) => boolean = () => false): Set<string> {
  const ids = new Set<string>();
  for (const app of apps) for (const id of app.filesInUse?.(records, keep) ?? []) ids.add(id);
  return ids;
}

export function markdownOf(apps: readonly ServerApp[], records: readonly StoredRecord[], options: FilesOptions): MarkdownFile[] {
  return apps.flatMap(app => app.markdown?.(records, options) ?? []);
}

export function readmeLines(apps: readonly ServerApp[]): string[] {
  return apps.flatMap(app => (app.readme ? [app.readme] : []));
}
