/**
 * Outlines for plain containers marked `data-outline="kind"` (a page's callouts, code, media,
 * bookmarks): one watcher clips each to its outline as it is sized (`--outline-clip`) and hands its
 * edge to CSS as a ring along it (`--outline-ring`, an even-odd path one edge wide), which the
 * container's `::after` paints when it carries `data-edge`. A container that needs more (a lift, a
 * focus ring) uses `useOutline` instead.
 */
import { OUTLINES, type OutlineKind } from '@unlease/design/outline';

import { outlineD } from './components/Outline';

/** How wide an edge ring is. */
const EDGE = 1;

function kindOf(element: HTMLElement): OutlineKind | null {
  const kind = element.dataset.outline;
  return kind && kind in OUTLINES ? (kind as OutlineKind) : null;
}

function shape(element: HTMLElement, width: number, height: number): void {
  const kind = kindOf(element);
  if (!kind || width <= 0 || height <= 0) return;
  const outer = outlineD(kind, width, height);
  element.style.setProperty('--outline-clip', `path('${outer}')`);
  if (element.dataset.edge !== undefined) element.style.setProperty('--outline-ring', `path(evenodd, '${outer} ${outlineD(kind, width, height, EDGE)}')`);
}

/** Watches `root` for outlined containers, from now on: returns the way to stop. */
export function watchOutlines(root: HTMLElement): () => void {
  if (typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
  const sizes = new ResizeObserver(entries => {
    for (const entry of entries) {
      const box = entry.borderBoxSize?.[0];
      const element = entry.target as HTMLElement;
      shape(element, box ? box.inlineSize : element.offsetWidth, box ? box.blockSize : element.offsetHeight);
    }
  });
  const watched = new Set<Element>();
  const each = (node: Node, act: (element: HTMLElement) => void): void => {
    if (!(node instanceof HTMLElement)) return;
    if (node.dataset.outline !== undefined) act(node);
    for (const inner of node.querySelectorAll<HTMLElement>('[data-outline]')) act(inner);
  };
  const add = (element: HTMLElement): void => {
    if (watched.has(element)) return;
    watched.add(element);
    sizes.observe(element, { box: 'border-box' });
  };
  const remove = (element: HTMLElement): void => {
    if (!watched.delete(element)) return;
    sizes.unobserve(element);
  };
  const changes = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') {
        const element = record.target as HTMLElement;
        if (element.dataset.outline !== undefined) {
          // A new seed or kind: drawn afresh at its size.
          remove(element);
          add(element);
        } else remove(element);
        continue;
      }
      record.removedNodes.forEach(node => each(node, remove));
      record.addedNodes.forEach(node => each(node, add));
    }
  });
  changes.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-outline'] });
  each(root, add);
  return () => {
    changes.disconnect();
    sizes.disconnect();
    watched.clear();
  };
}
