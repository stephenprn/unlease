/**
 * What a board view shows, as ordered note ids (the phone's `useBoard`).
 *
 * The board holds text and checklist notes; URL lists live in the line strip
 * and the network page, and come onto the board only when pinned. Search
 * reaches everything that is not in the bin, lists and links included.
 */
import { useMemo } from 'react';

import { t } from '@unlease/core/i18n';
import { searchDocuments, type SearchDocument } from '@unlease/core/services/search';
import type { Note } from '@unlease/notes/models/entities';

import { useLibraryStore, type LibraryState } from '../store/library';
import { buildDocument } from '@unlease/notes/services/noteSearch';

export type BoardView = 'notes' | 'reminders' | 'archive' | 'trash' | `label:${string}`;

export interface BoardSection {
  readonly key: string;
  readonly title: string | null;
  readonly ids: readonly string[];
}

export interface BoardSections {
  /** Titled groups, in order; empty groups are omitted. */
  readonly sections: readonly BoardSection[];
  readonly total: number;
}

const selectNotes = (s: LibraryState) => s.notes;
const selectOrder = (s: LibraryState) => s.noteOrder;

const isLive = (note: Note | undefined): note is Note => !!note && note.deletedAt === null;

export function sectionsFor(view: BoardView, order: readonly string[], notes: LibraryState['notes'], now: number): BoardSections {
  const live = order.map(id => notes[id]).filter(isLive);
  const result = (groups: { key: string; title: string | null; ids: string[] }[]): BoardSections => {
    const sections = groups.filter(group => group.ids.length > 0);
    return { sections, total: sections.reduce((n, s) => n + s.ids.length, 0) };
  };

  if (view === 'trash') {
    const ids = live
      .filter(note => note.trashedAt !== null)
      .sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0))
      .map(note => note.id);
    return result([{ key: 'trash', title: null, ids }]);
  }
  const notTrashed = live.filter(note => note.trashedAt === null);
  if (view === 'archive') {
    return result([{ key: 'archive', title: null, ids: notTrashed.filter(n => n.archived).map(n => n.id) }]);
  }
  if (view === 'reminders') {
    const withReminder = notTrashed.filter(n => n.reminderAt !== null).sort((a, b) => (a.reminderAt ?? 0) - (b.reminderAt ?? 0));
    return result([
      { key: 'upcoming', title: t('À venir'), ids: withReminder.filter(n => (n.reminderAt ?? 0) >= now).map(n => n.id) },
      { key: 'past', title: t('Passés'), ids: withReminder.filter(n => (n.reminderAt ?? 0) < now).reverse().map(n => n.id) },
    ]);
  }
  const active = notTrashed.filter(n => !n.archived);
  const onBoard = view.startsWith('label:')
    ? active.filter(n => n.labelIds.includes(view.slice(6)))
    : active.filter(n => n.kind !== 'links' || n.pinned);
  return result([
    { key: 'pinned', title: t('Épinglées'), ids: onBoard.filter(n => n.pinned).map(n => n.id) },
    { key: 'others', title: onBoard.some(n => n.pinned) ? t('Autres') : null, ids: onBoard.filter(n => !n.pinned).map(n => n.id) },
  ]);
}

export function useBoardSections(view: BoardView, now: number): BoardSections {
  const notes = useLibraryStore(selectNotes);
  const order = useLibraryStore(selectOrder);
  // `now` is floored to the minute by the caller, so the reminders split moves
  // at most once a minute instead of on every render.
  return useMemo(() => sectionsFor(view, order, notes, now), [view, order, notes, now]);
}

/** The search's documents, for the live notes and for the bin's, each kept until the library changes. */
const cached: Record<'live' | 'bin', { revision: number; documents: SearchDocument[] }> = { live: { revision: -1, documents: [] }, bin: { revision: -1, documents: [] } };

function documents(state: LibraryState, bin: boolean): SearchDocument[] {
  const cache = cached[bin ? 'bin' : 'live'];
  if (state.revision === cache.revision) return cache.documents;
  const docs: SearchDocument[] = [];
  for (const id of state.noteOrder) {
    const note = state.notes[id];
    // In the bin a search finds what is in the bin, and only that: its actions erase for good.
    if (!note || note.deletedAt !== null || (note.trashedAt !== null) !== bin) continue;
    const checks = (state.checksByNote[id] ?? []).map(cid => state.checks[cid]!).filter(Boolean);
    const links = (state.linksByNote[id] ?? []).map(lid => state.links[lid]!).filter(Boolean);
    const labels = note.labelIds.map(lid => state.labels[lid]!).filter(Boolean);
    docs.push(buildDocument(note, checks, links, labels));
  }
  cache.revision = state.revision;
  cache.documents = docs;
  return docs;
}

/** Note ids matching `query`, best first: the live notes, or with `bin` those in the bin. */
export function searchNotes(state: LibraryState, query: string, bin = false): string[] {
  if (!query.trim()) return [];
  return searchDocuments(documents(state, bin), query).map(hit => hit.noteId);
}

export function useSearch(query: string, bin = false): readonly string[] {
  // The whole library: any change re-runs the search (documents are cached per revision).
  const library = useLibraryStore();
  return useMemo(() => searchNotes(library, query, bin), [library, query, bin]);
}
