/** URL lists ("lines") in network order: by position, with "Non classé" last. */
import { useMemo } from 'react';

import { INBOX_ID, type Note } from '@unlease/notes/models/entities';

import { useLibraryStore, type LibraryState } from '../store/libraryStore';

const selectNotes = (s: LibraryState) => s.notes;
const selectOrder = (s: LibraryState) => s.noteOrder;

export function linesOf(order: readonly string[], notes: LibraryState['notes']): Note[] {
  const lines = order
    .map(id => notes[id])
    .filter((n): n is Note => !!n && n.kind === 'links' && n.deletedAt === null && n.trashedAt === null);
  const inbox = lines.filter(n => n.id === INBOX_ID);
  return [...lines.filter(n => n.id !== INBOX_ID), ...inbox];
}

export function useLines(): readonly Note[] {
  const notes = useLibraryStore(selectNotes);
  const order = useLibraryStore(selectOrder);
  return useMemo(() => linesOf(order, notes), [order, notes]);
}
