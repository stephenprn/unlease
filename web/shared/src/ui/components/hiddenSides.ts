import { useEffect, type RefObject } from 'react';

/** Marks the sides a sideways-scrolling table hides columns behind, which fade there. */
export function useHiddenSides(wrap: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const node = wrap.current;
    if (!node) return;
    const update = (): void => {
      const hidden = node.scrollWidth - node.clientWidth;
      node.toggleAttribute('data-more-left', hidden > 1 && node.scrollLeft > 1);
      node.toggleAttribute('data-more-right', hidden > 1 && node.scrollLeft < hidden - 1);
    };
    update();
    node.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(node);
    if (node.firstElementChild) observer?.observe(node.firstElementChild);
    return () => {
      node.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [wrap]);
}
