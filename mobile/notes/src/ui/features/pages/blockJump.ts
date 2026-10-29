/**
 * A page opened at one of its blocks (a source Claude cited): where each block is drawn, the toggles
 * above it opened so it is, and the block lit a moment once the page has scrolled to it. The web's
 * `#block-<id>` (`JumpToBlock`).
 */
import type { HostInstance } from 'react-native';
import { create } from 'zustand';

import { useLibraryStore } from '@app/store/libraryStore';
import { setToggleOpen } from '@app/store/pagesUi';

/** What a drawn block offers: where it is in what scrolls. */
interface Placed {
  measureLayout(relativeTo: HostInstance, onSuccess: (left: number, top: number, width: number, height: number) => void, onFail?: () => void): void;
}

const views = new Map<string, Placed>();

/** A block's drawn view, kept while it is on screen. */
export function placeBlock(id: string, view: Placed | null): void {
  if (view) views.set(id, view);
  else views.delete(id);
}

/** The block a jump lands on: a table's row is drawn as its table. */
export function drawnBlock(id: string): string {
  const block = useLibraryStore.getState().blocks[id];
  return block?.kind === 'row' && block.parentId ? block.parentId : id;
}

/** The toggles a block sits in, opened, so it is drawn. */
export function openTogglesAbove(id: string, page: string): void {
  const { blocks } = useLibraryStore.getState();
  let parent = blocks[id]?.parentId ?? null;
  for (let depth = 0; parent !== null && parent !== page && depth < 200; depth += 1) {
    const block = blocks[parent];
    if (!block) return;
    if (block.kind === 'toggle') setToggleOpen(block.id, true);
    parent = block.parentId;
  }
}

/** Where a block is drawn in a scroll view's content (`getInnerViewRef`): its top, or null while it is not drawn. */
export function blockTop(id: string, content: HostInstance): Promise<number | null> {
  const view = views.get(id);
  if (!view) return Promise.resolve(null);
  return new Promise(resolve =>
    view.measureLayout(
      content,
      (_left, top, _width, height) => resolve(height > 0 ? top : null),
      () => resolve(null),
    ),
  );
}

/** The block lit for a moment after a jump. */
export const useBlockFlash = create<{ readonly flash: string | null }>(() => ({ flash: null }));

const FLASH_MS = 1400;
let flashTimer: ReturnType<typeof setTimeout> | null = null;

export function flashBlock(id: string): void {
  if (flashTimer) clearTimeout(flashTimer);
  useBlockFlash.setState({ flash: id });
  flashTimer = setTimeout(() => {
    flashTimer = null;
    useBlockFlash.setState({ flash: null });
  }, FLASH_MS);
}
