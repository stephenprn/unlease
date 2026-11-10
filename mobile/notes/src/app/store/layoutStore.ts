/** How the board lays its notes out on this phone (a wall or a list), a device preference like the shared settings. */
import { create } from 'zustand';

import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';

export type BoardLayout = 'wall' | 'list';

export const useLayoutStore = create<{ readonly layout: BoardLayout }>(() => ({ layout: 'wall' }));

export const selectLayout = (s: { readonly layout: BoardLayout }): BoardLayout => s.layout;

export function loadLayout(): void {
  useLayoutStore.setState({ layout: readPreferences().layout === 'list' ? 'list' : 'wall' });
}

export function setLayout(layout: BoardLayout): void {
  writePreference('layout', layout);
  useLayoutStore.setState({ layout });
}
