/**
 * Carnet's door to the library for its actions (`actions.ts`, `editing.ts`): each batch goes through `writeLocal`
 * as it is, and whoever watches is told what it wrote, record by record, the fields before and after
 * (the note editor's « Annuler » and « Rétablir », `useNoteHistory`). A step the history writes back
 * says so (`replayed`), so it is not taken for a new one.
 */
import type { Written } from '@unlease/notes/services/editHistory';

import { getRecord, writeLocal, type LocalChange } from '@shared/app/store/records';

export type WriteWatcher = (written: readonly Written[], at: number, replayed: boolean) => void;

const watchers = new Set<WriteWatcher>();

/** Told of every batch Carnet's actions write; returns the way to stop. */
export function watchWrites(watcher: WriteWatcher): () => void {
  watchers.add(watcher);
  return () => {
    watchers.delete(watcher);
  };
}

/** One batch, one clock (`writeLocal`), told to the watchers. */
export function write(changes: readonly LocalChange[], now: number = Date.now(), replayed = false): void {
  if (watchers.size === 0 || changes.length === 0) {
    writeLocal(changes, now);
    return;
  }
  const before = changes.map(change => getRecord(change.type, change.id)?.fields);
  writeLocal(changes, now);
  const written: Written[] = [];
  changes.forEach((change, index) => {
    const after = getRecord(change.type, change.id)?.fields;
    if (after) written.push({ type: change.type, id: change.id, before: before[index], after, fields: Object.keys(change.patch) });
  });
  for (const watcher of [...watchers]) watcher(written, now, replayed);
}
