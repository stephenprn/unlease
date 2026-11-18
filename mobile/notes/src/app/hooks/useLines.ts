/** URL lists ("lines") in network order: by position, with "Non classé" last; a protected one never (it shows in its section alone). */
import { useMemo } from 'react';

import { INBOX_ID, type Note } from '@unlease/notes/models/entities';
import { shownOutsideLock } from '@unlease/notes/services/lock';

import { useLibraryStore, type LibraryState } from '../store/libraryStore';

const selectNotes = (s: LibraryState) => s.notes;
const selectOrder = (s: LibraryState) => s.noteOrder;

export function linesOf(order: readonly string[], notes: LibraryState['notes']): Note[] {
  const lines = order
    .map(id => notes[id])
    .filter((n): n is Note => !!n && n.kind === 'links' && n.deletedAt === null && n.trashedAt === null && shownOutsideLock(n));
  const inbox = lines.filter(n => n.id === INBOX_ID);
  return [...lines.filter(n => n.id !== INBOX_ID), ...inbox];
}

export function useLines(): readonly Note[] {
  const notes = useLibraryStore(selectNotes);
  const order = useLibraryStore(selectOrder);
  return useMemo(() => linesOf(order, notes), [order, notes]);
}
