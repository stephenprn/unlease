/**
 * URL lists as filing targets. Each list is offered to Claude with its
 * description and a few titles already in it, which says more about what
 * "Mode" or "À voir" means to this person than the title alone, and the
 * fields of its own template when it has one (a link filed there fills them).
 */
import { INBOX_ID, INBOX_TITLE } from '@unlease/notes/models/entities';
import type { TemplateField } from '@unlease/notes/models/templates';
import { comparePositions } from '@unlease/core/services/fractionalIndex';
import { foldText } from '@unlease/core/services/search';
import { sortTargets } from '@unlease/notes/services/sorting';
import { collectionTemplate, titleNamesKind, type Templates } from '@unlease/notes/services/templates';
import { linkFromRecord, noteFromRecord } from '@unlease/notes/sync/entities';
import type { RecordStore } from '../../../sync/records';
import { clipText } from './output';
import type { CachedAnalysis } from './usage';

export interface RoutingList {
  readonly id: string;
  readonly title: string;
  readonly hint: string;
  readonly examples: readonly string[];
  /** Its own template's fields (`note.templateId`): a link filed there is read with them. */
  readonly fields?: readonly TemplateField[];
}

const EXAMPLES_PER_LIST = 5;

/** Every live URL list (not deleted, not in the bin), the inbox always included; with `templates`, each list's own template's fields. */
export function routingLists(records: RecordStore, templates?: Templates): RoutingList[] {
  const notes = records
    .ofType('note')
    .map(noteFromRecord)
    .filter(note => note.kind === 'links' && note.deletedAt === null && note.trashedAt === null)
    .sort(comparePositions);
  if (!notes.some(note => note.id === INBOX_ID)) notes.push(noteFromRecord({ type: 'note', id: INBOX_ID, fields: { kind: 'links', title: INBOX_TITLE }, clocks: {} }));
  const byId = new Map(notes.map(note => [note.id, note]));
  return sortTargets(notes, records.ofType('link').map(linkFromRecord), EXAMPLES_PER_LIST).map(target => {
    const own = templates && target.id !== INBOX_ID ? collectionTemplate(templates, byId.get(target.id)) : null;
    return {
      id: target.id,
      title: clipText(target.title, 100),
      hint: clipText(target.hint, 300),
      examples: target.examples.map(example => clipText(example, 120)),
      ...(own ? { fields: own.fields } : {}),
    };
  });
}

/**
 * Where a cached result goes without asking Claude again: the list it was
 * filed in last time (renamed or not), else one with that list's name, else a
 * list whose title names the kind, else the inbox.
 */
export function routeCached(lists: readonly RoutingList[], cached: CachedAnalysis): string {
  const fold = (value: string) => foldText(value).trim();
  const kept = cached.listId ? lists.find(list => list.id === cached.listId) : undefined;
  if (kept) return kept.id;
  if (cached.listTitle) {
    const same = lists.find(list => fold(list.title) === fold(cached.listTitle!));
    if (same) return same.id;
  }
  for (const list of lists) {
    if (list.id === INBOX_ID) continue;
    if (titleNamesKind(list.title, cached.kind)) return list.id;
  }
  return INBOX_ID;
}
