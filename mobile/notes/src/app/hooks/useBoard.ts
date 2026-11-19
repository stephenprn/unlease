/**
 * Board views as ordered note ids. URL lists appear on the board only when pinned;
 * search reaches everything outside the bin, links included. A protected note (`locked`) shows in
 * the protected view alone, and in the bin while the lock is open (`notes/services/lock`).
 */
import { useMemo } from 'react';

import { t } from '@unlease/core/i18n';
import { BOARD_FILTERS, keptByFilter, type BoardFilter } from '@unlease/notes/services/boardFilter';
import { searchDocuments, type SearchDocument } from '@unlease/core/services/search';
import type { CheckItem, Note } from '@unlease/notes/models/entities';

import { useLibraryStore, type LibraryState } from '../store/libraryStore';
import { buildDocument } from '@unlease/notes/services/noteSearch';
import { mentionsVersion } from '@unlease/notes/services/noteMentions';
import { isLockedNote, shownNow, shownOutsideLock } from '@unlease/notes/services/lock';
import { useLockOpen } from '@shared/app/lock';

export type BoardView = 'notes' | 'reminders' | 'archive' | 'trash' | 'protected' | `label:${string}`;

export interface BoardSections {
  /** Titled groups, in order; empty groups are omitted. */
  readonly sections: readonly { readonly key: string; readonly title: string | null; readonly ids: readonly string[] }[];
  readonly total: number;
}

const selectNotes = (s: LibraryState) => s.notes;
const selectOrder = (s: LibraryState) => s.noteOrder;

const isLive = (note: Note | undefined): note is Note => !!note && note.deletedAt === null;

/** `open`: the lock is open, so the bin shows the protected notes binned too. */
export function sectionsFor(view: BoardView, order: readonly string[], notes: LibraryState['notes'], now: number, open = false, kept: ReadonlySet<string> | null = null): BoardSections {
  const live = order.map(id => notes[id]).filter(isLive);
  const result = (groups: { key: string; title: string | null; ids: string[] }[]): BoardSections => {
    const sections = groups.filter(group => group.ids.length > 0);
    return { sections, total: sections.reduce((n, s) => n + s.ids.length, 0) };
  };

  if (view === 'trash') {
    const ids = live
      .filter(note => note.trashedAt !== null && shownNow(note, open))
      .sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0))
      .map(note => note.id);
    return result([{ key: 'trash', title: null, ids }]);
  }
  if (view === 'protected') {
    const kept = live.filter(note => note.trashedAt === null && isLockedNote(note));
    return result([
      { key: 'pinned', title: t('Pinned'), ids: kept.filter(n => n.pinned).map(n => n.id) },
      { key: 'others', title: kept.some(n => n.pinned) ? t('Others') : null, ids: kept.filter(n => !n.pinned).map(n => n.id) },
    ]);
  }
  const notTrashed = live.filter(note => note.trashedAt === null && shownOutsideLock(note));
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
    : active.filter(n => (n.kind !== 'links' || n.pinned) && (kept === null || kept.has(n.id)));
  return result([
    { key: 'pinned', title: t('Pinned'), ids: onBoard.filter(n => n.pinned).map(n => n.id) },
    { key: 'others', title: onBoard.some(n => n.pinned) ? t('Others') : null, ids: onBoard.filter(n => !n.pinned).map(n => n.id) },
  ]);
}

/** The notes' board, narrowed by its filter: its chips' counts too (null in any other view). */
export interface FilteredBoard extends BoardSections {
  readonly counts: Readonly<Record<BoardFilter, number>> | null;
}

const itemsOf = (s: LibraryState, id: string): CheckItem[] => (s.checksByNote[id] ?? []).flatMap(cid => (s.checks[cid] ? [s.checks[cid]!] : []));

/**
 * The notes each filter keeps, as one string (its ids, filter by filter): an equal string draws
 * nothing again, so an item ticked or typed elsewhere leaves the board as it is unless a filter changes.
 */
function keptKey(s: LibraryState, now: number): string {
  const kept: Record<string, string[]> = {};
  for (const filter of BOARD_FILTERS) if (filter !== 'all') kept[filter] = [];
  for (const id of s.noteOrder) {
    const note = s.notes[id];
    if (!note || note.deletedAt !== null || note.trashedAt !== null || note.archived) continue;
    const items = note.kind === 'checklist' ? itemsOf(s, id) : [];
    for (const filter of Object.keys(kept)) if (keptByFilter(filter as BoardFilter, note, items, now)) kept[filter]!.push(id);
  }
  return Object.keys(kept)
    .map(filter => `${filter}:${kept[filter]!.join(',')}`)
    .join('|');
}

export function useBoardSections(view: BoardView, now: number, filter: BoardFilter = 'all'): FilteredBoard {
  const notes = useLibraryStore(selectNotes);
  const order = useLibraryStore(selectOrder);
  const open = useLockOpen();
  const filtering = view === 'notes';
  const keys = useLibraryStore(s => (filtering ? keptKey(s, now) : ''));
  // `now` is floored to the minute by the caller, so the reminders split and the week move at most
  // once a minute instead of on every render.
  return useMemo(() => {
    const board = sectionsFor(view, order, notes, now, open);
    if (!filtering) return { ...board, counts: null };
    const sets = new Map<string, ReadonlySet<string>>(
      keys.split('|').map(part => {
        const [name, ids] = part.split(':');
        return [name!, new Set(ids ? ids.split(',') : [])];
      }),
    );
    const shown = board.sections.flatMap(section => section.ids);
    const counts = Object.fromEntries(BOARD_FILTERS.map(each => [each, each === 'all' ? board.total : shown.filter(id => sets.get(each)?.has(id)).length])) as Record<BoardFilter, number>;
    const narrowed = filter === 'all' ? board : sectionsFor(view, order, notes, now, open, sets.get(filter) ?? new Set());
    return { ...narrowed, counts };
  }, [view, order, notes, now, open, filtering, keys, filter]);
}

/** Where a search looks: the live notes, the bin's, or the protected section's (only while the lock is open). */
export type SearchScope = 'live' | 'bin' | 'protected';

/** The search's documents, per scope, each kept until the library changes. */
const cached: Record<SearchScope, { revision: number; names: number; documents: SearchDocument[] }> = {
  live: { revision: -1, names: -1, documents: [] },
  bin: { revision: -1, names: -1, documents: [] },
  protected: { revision: -1, names: -1, documents: [] },
};

function documents(state: LibraryState, scope: SearchScope): SearchDocument[] {
  const cache = cached[scope];
  // The people a note names are found by their names now: a contact renamed starts the documents over too.
  if (state.revision === cache.revision && mentionsVersion() === cache.names) return cache.documents;
  const docs: SearchDocument[] = [];
  for (const id of state.noteOrder) {
    const note = state.notes[id];
    // In the bin a search finds what is in the bin, and only that: its actions erase for good.
    if (!note || note.deletedAt !== null || (note.trashedAt !== null) !== (scope === 'bin')) continue;
    // A protected note is found in its section alone, and nothing else is found there.
    if (isLockedNote(note) !== (scope === 'protected')) continue;
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

const selectRevision = (s: LibraryState) => s.revision;

/** The notes a search finds in `scope`; nothing in the protected section while the lock is shut. */
export function useSearch(query: string, scope: SearchScope = 'live'): readonly string[] {
  const revision = useLibraryStore(selectRevision);
  const open = useLockOpen();
  return useMemo(() => {
    if (!query.trim() || (scope === 'protected' && !open)) return [];
    return searchDocuments(documents(useLibraryStore.getState(), scope), query).map(hit => hit.noteId);
    // `revision` stands for the whole library: any change re-runs the search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, revision, scope, open]);
}
