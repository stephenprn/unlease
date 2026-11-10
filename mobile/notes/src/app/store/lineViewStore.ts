/**
 * How this phone lays each collection's page out (`notes/services/lineView`: its order and its
 * filter), a device preference like the board's layout, never synced: another device keeps its own.
 * Only the collections set apart from the default are kept.
 */
import { create } from 'zustand';

import { DEFAULT_LINE_VIEW, readLineViews, withLineView, type LineView } from '@unlease/notes/services/lineView';
import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';

type Views = Readonly<Record<string, LineView>>;

export const useLineViewStore = create<{ readonly views: Views }>(() => ({ views: {} }));

export function loadLineViews(): void {
  useLineViewStore.setState({ views: readLineViews(readPreferences().lineViews) }, true);
}

export function setLineView(id: string, view: LineView): void {
  const views = withLineView(useLineViewStore.getState().views, id, view);
  writePreference('lineViews', views);
  useLineViewStore.setState({ views }, true);
}

/** The collection's view on this phone: its own order and every link until changed. */
export const selectLineView =
  (id: string) =>
  (s: { readonly views: Views }): LineView =>
    s.views[id] ?? DEFAULT_LINE_VIEW;
