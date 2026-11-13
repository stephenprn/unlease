/**
 * The pages as the tree and the editor read them: the sub-pages of a page (or the top-level
 * ones), the bin, when a page last changed, and what a mention, a bookmark or an embed is called.
 * Lists are read as joined ids, so a component re-renders when its list changes, not on every
 * keystroke elsewhere.
 */
import { useMemo } from 'react';

import { t } from '@unlease/core/i18n';
import { UNTITLED_PAGE, type BlockTarget } from '@unlease/pages/models/blocks';
import { shownTitle } from '@unlease/notes/models/entities';
import { isInBin, ROOT, subPages } from '@unlease/pages/services/blocks';
import { pageEditedAt, recentPages } from '@unlease/pages/services/recentPages';
import { slugTitle, prettyUrl } from '@unlease/core/services/url';
import { bodyText } from '@unlease/notes/services/noteBody';
import { resolveContact } from '@unlease/contacts/services/duplicates';
import { contactName } from '@unlease/contacts/services/names';

import { pagesLibrary, useBlocksStore, usePagesLibrary, type BlocksState, type PagesLibrary } from '../store/blocks';

const split = (joined: string): string[] => (joined ? joined.split(',') : []);

/** The pages a page holds in its content (the top-level pages for null), out of the bin. */
export function childPagesOf(s: BlocksState, pageId: string | null): string[] {
  const ids = pageId === null ? (s.blocksByParent[ROOT] ?? []).filter(id => s.blocks[id]?.kind === 'page') : subPages(s.blocks, s.blocksByParent, pageId);
  return ids.filter(id => s.blocks[id]?.trashedAt === null);
}

export function useChildPages(pageId: string | null): string[] {
  const joined = useBlocksStore(s => childPagesOf(s, pageId).join(','));
  return useMemo(() => split(joined), [joined]);
}

/** When a page last changed: its title, its icon or a block of its content (a sub-page's content counts for the sub-page). */
export function pageEdited(s: BlocksState, pageId: string): number {
  return pageEditedAt(s.blocks, s.blocksByParent, pageId);
}

/** Every page out of the bin, at any depth. */
export function livePageIds(s: BlocksState): string[] {
  return Object.values(s.blocks)
    .filter(block => block.kind === 'page' && block.deletedAt === null && !isInBin(s.blocks, block.id))
    .map(block => block.id);
}

/** The pages changed last, at any depth, the latest first (« Récentes », on the home and in « Déplacer vers »). */
export function useRecentPages(count: number): string[] {
  const joined = useBlocksStore(s => recentPages(s.blocks, s.blocksByParent, count).join(','));
  return useMemo(() => split(joined), [joined]);
}

/** The pages in the bin, the last thrown first. */
export function useTrashedPages(): string[] {
  const joined = useBlocksStore(s =>
    Object.values(s.blocks)
      .filter(block => block.kind === 'page' && block.deletedAt === null && block.trashedAt !== null)
      .sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0))
      .map(block => block.id)
      .join(','),
  );
  return useMemo(() => split(joined), [joined]);
}

/** A note's, a collection's, a link's or a page's name as a mention shows it; null when it is gone. */
export function targetTitle(s: Pick<PagesLibrary, 'notes' | 'links' | 'blocks' | 'contacts'> & Partial<Pick<PagesLibrary, 'events'>>, target: BlockTarget): string | null {
  switch (target.type) {
    case 'note': {
      const note = s.notes[target.id];
      if (!note || note.deletedAt !== null) return null;
      return shownTitle(note).trim() || bodyText(note).trim().split('\n')[0]?.slice(0, 80) || (note.kind === 'drawing' ? t('Drawing') : t('Untitled note'));
    }
    case 'link': {
      const link = s.links[target.id];
      if (!link || link.deletedAt !== null) return null;
      return link.title || slugTitle(link.url) || prettyUrl(link.url);
    }
    case 'page': {
      const page = s.blocks[target.id];
      if (!page || page.deletedAt !== null || page.kind !== 'page') return null;
      return page.text.trim() || t(UNTITLED_PAGE);
    }
    case 'contact': {
      // Named while it is in Contacts' bin too, as a note in Carnet's is: only a contact deleted for good is gone; one merged names the one kept.
      const contact = resolveContact(s.contacts, target.id);
      return contact ? contactName(contact) : null;
    }
    case 'event': {
      // Named while it is in Agenda's bin too: only an event deleted for good is gone.
      const event = s.events?.[target.id];
      return event && event.deletedAt === null ? event.title.trim() || t('Untitled') : null;
    }
    default:
      // A type a newer client added (another app's): nothing here to name it with.
      return null;
  }
}

export function useTargetTitle(target: BlockTarget): string | null {
  return usePagesLibrary(s => targetTitle(s, target));
}

/** For text made from blocks (a copy, a code block): a mention as its name, « (supprimé) » once gone. */
export function mentionLabel(target: BlockTarget): string {
  return targetTitle(pagesLibrary(), target) ?? t('(deleted)');
}
