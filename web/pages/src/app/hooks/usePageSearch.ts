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
import { useLockOpen } from '@shared/app/lock';
import { useEventsStore } from '@notes/app/events/store';
import { useLibraryStore } from '@notes/app/store/library';
import { useBlocksStore, type BlocksState, type PagesLibrary } from '../store/blocks';
import { targetTitle } from './usePages';

let cached: { readonly blocks: BlocksState['blocks']; readonly notes: PagesLibrary['notes']; readonly links: PagesLibrary['links']; readonly contacts: PagesLibrary['contacts']; readonly events: PagesLibrary['events']; readonly lockOpen: boolean; readonly documents: PageSearchDocument[] } | null = null;

/** Built again only when a block, or a note, a link, a contact or an event a mention names, changed, or the lock opened or shut (a protected page's words count only while it is open). */
function pageDocuments(state: PagesLibrary, lockOpen: boolean): PageSearchDocument[] {
  if (cached && cached.blocks === state.blocks && cached.notes === state.notes && cached.links === state.links && cached.contacts === state.contacts && cached.events === state.events && cached.lockOpen === lockOpen) return cached.documents;
  const documents = buildPageDocuments(state.blocks, state.blocksByParent, target => targetTitle(state, target) ?? '', lockOpen);
  cached = { blocks: state.blocks, notes: state.notes, links: state.links, contacts: state.contacts, events: state.events, lockOpen, documents };
  return documents;
}

/** Pages matching `query`, best first, each with the block that matched and a few words around it; a protected page by its title alone while the lock is shut. */
export function searchPages(state: PagesLibrary, query: string, lockOpen: boolean): PageSearchHit[] {
  if (!query.trim()) return [];
  return searchPageDocuments(pageDocuments(state, lockOpen), query);
}

export function usePageSearch(query: string): readonly PageSearchHit[] {
  // The whole library: any change re-runs the search (documents are rebuilt once per revision).
  const pages = useBlocksStore();
  const notes = useLibraryStore();
  const contacts = useContactsStore(s => s.contacts);
  const events = useEventsStore(s => s.events);
  const lockOpen = useLockOpen();
  return useMemo(() => searchPages({ ...notes, ...pages, contacts, events }, query, lockOpen), [notes, pages, contacts, events, query, lockOpen]);
}

/** Where a page sits: the titles of the pages above it, joined as a breadcrumb ("Voyages › Lisbonne"), or "" at the top. */
export function pagePath(state: Pick<BlocksState, 'blocks'>, id: string): string {
  return ancestorPages(state.blocks, id)
    .map(page => page.text.trim() || t(UNTITLED_PAGE))
    .join(' › ');
}
