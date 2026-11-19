/**
 * How the board shows itself on this phone, device preferences like the shared settings: its notes as a
 * wall or a list, and the row under the search strip (the collections, the labels or the filters).
 */
import { create } from 'zustand';

import { asBoardRow, DEFAULT_BOARD_ROW, type BoardRow } from '@unlease/notes/services/boardFilter';
import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';

export type BoardLayout = 'wall' | 'list';

interface LayoutState {
  readonly layout: BoardLayout;
  readonly boardRow: BoardRow;
}

export const useLayoutStore = create<LayoutState>(() => ({ layout: 'wall', boardRow: DEFAULT_BOARD_ROW }));

export const selectLayout = (s: LayoutState): BoardLayout => s.layout;
export const selectBoardRow = (s: LayoutState): BoardRow => s.boardRow;

export function loadLayout(): void {
  const stored = readPreferences();
  useLayoutStore.setState({ layout: stored.layout === 'list' ? 'list' : 'wall', boardRow: asBoardRow(stored.boardRow) });
}

export function setLayout(layout: BoardLayout): void {
  writePreference('layout', layout);
  useLayoutStore.setState({ layout });
}

export function setBoardRow(boardRow: BoardRow): void {
  writePreference('boardRow', boardRow);
  useLayoutStore.setState({ boardRow });
}
