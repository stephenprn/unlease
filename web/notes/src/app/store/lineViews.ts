/**
 * How this browser lays each collection's page out (`notes/services/lineView`: its order and its
 * filter), kept per collection in localStorage beside Carnet's prefs and never synced: another
 * device keeps its own. Only the collections set apart from the default are kept. Every access is
 * guarded: blocked storage only means the choice holds for this visit.
 */
import { create } from 'zustand';

import { DEFAULT_LINE_VIEW, readLineViews, withLineView, type LineView } from '@unlease/notes/services/lineView';

import { getStorageName } from '@shared/app/env';

type Views = Readonly<Record<string, LineView>>;

export const useLineViewsStore = create<{ readonly views: Views }>(() => ({ views: {} }));

const storageKey = (): string => `${getStorageName()}.notes.lineViews`;

export function loadLineViews(): void {
  let stored: unknown = {};
  try {
    stored = JSON.parse(localStorage.getItem(storageKey()) ?? '{}');
  } catch {
    // Unreadable or blocked: every collection in its own order.
  }
  useLineViewsStore.setState({ views: readLineViews(stored) }, true);
}

export function setLineView(id: string, view: LineView): void {
  const views = withLineView(useLineViewsStore.getState().views, id, view);
  useLineViewsStore.setState({ views }, true);
  try {
    localStorage.setItem(storageKey(), JSON.stringify(views));
  } catch {
    // Blocked storage: the choice holds for this visit only.
  }
}

/** The collection's view on this browser: its own order and every link until changed. */
export const useLineView = (id: string): LineView => useLineViewsStore(s => s.views[id] ?? DEFAULT_LINE_VIEW);

/** Test seam, and the app's reset (as its prefs'). */
export function resetLineViews(): void {
  useLineViewsStore.setState({ views: {} }, true);
}
