/**
 * The pages as the tree and the editor read them: the sub-pages of a page (or the top-level
 * ones), the bin, when a page last changed, and what a mention, a bookmark or an embed is called.
 * Lists are read as joined ids, so a component re-renders when its list changes, not on every
 * keystroke elsewhere.
 */
import { useMemo } from 'react';

import { t } from '@unlease/core/i18n';
import { UNTITLED_PAGE, type BlockTarget } from '@unlease/notes/models/blocks';
import { shownTitle } from '@unlease/notes/models/entities';
import { isInBin, ROOT, subPages } from '@unlease/notes/services/blocks';
import { slugTitle, prettyUrl } from '@unlease/core/services/url';
import { bodyText } from '@unlease/notes/services/noteBody';

import { useLibraryStore, type LibraryState } from '../store/library';

const split = (joined: string): string[] => (joined ? joined.split(',') : []);

/** The pages a page holds in its content (the top-level pages for null), out of the bin. */
export function childPagesOf(s: LibraryState, pageId: string | null): string[] {
  const ids = pageId === null ? (s.blocksByParent[ROOT] ?? []).filter(id => s.blocks[id]?.kind === 'page') : subPages(s.blocks, s.blocksByParent, pageId);
  return ids.filter(id => s.blocks[id]?.trashedAt === null);
}

export function useChildPages(pageId: string | null): string[] {
  const joined = useLibraryStore(s => childPagesOf(s, pageId).join(','));
  return useMemo(() => split(joined), [joined]);
}

/** When a page last changed: its title, its icon or a block of its content (a sub-page's content counts for the sub-page). */
export function pageEdited(s: LibraryState, pageId: string): number {
  let latest = s.blocks[pageId]?.editedAt ?? 0;
  const walk = (parent: string, depth: number): void => {
    if (depth > 200) return;
    for (const id of s.blocksByParent[parent] ?? []) {
      const block = s.blocks[id];
      if (!block || block.kind === 'page') continue;
      latest = Math.max(latest, block.editedAt);
      walk(id, depth + 1);
    }
  };
  walk(pageId, 0);
  return latest;
}

/** Every page out of the bin, at any depth. */
export function livePageIds(s: LibraryState): string[] {
  return Object.values(s.blocks)
    .filter(block => block.kind === 'page' && block.deletedAt === null && !isInBin(s.blocks, block.id))
    .map(block => block.id);
}

/** The pages changed last, at any depth, the latest first. */
export function useRecentPages(count: number): string[] {
  const joined = useLibraryStore(s =>
    livePageIds(s)
      .map(id => ({ id, edited: pageEdited(s, id) }))
      .sort((a, b) => b.edited - a.edited)
      .slice(0, count)
      .map(entry => entry.id)
      .join(','),
  );
  return useMemo(() => split(joined), [joined]);
}

/** The pages in the bin, the last thrown first. */
export function useTrashedPages(): string[] {
  const joined = useLibraryStore(s =>
    Object.values(s.blocks)
      .filter(block => block.kind === 'page' && block.deletedAt === null && block.trashedAt !== null)
      .sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0))
      .map(block => block.id)
      .join(','),
  );
  return useMemo(() => split(joined), [joined]);
}

/** A note's, a collection's, a link's or a page's name as a mention shows it; null when it is gone. */
export function targetTitle(s: LibraryState, target: BlockTarget): string | null {
  switch (target.type) {
    case 'note': {
      const note = s.notes[target.id];
      if (!note || note.deletedAt !== null) return null;
      return shownTitle(note).trim() || bodyText(note).trim().split('\n')[0]?.slice(0, 80) || (note.kind === 'drawing' ? t('Dessin') : t('Note sans titre'));
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
    default:
      // A type a newer client added (another app's): nothing here to name it with.
      return null;
  }
}

export function useTargetTitle(target: BlockTarget): string | null {
  return useLibraryStore(s => targetTitle(s, target));
}

/** For text made from blocks (a copy, a code block): a mention as its name, « (supprimé) » once gone. */
export function mentionLabel(target: BlockTarget): string {
  return targetTitle(useLibraryStore.getState(), target) ?? t('(supprimé)');
}
