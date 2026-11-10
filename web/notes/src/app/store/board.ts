/**
 * The board's own transient state: the multi-selection (picked on the board, acted on from the
 * header's selection bar). The search query is the shell's (`@shared/app/store/search`): the box
 * is in the header, the results on the board.
 */
import { create } from 'zustand';

import { setQuery } from '@shared/app/store/search';

interface BoardState {
  readonly selection: ReadonlySet<string>;
}

const NONE: ReadonlySet<string> = new Set();

export const useBoardStore = create<BoardState>(() => ({ selection: NONE }));

export const selectSelection = (s: BoardState): ReadonlySet<string> => s.selection;

export function toggleSelected(id: string): void {
  useBoardStore.setState(state => {
    const next = new Set(state.selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { selection: next };
  });
}

/** Add a run of ids (shift-click) without removing any. */
export function addToSelection(ids: readonly string[]): void {
  useBoardStore.setState(state => ({ selection: new Set([...state.selection, ...ids]) }));
}

export function clearSelection(): void {
  if (useBoardStore.getState().selection.size > 0) useBoardStore.setState({ selection: NONE });
}

/** Leaving a view clears the selection and the search, as the phone's drawer does. */
export function resetBoard(): void {
  useBoardStore.setState({ selection: NONE });
  setQuery('');
}
