/**
 * What a person does in Pages outside the page actions (`./pages`): the writes every gesture goes
 * through, and those on Carnet's links a page shows (a collection embedded in a page stamps its
 * links as Carnet's board does). Each is one `writeLocal` batch: one clock, synced.
 */
import { getLocale } from '@unlease/core/i18n';
import type { Fields } from '@unlease/core/sync/record';

import { getRecord, saveTypedField, writeLocal, type LocalChange } from './libraryStore';

export type Undo = () => void;

function undoFor(changes: readonly LocalChange[]): Undo {
  const previous: LocalChange[] = changes.map(change => {
    const record = getRecord(change.type, change.id);
    const patch: Fields = {};
    for (const field of Object.keys(change.patch)) patch[field] = record?.fields[field] ?? null;
    return { type: change.type, id: change.id, patch };
  });
  return () => writeLocal(previous);
}

/** Write and hand back the way to take it back. */
export function writeWithUndo(changes: LocalChange[]): Undo {
  const undo = undoFor(changes);
  writeLocal(changes);
  return undo;
}

/**
 * What an editor holds for a typed field (a block's text, caption or drawing), merged with an edit
 * that landed meanwhile; `since` is what it last saved or showed. Returns the text now stored.
 */
export function saveTypedText(type: 'block', id: string, field: 'text' | 'caption' | 'drawing', since: string | null, typed: string): string {
  return saveTypedField(type, id, field, since, typed);
}

/** A link of an embedded collection stamped done (or put back to do), as Carnet's board does it. */
export function setLinkDone(id: string, done: boolean, now: number = Date.now()): Undo {
  return writeWithUndo([{ type: 'link', id, patch: { done, doneAt: done ? now : null } }]);
}

/** « Relire la page » on a link a page shows: the server reads it again, in this device's language. */
export function reanalyzeLink(id: string): void {
  writeLocal([{ type: 'link', id, patch: { status: 'pending', error: null, lang: getLocale() } }]);
}
