/**
 * Pages found by the search box, as notes are: their documents built from the library's blocks once
 * per revision (`notes/services/pageSearch`), so typing only re-ranks.
 */
import { useMemo } from 'react';

import { t } from '@unlease/core/i18n';
import { UNTITLED_PAGE } from '@unlease/pages/models/blocks';
import { ancestorPages } from '@unlease/pages/services/blocks';
import { buildPageDocuments, searchPageDocuments, type PageSearchDocument, type PageSearchHit } from '@unlease/pages/services/pageSearch';

import { useContactsStore } from '@contacts/app/store/library';
import { useEventsStore } from '@notes/app/events/store';
import { useLibraryStore } from '@notes/app/store/library';
import { useBlocksStore, type BlocksState, type PagesLibrary } from '../store/blocks';
import { targetTitle } from './usePages';

let cached: { readonly blocks: BlocksState['blocks']; readonly notes: PagesLibrary['notes']; readonly links: PagesLibrary['links']; readonly contacts: PagesLibrary['contacts']; readonly events: PagesLibrary['events']; readonly documents: PageSearchDocument[] } | null = null;

/** Built again only when a block, or a note, a link, a contact or an event a mention names, changed. */
function pageDocuments(state: PagesLibrary): PageSearchDocument[] {
  if (cached && cached.blocks === state.blocks && cached.notes === state.notes && cached.links === state.links && cached.contacts === state.contacts && cached.events === state.events) return cached.documents;
  const documents = buildPageDocuments(state.blocks, state.blocksByParent, target => targetTitle(state, target) ?? '');
  cached = { blocks: state.blocks, notes: state.notes, links: state.links, contacts: state.contacts, events: state.events, documents };
  return documents;
}

/** Pages matching `query`, best first, each with the block that matched and a few words around it. */
export function searchPages(state: PagesLibrary, query: string): PageSearchHit[] {
  if (!query.trim()) return [];
  return searchPageDocuments(pageDocuments(state), query);
}

export function usePageSearch(query: string): readonly PageSearchHit[] {
  // The whole library: any change re-runs the search (documents are rebuilt once per revision).
  const pages = useBlocksStore();
  const notes = useLibraryStore();
  const contacts = useContactsStore(s => s.contacts);
  const events = useEventsStore(s => s.events);
  return useMemo(() => searchPages({ ...notes, ...pages, contacts, events }, query), [notes, pages, contacts, events, query]);
}

/** Where a page sits: the titles of the pages above it, joined as a breadcrumb ("Voyages › Lisbonne"), or "" at the top. */
export function pagePath(state: Pick<BlocksState, 'blocks'>, id: string): string {
  return ancestorPages(state.blocks, id)
    .map(page => page.text.trim() || t(UNTITLED_PAGE))
    .join(' › ');
}
