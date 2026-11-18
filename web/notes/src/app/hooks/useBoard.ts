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

import { useLockOpen } from '@shared/app/lock';

import { useLibraryStore, type LibraryState } from '../store/library';
import { buildDocument } from '@unlease/notes/services/noteSearch';
import { isLockedNote, shownNow } from '@unlease/notes/services/lock';
import { mentionsVersion } from '@unlease/notes/services/noteMentions';

/** `protected`: the protected section (`notes/services/lock`), its notes shown only there and only with the lock open. */
export type BoardView = 'notes' | 'reminders' | 'archive' | 'trash' | 'protected' | `label:${string}`;

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

/** `open`: the lock is open, so the bin shows the protected notes binned too. */
export function sectionsFor(view: BoardView, order: readonly string[], notes: LibraryState['notes'], now: number, open = false): BoardSections {
  const all = order.map(id => notes[id]).filter(isLive);
  const result = (groups: { key: string; title: string | null; ids: string[] }[]): BoardSections => {
    const sections = groups.filter(group => group.ids.length > 0);
    return { sections, total: sections.reduce((n, s) => n + s.ids.length, 0) };
  };

  if (view === 'protected') {
    // Archived ones too: the section is their only place.
    const kept = open ? all.filter(note => isLockedNote(note) && note.trashedAt === null) : [];
    return result([
      { key: 'pinned', title: t('Pinned'), ids: kept.filter(n => n.pinned).map(n => n.id) },
      { key: 'others', title: kept.some(n => n.pinned) ? t('Others') : null, ids: kept.filter(n => !n.pinned).map(n => n.id) },
    ]);
  }
  if (view === 'trash') {
    const ids = all
      .filter(note => shownNow(note, open) && note.trashedAt !== null)
      .sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0))
      .map(note => note.id);
    return result([{ key: 'trash', title: null, ids }]);
  }
  // Every other view leaves the protected notes out, the lock open or not.
  const notTrashed = all.filter(note => note.trashedAt === null && !isLockedNote(note));
  if (view === 'archive') {
    return result([{ key: 'archive', title: null, ids: notTrashed.filter(n => n.archived).map(n => n.id) }]);
  }
  if (view === 'reminders') {
    const withReminder = notTrashed.filter(n => n.reminderAt !== null).sort((a, b) => (a.reminderAt ?? 0) - (b.reminderAt ?? 0));
    return result([
      { key: 'upcoming', title: t('Upcoming'), ids: withReminder.filter(n => (n.reminderAt ?? 0) >= now).map(n => n.id) },
      { key: 'past', title: t('Past'), ids: withReminder.filter(n => (n.reminderAt ?? 0) < now).reverse().map(n => n.id) },
    ]);
  }
  const active = notTrashed.filter(n => !n.archived);
  const onBoard = view.startsWith('label:')
    ? active.filter(n => n.labelIds.includes(view.slice(6)))
    : active.filter(n => n.kind !== 'links' || n.pinned);
  return result([
    { key: 'pinned', title: t('Pinned'), ids: onBoard.filter(n => n.pinned).map(n => n.id) },
    { key: 'others', title: onBoard.some(n => n.pinned) ? t('Others') : null, ids: onBoard.filter(n => !n.pinned).map(n => n.id) },
  ]);
}

export function useBoardSections(view: BoardView, now: number): BoardSections {
  const notes = useLibraryStore(selectNotes);
  const order = useLibraryStore(selectOrder);
  const open = useLockOpen();
  // `now` is floored to the minute by the caller, so the reminders split moves
  // at most once a minute instead of on every render.
  return useMemo(() => sectionsFor(view, order, notes, now, open), [view, order, notes, now, open]);
}

/** Where a search looks: the live notes, the bin, or the protected section (its own search, the lock open). */
export type SearchScope = 'live' | 'bin' | 'protected';

/** The search's documents, per scope, each kept until the library changes. */
const cached: Record<SearchScope, { revision: number; names: number; documents: SearchDocument[] }> = {
  live: { revision: -1, names: -1, documents: [] },
  bin: { revision: -1, names: -1, documents: [] },
  protected: { revision: -1, names: -1, documents: [] },
};

function documents(state: LibraryState, scope: SearchScope): SearchDocument[] {
  const cache = cached[scope];
  const bin = scope === 'bin';
  // The people a note names are found by their names now: a contact renamed starts the documents over too.
  if (state.revision === cache.revision && mentionsVersion() === cache.names) return cache.documents;
  const docs: SearchDocument[] = [];
  for (const id of state.noteOrder) {
    const note = state.notes[id];
    // In the bin a search finds what is in the bin, and only that: its actions erase for good. A
    // protected note is found by the section's own search only.
    if (!note || note.deletedAt !== null || (note.trashedAt !== null) !== bin || isLockedNote(note) !== (scope === 'protected')) continue;
    const checks = (state.checksByNote[id] ?? []).map(cid => state.checks[cid]!).filter(Boolean);
    const links = (state.linksByNote[id] ?? []).map(lid => state.links[lid]!).filter(Boolean);
    const labels = note.labelIds.map(lid => state.labels[lid]!).filter(Boolean);
    docs.push(buildDocument(note, checks, links, labels));
  }
  cache.revision = state.revision;
  cache.names = mentionsVersion();
  cache.documents = docs;
  return docs;
}

/** Note ids matching `query`, best first: the live notes, those in the bin, or the protected ones. */
export function searchNotes(state: LibraryState, query: string, scope: SearchScope = 'live'): string[] {
  if (!query.trim()) return [];
  return searchDocuments(documents(state, scope), query).map(hit => hit.noteId);
}

/** The protected section's search finds nothing while the lock is shut. */
export function useSearch(query: string, scope: SearchScope = 'live'): readonly string[] {
  // The whole library: any change re-runs the search (documents are cached per revision).
  const library = useLibraryStore();
  const open = useLockOpen();
  return useMemo(() => (scope === 'protected' && !open ? [] : searchNotes(library, query, scope)), [library, query, scope, open]);
}
