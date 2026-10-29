/**
 * A block of the page on screen brought into view and lit a moment with the selection's wash: a
 * search's result, a source Claude cited, a heading picked in a table of contents. The toggles it
 * sits in open first, so it is drawn.
 */
import { useLibraryStore } from '../../../app/store/library';
import { setToggleOpen } from '../../../app/store/pagesUi';
import { editorRoot } from './editorStore';

/** How long the block wears the wash. */
const FLASH_MS = 1200;
/** Its fade (`.block[data-flash='out']`), with room to spare. */
const FADE_MS = 400;

/** The element a block is drawn as: its own, or for a table's row, its table's. */
function drawnBlock(id: string): HTMLElement | null {
  const block = useLibraryStore.getState().blocks[id];
  const shown = block?.kind === 'row' && block.parentId ? block.parentId : id;
  return [...(editorRoot()?.querySelectorAll<HTMLElement>('[data-select-block]') ?? [])].find(element => element.dataset.selectBlock === shown) ?? null;
}

/** The toggles a block sits in, opened, so it is drawn. */
function openTogglesAbove(id: string, page: string): void {
  const { blocks } = useLibraryStore.getState();
  let parent = blocks[id]?.parentId ?? null;
  for (let depth = 0; parent !== null && parent !== page && depth < 200; depth += 1) {
    const block = blocks[parent];
    if (!block) return;
    if (block.kind === 'toggle') setToggleOpen(block.id, true);
    parent = block.parentId;
  }
}

/** A wash still on: shown again, it starts over rather than fading early. */
const lit = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

function flash(element: HTMLElement): void {
  const running = lit.get(element);
  if (running) clearTimeout(running);
  element.dataset.flash = '';
  lit.set(
    element,
    setTimeout(() => {
      element.dataset.flash = 'out';
      lit.set(
        element,
        setTimeout(() => {
          delete element.dataset.flash;
          lit.delete(element);
        }, FADE_MS),
      );
    }, FLASH_MS),
  );
}

/**
 * Brings a block into view (`at`: the window's middle, or its top under the header for a heading)
 * and lights it; `done` once it is found, or given up on when it is not drawn within a second.
 * Returns a way to stop looking.
 */
export function showBlock(page: string, id: string, { at = 'center', done }: { readonly at?: 'center' | 'start'; readonly done?: () => void } = {}): () => void {
  openTogglesAbove(id, page);
  let frame = 0;
  let tries = 0;
  // Drawn a frame or so later (a toggle just opened, a page still arriving).
  const find = (): void => {
    const element = drawnBlock(id);
    if (!element) {
      tries += 1;
      if (tries < 60) frame = requestAnimationFrame(find);
      else done?.();
      return;
    }
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    element.scrollIntoView({ block: at, behavior: still ? 'instant' : 'smooth' });
    flash(element);
    done?.();
  };
  frame = requestAnimationFrame(find);
  return () => cancelAnimationFrame(frame);
}
