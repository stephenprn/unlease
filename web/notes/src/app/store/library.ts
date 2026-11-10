/**
 * Carnet's library: every note, checklist line, link, label, photo and link template, in memory, folded from the
 * shell's records (`platform/app/store/records`, which writes them through to IndexedDB, merges the
 * server's and the other tabs', and keeps the sync's state). The web twin of the phone's
 * `libraryStore`'s render state.
 *
 * Re-render discipline (load-bearing, keep it while "simplifying"): entity maps
 * are copied on write and an entity object is replaced only when its own record
 * changed; a per-note child index is replaced only when that note's children
 * changed, and a note without children holds no key; derived orderings keep
 * their identity when their content is unchanged.
 *
 * The doors (`writeLocal`, `writeImported`) and the records themselves are the shell's: they are
 * passed on from here, so Carnet's code reads one module.
 */
import { create } from 'zustand';

import { comparePositions } from '@unlease/core/services/fractionalIndex';
import type { SyncRecord } from '@unlease/core/sync/record';
import { attachmentFromRecord, checkFromRecord, labelFromRecord, linkFromRecord, linkTemplateFromRecord, noteFromRecord } from '@unlease/notes/sync/entities';
import type { Attachment, CheckItem, Label, LinkItem, Note } from '@unlease/notes/models/entities';
import type { LinkTemplate } from '@unlease/notes/models/templates';
import { RECORD_TYPES } from '@unlease/notes/sync/types';

import type { Projection } from '@shared/app/store/records';

export { flushLibrary, getRecord, writeImported, writeLocal, type LocalChange } from '@shared/app/store/records';

export interface LibraryState {
  readonly notes: Readonly<Record<string, Note>>;
  readonly checks: Readonly<Record<string, CheckItem>>;
  readonly links: Readonly<Record<string, LinkItem>>;
  readonly labels: Readonly<Record<string, Label>>;
  readonly attachments: Readonly<Record<string, Attachment>>;
  /** What Claude notes on links (« Ce que Claude relève »): the kinds' changed ones and the person's own, deleted ones too (`deletedAt`). */
  readonly linkTemplates: Readonly<Record<string, LinkTemplate>>;
  /** Live child ids per note, in display order. A note with none holds no key. */
  readonly checksByNote: Readonly<Record<string, readonly string[]>>;
  readonly linksByNote: Readonly<Record<string, readonly string[]>>;
  readonly attachmentsByNote: Readonly<Record<string, readonly string[]>>;
  /** Every live (not permanently deleted) note, in board order. */
  readonly noteOrder: readonly string[];
  /** Every live label, in order. */
  readonly labelOrder: readonly string[];
  /** Bumped by every change; cheap invalidation for derived caches like search. */
  readonly revision: number;
}

const EMPTY: LibraryState = {
  notes: {},
  checks: {},
  links: {},
  labels: {},
  attachments: {},
  linkTemplates: {},
  checksByNote: {},
  linksByNote: {},
  attachmentsByNote: {},
  noteOrder: [],
  labelOrder: [],
  revision: 0,
};

export const useLibraryStore = create<LibraryState>(() => EMPTY);

/** Live children per note, per child type. */
const children: Record<'check' | 'link' | 'attachment', Map<string, Set<string>>> = {
  check: new Map(),
  link: new Map(),
  attachment: new Map(),
};
/** The note a live child currently belongs to. */
const parentOf = new Map<string, string>();

const keyOf = (type: string, id: string): string => `${type}:${id}`;

type Draft = {
  -readonly [K in keyof LibraryState]: LibraryState[K];
};

export function sortByPosition<T extends { position: string; id: string }>(ids: Iterable<string>, map: Readonly<Record<string, T>>): string[] {
  return [...ids]
    .map(id => map[id])
    .filter((entity): entity is T => entity !== undefined)
    .sort(comparePositions)
    .map(entity => entity.id);
}

export function sameIds(a: readonly string[] | undefined, b: readonly string[]): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/** Fold changed records into a copy of the render state. Only touched maps and entries are replaced. */
function decodeInto(base: LibraryState, changed: readonly SyncRecord[]): LibraryState {
  const draft: Draft = { ...base };
  const touched = { check: new Set<string>(), link: new Set<string>(), attachment: new Set<string>() };
  let notesChanged = false;
  let labelsChanged = false;
  let templatesChanged = false;

  for (const record of changed) {
    switch (record.type) {
      case 'note': {
        if (!notesChanged) draft.notes = { ...draft.notes };
        notesChanged = true;
        const note = noteFromRecord(record);
        (draft.notes as Record<string, Note>)[note.id] = note;
        break;
      }
      case 'label': {
        if (!labelsChanged) draft.labels = { ...draft.labels };
        labelsChanged = true;
        const label = labelFromRecord(record);
        (draft.labels as Record<string, Label>)[label.id] = label;
        break;
      }
      case 'linkTemplate': {
        if (!templatesChanged) draft.linkTemplates = { ...draft.linkTemplates };
        templatesChanged = true;
        const template = linkTemplateFromRecord(record);
        (draft.linkTemplates as Record<string, LinkTemplate>)[template.id] = template;
        break;
      }
      case 'check':
      case 'link':
      case 'attachment': {
        const entity =
          record.type === 'check' ? checkFromRecord(record) : record.type === 'link' ? linkFromRecord(record) : attachmentFromRecord(record);
        const mapName = record.type === 'check' ? 'checks' : record.type === 'link' ? 'links' : 'attachments';
        if (draft[mapName] === base[mapName]) {
          (draft as Record<string, unknown>)[mapName] = { ...base[mapName] };
        }
        (draft[mapName] as Record<string, unknown>)[entity.id] = entity;

        const key = keyOf(record.type, entity.id);
        const before = parentOf.get(key);
        const after = entity.deletedAt === null && entity.noteId ? entity.noteId : undefined;
        if (before !== after) {
          if (before) children[record.type].get(before)?.delete(entity.id);
          if (after) {
            let set = children[record.type].get(after);
            if (!set) children[record.type].set(after, (set = new Set()));
            set.add(entity.id);
            parentOf.set(key, after);
          } else {
            parentOf.delete(key);
          }
        }
        if (before) touched[record.type].add(before);
        if (after) touched[record.type].add(after);
        break;
      }
    }
  }

  const indexNames = { check: 'checksByNote', link: 'linksByNote', attachment: 'attachmentsByNote' } as const;
  const entityNames = { check: 'checks', link: 'links', attachment: 'attachments' } as const;
  for (const type of ['check', 'link', 'attachment'] as const) {
    if (touched[type].size === 0) continue;
    const index = { ...draft[indexNames[type]] } as Record<string, readonly string[]>;
    let indexChanged = false;
    for (const noteId of touched[type]) {
      const ids = children[type].get(noteId);
      const sorted =
        ids && ids.size > 0 ? sortByPosition(ids, draft[entityNames[type]] as Record<string, { position: string; id: string }>) : [];
      if (sorted.length === 0) {
        if (noteId in index) {
          delete index[noteId];
          indexChanged = true;
        }
      } else if (!sameIds(index[noteId], sorted)) {
        index[noteId] = sorted;
        indexChanged = true;
      }
    }
    if (indexChanged) (draft as Record<string, unknown>)[indexNames[type]] = index;
  }

  if (notesChanged) {
    const order = sortByPosition(
      Object.values(draft.notes)
        .filter(note => note.deletedAt === null)
        .map(note => note.id),
      draft.notes,
    );
    if (!sameIds(base.noteOrder, order)) draft.noteOrder = order;
  }
  if (labelsChanged) {
    const order = sortByPosition(
      Object.values(draft.labels)
        .filter(label => label.deletedAt === null)
        .map(label => label.id),
      draft.labels,
    );
    if (!sameIds(base.labelOrder, order)) draft.labelOrder = order;
  }

  draft.revision = base.revision + 1;
  return draft;
}

/** What the shell feeds: Carnet's records, and only those. */
export const notesProjection: Projection = {
  types: RECORD_TYPES,
  apply(changed, fresh) {
    useLibraryStore.setState(state => decodeInto(fresh ? EMPTY : state, changed), true);
  },
  clear() {
    for (const map of Object.values(children)) map.clear();
    parentOf.clear();
    useLibraryStore.setState(EMPTY, true);
  },
};
