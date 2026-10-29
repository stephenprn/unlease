/**
 * The board's own transient state: the search query (it lives in the header,
 * the results on the board) and the multi-selection (picked on the board,
 * acted on from the header's selection bar).
 */
import { create } from 'zustand';

interface BoardState {
  readonly query: string;
  readonly selection: ReadonlySet<string>;
}

const NONE: ReadonlySet<string> = new Set();

export const useBoardStore = create<BoardState>(() => ({ query: '', selection: NONE }));

export const selectQuery = (s: BoardState): string => s.query;
export const selectSelection = (s: BoardState): ReadonlySet<string> => s.selection;

export function setQuery(query: string): void {
  useBoardStore.setState({ query });
}

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

/** Leaving a view clears both, as the phone's drawer does. */
export function resetBoard(): void {
  useBoardStore.setState({ query: '', selection: NONE });
}
