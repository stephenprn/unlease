/**
 * What the header's search box holds: one search for the suite, whichever app is on screen. Its
 * results live on an app's home (Carnet's board, with Pages' results under its own; Pages' home), each
 * app adding its own (`AppModule.SearchResults`).
 */
import { create } from 'zustand';

interface SearchState {
  readonly query: string;
}

export const useSearchStore = create<SearchState>(() => ({ query: '' }));

export const selectQuery = (s: SearchState): string => s.query;

export function setQuery(query: string): void {
  if (useSearchStore.getState().query !== query) useSearchStore.setState({ query });
}

/** The words searched, re-rendering as they change. */
export const useQuery = (): string => useSearchStore(selectQuery);
