/**
 * Pages found by the search box, as notes are: their documents built from the library's blocks once
 * per revision (`notes/services/pageSearch`), so typing only re-ranks.
 */
import { useMemo } from 'react';

import { t } from '@unlease/core/i18n';
import { UNTITLED_PAGE } from '@unlease/notes/models/blocks';
import { ancestorPages } from '@unlease/notes/services/blocks';
import { buildPageDocuments, searchPageDocuments, type PageSearchDocument, type PageSearchHit } from '@unlease/notes/services/pageSearch';

import { useLibraryStore, type LibraryState } from '../store/library';
import { targetTitle } from './usePages';

let cachedRevision = -1;
let cachedDocuments: PageSearchDocument[] = [];

function pageDocuments(state: LibraryState): PageSearchDocument[] {
  if (state.revision === cachedRevision) return cachedDocuments;
  cachedDocuments = buildPageDocuments(state.blocks, state.blocksByParent, target => targetTitle(state, target) ?? '');
  cachedRevision = state.revision;
  return cachedDocuments;
}

/** Pages matching `query`, best first, each with the block that matched and a few words around it. */
export function searchPages(state: LibraryState, query: string): PageSearchHit[] {
  if (!query.trim()) return [];
  return searchPageDocuments(pageDocuments(state), query);
}

export function usePageSearch(query: string): readonly PageSearchHit[] {
  // The whole library: any change re-runs the search (documents are rebuilt once per revision).
  const library = useLibraryStore();
  return useMemo(() => searchPages(library, query), [library, query]);
}

/** Where a page sits: the titles of the pages above it, joined as a breadcrumb ("Voyages › Lisbonne"), or "" at the top. */
export function pagePath(state: LibraryState, id: string): string {
  return ancestorPages(state.blocks, id)
    .map(page => page.text.trim() || t(UNTITLED_PAGE))
    .join(' › ');
}
