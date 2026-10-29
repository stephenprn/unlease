/**
 * The URL lists ("lines"), in network order: the owner's lines by position,
 * "Non classé" last, because it is where things go when nothing else fits.
 */
import { useMemo } from 'react';

import { INBOX_ID, type Note } from '@unlease/notes/models/entities';

import { useLibraryStore, type LibraryState } from '../store/library';

const selectNotes = (s: LibraryState) => s.notes;
const selectOrder = (s: LibraryState) => s.noteOrder;

export function linesOf(order: readonly string[], notes: LibraryState['notes']): Note[] {
  const lines = order
    .map(id => notes[id])
    .filter((n): n is Note => !!n && n.kind === 'links' && n.deletedAt === null && n.trashedAt === null);
  const inbox = lines.filter(n => n.id === INBOX_ID);
  return [...lines.filter(n => n.id !== INBOX_ID), ...inbox];
}

/** A collection's links to do in their order, then those done, last stamped first (its screen, an embed). */
export function lineLinkIds(s: LibraryState, id: string): { readonly open: string[]; readonly done: string[] } {
  const ids = s.linksByNote[id] ?? [];
  return {
    open: ids.filter(lid => s.links[lid] && !s.links[lid]!.done),
    done: ids.filter(lid => s.links[lid]?.done).sort((a, b) => (s.links[b]!.doneAt ?? 0) - (s.links[a]!.doneAt ?? 0)),
  };
}

export function useLines(): readonly Note[] {
  const notes = useLibraryStore(selectNotes);
  const order = useLibraryStore(selectOrder);
  return useMemo(() => linesOf(order, notes), [order, notes]);
}
