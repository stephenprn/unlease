/**
 * How this phone shows the pages, kept with its preferences and never synced (each device opens its
 * own branches, as in Notion): the tree's open branches, the toggles open in pages, the page last
 * read, and a page just made, whose title takes the caret when it opens.
 */
import { create } from 'zustand';

import { readPreferences, writePreference } from '@data/repositories/stateRepository';

export interface PagesUiState {
  /** Pages whose sub-pages the drawer's tree shows. */
  readonly expanded: ReadonlySet<string>;
  /** Toggle blocks shown open. */
  readonly openToggles: ReadonlySet<string>;
  readonly lastPage: string | null;
  /** A page just made, whose title takes the caret when it opens (not kept). */
  readonly titleFocus: string | null;
}

const MAX_KEPT = 2000;
const KEY = 'pagesUi';

export const usePagesUiStore = create<PagesUiState>(() => ({ expanded: new Set(), openToggles: new Set(), lastPage: null, titleFocus: null }));

export function loadPagesUi(): void {
  const stored = readPreferences()[KEY] as { expanded?: unknown; openToggles?: unknown; lastPage?: unknown } | undefined;
  const ids = (value: unknown): Set<string> => new Set(Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []);
  usePagesUiStore.setState({ expanded: ids(stored?.expanded), openToggles: ids(stored?.openToggles), lastPage: typeof stored?.lastPage === 'string' ? stored.lastPage : null, titleFocus: null });
}

function save(): void {
  const { expanded, openToggles, lastPage } = usePagesUiStore.getState();
  writePreference(KEY, { expanded: [...expanded].slice(-MAX_KEPT), openToggles: [...openToggles].slice(-MAX_KEPT), lastPage });
}

function toggled(set: ReadonlySet<string>, id: string, open: boolean): Set<string> {
  const next = new Set(set);
  if (open) next.add(id);
  else next.delete(id);
  return next;
}

export function setExpanded(id: string, open: boolean): void {
  if (usePagesUiStore.getState().expanded.has(id) === open) return;
  usePagesUiStore.setState(state => ({ expanded: toggled(state.expanded, id, open) }));
  save();
}

/** Opens every branch down to these pages, so the one on screen shows in the tree. */
export function expandAll(ids: readonly string[]): void {
  const { expanded } = usePagesUiStore.getState();
  if (ids.every(id => expanded.has(id))) return;
  usePagesUiStore.setState({ expanded: new Set([...expanded, ...ids]) });
  save();
}

export function setToggleOpen(id: string, open: boolean): void {
  if (usePagesUiStore.getState().openToggles.has(id) === open) return;
  usePagesUiStore.setState(state => ({ openToggles: toggled(state.openToggles, id, open) }));
  save();
}

export function rememberPage(id: string | null): void {
  if (usePagesUiStore.getState().lastPage === id) return;
  usePagesUiStore.setState({ lastPage: id });
  save();
}

export function requestTitleFocus(id: string): void {
  usePagesUiStore.setState({ titleFocus: id });
}

/** True once for the page whose title should take the caret. */
export function takeTitleFocus(id: string): boolean {
  if (usePagesUiStore.getState().titleFocus !== id) return false;
  usePagesUiStore.setState({ titleFocus: null });
  return true;
}
