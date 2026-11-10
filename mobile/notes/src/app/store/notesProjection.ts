/**
 * Carnet's records as its screens read them: notes, checks, links, labels, attachments and the
 * templates links are read with (« Modèles de fiche »), each child list per note, the board's and
 * the labels' order. A projection of the shared library
 * (`@shared/app/store/library`): only touched maps and entries are replaced, so a subscriber
 * re-renders only for its own record (held by libraryStore.test.ts). Pages shows Carnet's
 * collections too: it combines this projection with its own.
 */
import { comparePositions } from '@unlease/core/services/fractionalIndex';
import type { SyncRecord } from '@unlease/core/sync/record';
import type { Attachment, CheckItem, Label, LinkItem, Note } from '@unlease/notes/models/entities';
import type { LinkTemplate } from '@unlease/notes/models/templates';
import { attachmentFromRecord, checkFromRecord, labelFromRecord, linkFromRecord, linkTemplateFromRecord, noteFromRecord } from '@unlease/notes/sync/entities';
import type { LibraryBase, LibraryProjection } from '@shared/app/store/library';

export interface NotesState extends LibraryBase {
  readonly notes: Readonly<Record<string, Note>>;
  readonly checks: Readonly<Record<string, CheckItem>>;
  readonly links: Readonly<Record<string, LinkItem>>;
  readonly labels: Readonly<Record<string, Label>>;
  readonly attachments: Readonly<Record<string, Attachment>>;
  /** « Modèles de fiche », live and deleted (`deletedAt`): a kind's changed one under `template-<kind>`, the person's own by id. */
  readonly linkTemplates: Readonly<Record<string, LinkTemplate>>;
  /** Live child ids per note, in display order. A note with none holds no key. */
  readonly checksByNote: Readonly<Record<string, readonly string[]>>;
  readonly linksByNote: Readonly<Record<string, readonly string[]>>;
  readonly attachmentsByNote: Readonly<Record<string, readonly string[]>>;
  /** Every note not permanently deleted, in board order. */
  readonly noteOrder: readonly string[];
  readonly labelOrder: readonly string[];
}

const EMPTY: NotesState = {
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

type Draft = { -readonly [K in keyof NotesState]: NotesState[K] };
type ChildType = 'check' | 'link' | 'attachment';

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

/** A fresh projection: its child indexes live beside the state, one per library. */
export function notesProjection(): LibraryProjection<NotesState> {
  const children: Record<ChildType, Map<string, Set<string>>> = { check: new Map(), link: new Map(), attachment: new Map() };
  const parentOf = new Map<string, string>();

  function decode(base: NotesState, changed: readonly SyncRecord[]): NotesState {
    // Every key of `base` is kept, those of another projection combined with this one too.
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
          const entity = record.type === 'check' ? checkFromRecord(record) : record.type === 'link' ? linkFromRecord(record) : attachmentFromRecord(record);
          const mapName = record.type === 'check' ? 'checks' : record.type === 'link' ? 'links' : 'attachments';
          if (draft[mapName] === base[mapName]) (draft as Record<string, unknown>)[mapName] = { ...base[mapName] };
          (draft[mapName] as Record<string, unknown>)[entity.id] = entity;

          const key = `${record.type}:${entity.id}`;
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
        // Another app's records (Pages' blocks kept from before the split): not Carnet's to show.
        default:
          break;
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
        const sorted = ids && ids.size > 0 ? sortByPosition(ids, draft[entityNames[type]] as Record<string, { position: string; id: string }>) : [];
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
    return draft;
  }

  return {
    empty: EMPTY,
    decode,
    clear: () => {
      for (const map of Object.values(children)) map.clear();
      parentOf.clear();
    },
  };
}
