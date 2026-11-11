/**
 * A vertical scroller's edges where content slides under something still on screen (a head, a foot,
 * a bar), named at each scroller (`top`, `bottom`): an edge that is the screen's own (the foot of a
 * page, of the navigation, of a sheet without actions), its own card's (a menu, a popover) or a
 * search field's over its list stays a plain cut. An edge it names dissolves over `--edge-fade`
 * (24px) on an eased curve, no blur, as strongly as content lies beyond it (full once 24px have gone
 * under): crisp at the top of a list, crisp at both ends with nothing to scroll. The scroller gets
 * `data-scroll-edges` (base.css masks it) and its strengths, 0 to 1 (`--edge-above-k`,
 * `--edge-below-k`). Measured on scroll and on any change of size, a frame at a time, written only
 * when a value changes: no React state, no render per scroll.
 *
 * The window's own scroll is `usePageEdges` (`--page-above-k`, `--page-below-k` on `<html>`), read by
 * the header and the form foots the page slides under.
 */
import { useCallback, useEffect, type RefCallback, type RefObject } from 'react';

/** How far an edge dissolves, in px: base.css's `--edge-fade`. */
export const EDGE_FADE = 24;

export interface ScrollEdgesOptions {
  /** Something stays over its top that content slides under (a head, a bar). */
  readonly top?: boolean;
  /** Something stays under its foot that content slides over (a dialog's actions, a bar, a composer). */
  readonly bottom?: boolean;
}

/** How strongly an edge with `hidden` px beyond it dissolves: 0 to 1, in thousandths. */
function strength(hidden: number): number {
  return Math.round((Math.min(EDGE_FADE, Math.max(0, hidden)) / EDGE_FADE) * 1000) / 1000;
}

/** Where the caret's line lies on screen, in a field or an editable inside `within`, or null. */
export function caretLine(within: Element): { readonly top: number; readonly bottom: number } | null {
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement) return within.contains(active) ? fieldCaret(active) : null;
  if (active instanceof HTMLInputElement) {
    if (!within.contains(active)) return null;
    const box = active.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom };
  }
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const end = range.endContainer;
  const host = end instanceof Element ? end : end.parentElement;
  if (!host || !within.contains(host) || !host.closest('[contenteditable]:not([contenteditable="false"])')) return null;
  const caret = range.cloneRange();
  caret.collapse(false);
  // A document without layout (a test's) has no rectangles for a range.
  if (typeof caret.getClientRects !== 'function') return null;
  const rects = caret.getClientRects();
  const rect = rects.length > 0 ? rects[rects.length - 1] : null;
  if (rect && rect.height > 0) return { top: rect.top, bottom: rect.bottom };
  // An empty line (a block holding a <br>): the block the caret stands in.
  const child = end instanceof Element ? (end.childNodes[range.endOffset] ?? end.childNodes[range.endOffset - 1] ?? end) : end.parentElement;
  const block = child instanceof Element ? child : (child?.parentElement ?? host);
  const box = block.getBoundingClientRect();
  const line = parseFloat(getComputedStyle(block).lineHeight);
  return { top: box.top, bottom: Number.isFinite(line) ? Math.min(box.bottom, box.top + line) : box.bottom };
}

/** A textarea's caret line: the text before the caret laid out in a hidden twin of it. */
function fieldCaret(field: HTMLTextAreaElement): { readonly top: number; readonly bottom: number } {
  const style = getComputedStyle(field);
  const box = field.getBoundingClientRect();
  const twin = document.createElement('div');
  for (const key of ['font', 'letterSpacing', 'wordSpacing', 'textTransform', 'textIndent', 'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'boxSizing'] as const) {
    twin.style[key] = style[key];
  }
  Object.assign(twin.style, { position: 'absolute', top: '0', left: '-9999px', visibility: 'hidden', width: `${box.width}px`, whiteSpace: 'pre-wrap', overflowWrap: 'break-word', borderStyle: 'solid' });
  twin.textContent = field.value.slice(0, field.selectionEnd ?? field.value.length);
  const mark = document.createElement('span');
  mark.textContent = '\u200b';
  twin.append(mark);
  document.body.append(twin);
  const top = box.top + parseFloat(style.borderTopWidth) + mark.offsetTop - field.scrollTop;
  const height = mark.offsetHeight;
  twin.remove();
  return { top, bottom: top + height };
}

/**
 * How far to scroll so the caret's line stands clear of the fading edges between `top` and `bottom`
 * (screen px; null: no such edge): positive scrolls down. 0 when it is clear, or out of `view` (the
 * person scrolled away from it); a caret hidden behind what stays over the view (a sticky foot) is
 * in view, and brought out.
 */
function caretShift(caret: { readonly top: number; readonly bottom: number }, top: number | null, bottom: number | null, view: { readonly top: number; readonly bottom: number }): number {
  if (caret.bottom <= view.top || caret.top >= view.bottom) return 0;
  if (bottom !== null && caret.bottom > bottom - EDGE_FADE) return caret.bottom - (bottom - EDGE_FADE);
  if (top !== null && caret.top < top + EDGE_FADE) return caret.top - (top + EDGE_FADE);
  return 0;
}

/** Starts watching `node`'s edges; the returned function stops it and takes everything it wrote away. */
export function watchScrollEdges(node: HTMLElement, options: ScrollEdgesOptions = {}): () => void {
  const softTop = options.top ?? false;
  const softBottom = options.bottom ?? false;
  let above = -1;
  let below = -1;
  let frame = 0;
  const write = (): void => {
    frame = 0;
    const top = node.scrollTop;
    const nextAbove = softTop ? strength(top) : 0;
    const nextBelow = softBottom ? strength(node.scrollHeight - node.clientHeight - top) : 0;
    if (nextAbove !== above) {
      above = nextAbove;
      node.style.setProperty('--edge-above-k', String(above));
    }
    if (nextBelow !== below) {
      below = nextBelow;
      node.style.setProperty('--edge-below-k', String(below));
    }
  };
  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(write);
  };
  node.setAttribute('data-scroll-edges', '');
  // What it brings into view (the caret as one types, a field taking focus) stops clear of a fading edge.
  if (softTop) node.style.setProperty('scroll-padding-top', 'var(--edge-fade)');
  if (softBottom) node.style.setProperty('scroll-padding-bottom', 'var(--edge-fade)');
  // At once: the first paint already shows the right edges.
  write();
  node.addEventListener('scroll', schedule, { passive: true });
  // The line being typed on never lies in a fade: as the caret moves, the scroller keeps it clear of a
  // fading edge (the browser's own caret scrolling ignores scroll-padding).
  let caretFrame = 0;
  const keepCaret = (): void => {
    caretFrame = 0;
    const caret = caretLine(node);
    if (!caret) return;
    const box = node.getBoundingClientRect();
    const shift = caretShift(caret, softTop ? box.top : null, softBottom ? box.bottom : null, box);
    if (Math.abs(shift) >= 1) node.scrollTop += shift;
  };
  const caretMoved = (): void => {
    if ((softTop || softBottom) && !caretFrame) caretFrame = requestAnimationFrame(keepCaret);
  };
  document.addEventListener('selectionchange', caretMoved);
  // Its own size, and what it holds: a field typed into, a list that arrives, an image that loads.
  const sizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  sizes?.observe(node);
  for (const child of node.children) sizes?.observe(child);
  const children =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(records => {
          for (const record of records) {
            for (const added of record.addedNodes) if (added instanceof Element) sizes?.observe(added);
            for (const removed of record.removedNodes) if (removed instanceof Element) sizes?.unobserve(removed);
          }
          schedule();
        });
  children?.observe(node, { childList: true });
  return () => {
    if (frame) cancelAnimationFrame(frame);
    if (caretFrame) cancelAnimationFrame(caretFrame);
    node.removeEventListener('scroll', schedule);
    document.removeEventListener('selectionchange', caretMoved);
    sizes?.disconnect();
    children?.disconnect();
    node.removeAttribute('data-scroll-edges');
    node.style.removeProperty('--edge-above-k');
    node.style.removeProperty('--edge-below-k');
    node.style.removeProperty('scroll-padding-top');
    node.style.removeProperty('scroll-padding-bottom');
  };
}

/** The scroller's ref: `<div ref={useScrollEdges()} …>`. */
export function useScrollEdges<T extends HTMLElement = HTMLDivElement>(options: ScrollEdgesOptions = {}): RefCallback<T> {
  const { top, bottom } = options;
  return useCallback((node: T | null) => (node ? watchScrollEdges(node, { top, bottom }) : undefined), [top, bottom]);
}

/**
 * The same for a scroller another hook already holds in a ref (to scroll it into place): its ref
 * keeps the element, this watches it. Pass what mounts or replaces the element as `deps`.
 */
export function useScrollEdgesOn(ref: RefObject<HTMLElement | null>, deps: readonly unknown[] = [], options: ScrollEdgesOptions = {}): void {
  const { top, bottom } = options;
  useEffect(() => {
    const node = ref.current;
    return node ? watchScrollEdges(node, { top, bottom }) : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the element is the ref's; `deps` say when it changes
  }, [ref, top, bottom, ...deps]);
}

/**
 * A foot pinned to the bottom of what scrolls (`position: sticky`, a form's actions): how much of
 * its container still lies below it, as `--edge-below-k` on the foot itself, 0 once it rests at the
 * container's end. Any scroll moves it (the window's or a scroller's), any change of size too.
 */
export function useStuckFootEdge<T extends HTMLElement = HTMLDivElement>(): RefCallback<T> {
  return useCallback((foot: T | null) => {
    const container = foot?.parentElement;
    if (!foot || !container) return undefined;
    let below = -1;
    let frame = 0;
    const write = (): void => {
      frame = 0;
      const style = getComputedStyle(container);
      const end = container.getBoundingClientRect().bottom - parseFloat(style.paddingBottom) - parseFloat(style.borderBottomWidth);
      const next = strength(end - foot.getBoundingClientRect().bottom);
      if (next === below) return;
      below = next;
      foot.style.setProperty('--edge-below-k', String(below));
    };
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(write);
    };
    foot.setAttribute('data-stuck-foot', '');
    write();
    // Scroll events do not bubble: caught on their way down, whichever scroller moved.
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    const sizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    sizes?.observe(container);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      sizes?.disconnect();
      foot.removeAttribute('data-stuck-foot');
      foot.style.removeProperty('--edge-below-k');
    };
  }, []);
}

/**
 * The window's own scroll, for what stays while the page slides under it (the header, the phone's
 * top bar): `--page-above-k` and `--page-below-k` on `<html>`, 0 to 1, as a scroller's strengths.
 * Mounted once, by the shell.
 */
export function usePageEdges(): void {
  useEffect(() => {
    const root = document.documentElement;
    let above = -1;
    let below = -1;
    let frame = 0;
    const write = (): void => {
      frame = 0;
      const top = Math.max(0, window.scrollY);
      const nextAbove = strength(top);
      const nextBelow = strength(root.scrollHeight - root.clientHeight - top);
      if (nextAbove !== above) {
        above = nextAbove;
        root.style.setProperty('--page-above-k', String(above));
      }
      if (nextBelow !== below) {
        below = nextBelow;
        root.style.setProperty('--page-below-k', String(below));
      }
    };
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(write);
    };
    write();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // The line being typed on in the page itself stays clear of the header's fade and of a form foot's.
    let caretFrame = 0;
    const keepCaret = (): void => {
      caretFrame = 0;
      const caret = caretLine(document.body);
      if (!caret) return;
      // A caret in a scroller of its own is that scroller's to keep (`watchScrollEdges`).
      const at = document.activeElement?.closest('[data-scroll-edges], [role="dialog"]');
      if (at && at !== document.body) return;
      const header = parseFloat(getComputedStyle(root).getPropertyValue('--header-height')) || 0;
      const foot = document.querySelector('[data-stuck-foot]')?.getBoundingClientRect().top ?? null;
      const shift = caretShift(caret, header, foot !== null && foot < window.innerHeight ? foot : null, { top: 0, bottom: window.innerHeight });
      if (Math.abs(shift) >= 1) window.scrollBy({ top: shift, behavior: 'instant' });
    };
    const caretMoved = (): void => {
      if (!caretFrame) caretFrame = requestAnimationFrame(keepCaret);
    };
    document.addEventListener('selectionchange', caretMoved);
    // The page grows and shrinks under the same window (a list arrives, a page is left).
    const sizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    sizes?.observe(document.body);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (caretFrame) cancelAnimationFrame(caretFrame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.removeEventListener('selectionchange', caretMoved);
      sizes?.disconnect();
      root.style.removeProperty('--page-above-k');
      root.style.removeProperty('--page-below-k');
    };
  }, []);
}
