/**
 * A scroller's edges, named at each scroller. Two kinds, never both at one edge:
 *
 * - **A bar's hairline** (`top`, `bottom`): where content slides under something that stays (a head,
 *   a bar, a dialog's actions, a field over its results), that thing meets it with a 1px line in the
 *   hairline ink across its whole width, drawn only once content has gone under it (a head) or while
 *   content runs on past it (a foot), eased in over the first `LINE_RISE` px: invisible at rest. The
 *   scroller draws it as its own border (`data-edge-top`, `data-edge-bottom`, base.css), or, named
 *   `'inside'`, leaves it to a head or a foot inside it (sticky) that reads the strength. No fade, no
 *   shadow, no blur under a bar.
 * - **The fade** (`fade`): where content runs on inside a bounded box with nothing at that edge (a
 *   strip that scrolls sideways, a list capped in a card, a menu or a popover), it dissolves over
 *   `--edge-fade` (24px) on an eased curve, no blur, as strongly as content lies beyond (full once
 *   24px have gone past): `'x'` its sides, `'y'` its top and foot, or one of them (`'top'`,
 *   `'bottom'`, `'left'`, `'right'`: a table whose first column stays has its hairline on the left).
 *   An edge with a hairline never fades; an edge that is the screen's own never fades.
 *
 * Its strengths, 0 to 1, are custom properties on the scroller (inherited by what is in it): a
 * hairline's `--edge-above-k`, `--edge-below-k`; a fade's `--fade-above-k`, `--fade-below-k`,
 * `--fade-left-k`, `--fade-right-k`. Measured on scroll and on any change of size, a frame at a time,
 * written only when a value changes: no React state, no render per scroll.
 *
 * The window's own scroll is `usePageEdges` (`--page-above-k`, `--page-below-k` on `<html>`), read by
 * the header, the top bar and the bottom bar; a form's sticky foot is `useStuckFootEdge`.
 */
import { useCallback, useEffect, type RefCallback, type RefObject } from 'react';

/** How far an edge fades, in px: base.css's `--edge-fade`. */
export const EDGE_FADE = 24;

/** Over how many px of scroll a bar's hairline comes in, eased. */
export const LINE_RISE = 8;

/** How far the caret's line stays clear of a bar's hairline, in px: base.css's `--edge-room`. */
export const EDGE_ROOM = 8;

/** Which edges fade: a sideways strip's sides, a capped list's top and foot, or one of them. */
export type EdgeFade = 'x' | 'y' | 'top' | 'bottom' | 'left' | 'right';

/** Where a bar's hairline is drawn: by the scroller at its own edge, or by a sticky head or foot inside it. */
export type EdgeLine = boolean | 'inside';

export interface ScrollEdgesOptions {
  /** Something stays over its top that content slides under (a head, a bar, a field over its results): its hairline. */
  readonly top?: EdgeLine;
  /** Something stays under its foot that content runs on past (actions, a bar, a composer): its hairline. */
  readonly bottom?: EdgeLine;
  /** Content runs on past an edge with nothing there, inside a bounded box: that edge fades. */
  readonly fade?: EdgeFade;
}

/** How strongly a hairline shows with `hidden` px gone under it: 0 to 1, eased, in thousandths. */
export function lineStrength(hidden: number): number {
  const at = Math.min(LINE_RISE, Math.max(0, hidden)) / LINE_RISE;
  return Math.round(at * at * (3 - 2 * at) * 1000) / 1000;
}

/** How strongly an edge with `hidden` px beyond it fades: 0 to 1, in thousandths. */
export function fadeStrength(hidden: number): number {
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
  mark.textContent = '​';
  twin.append(mark);
  document.body.append(twin);
  const top = box.top + parseFloat(style.borderTopWidth) + mark.offsetTop - field.scrollTop;
  const height = mark.offsetHeight;
  twin.remove();
  return { top, bottom: top + height };
}

/** An edge the caret keeps clear of: where it lies on screen, and how much room it asks (a hairline's, a fade's). */
interface CaretEdge {
  readonly at: number;
  readonly room: number;
}

/**
 * How far to scroll so the caret's line stands clear of the edges between `top` and `bottom` (null:
 * nothing there): positive scrolls down. 0 when it is clear, or out of `view` (the person scrolled
 * away from it); a caret hidden behind what stays over the view (a sticky foot) is in view, and
 * brought out.
 */
function caretShift(caret: { readonly top: number; readonly bottom: number }, top: CaretEdge | null, bottom: CaretEdge | null, view: { readonly top: number; readonly bottom: number }): number {
  if (caret.bottom <= view.top || caret.top >= view.bottom) return 0;
  if (bottom !== null && caret.bottom > bottom.at - bottom.room) return caret.bottom - (bottom.at - bottom.room);
  if (top !== null && caret.top < top.at + top.room) return caret.top - (top.at + top.room);
  return 0;
}

/** Which of a scroller's edges carry what, from its options. */
interface EdgePlan {
  readonly lineTop: boolean;
  readonly lineBottom: boolean;
  readonly fadeTop: boolean;
  readonly fadeBottom: boolean;
  readonly fadeLeft: boolean;
  readonly fadeRight: boolean;
}

function edgePlan({ top = false, bottom = false, fade }: ScrollEdgesOptions): EdgePlan {
  const lineTop = top !== false;
  const lineBottom = bottom !== false;
  return {
    lineTop,
    lineBottom,
    fadeTop: !lineTop && (fade === 'y' || fade === 'top'),
    fadeBottom: !lineBottom && (fade === 'y' || fade === 'bottom'),
    fadeLeft: fade === 'x' || fade === 'left',
    fadeRight: fade === 'x' || fade === 'right',
  };
}

/** Starts watching `node`'s edges; the returned function stops it and takes everything it wrote away. */
export function watchScrollEdges(node: HTMLElement, options: ScrollEdgesOptions = {}): () => void {
  const plan = edgePlan(options);
  const written = new Map<string, number>();
  const set = (name: string, value: number): void => {
    if (written.get(name) === value) return;
    written.set(name, value);
    node.style.setProperty(name, String(value));
  };
  const sideways = plan.fadeLeft || plan.fadeRight;
  const fadeAxis = sideways ? 'x' : plan.fadeTop || plan.fadeBottom ? 'y' : null;
  // The mask only while it has somewhere to fade: a box that holds everything keeps its paint whole.
  let masked = false;
  let frame = 0;
  const write = (): void => {
    frame = 0;
    if (fadeAxis) {
      const overflows = fadeAxis === 'x' ? node.scrollWidth - node.clientWidth > 1 : node.scrollHeight - node.clientHeight > 1;
      if (overflows !== masked) {
        masked = overflows;
        if (masked) node.setAttribute('data-scroll-fade', fadeAxis);
        else node.removeAttribute('data-scroll-fade');
      }
    }
    const top = node.scrollTop;
    const below = node.scrollHeight - node.clientHeight - top;
    if (plan.lineTop) set('--edge-above-k', lineStrength(top));
    if (plan.lineBottom) set('--edge-below-k', lineStrength(below));
    if (plan.fadeTop) set('--fade-above-k', fadeStrength(top));
    if (plan.fadeBottom) set('--fade-below-k', fadeStrength(below));
    if (sideways) {
      // Sideways the scroll may run either way (a right-to-left strip counts from 0 down).
      const left = Math.abs(node.scrollLeft);
      if (plan.fadeLeft) set('--fade-left-k', fadeStrength(left));
      if (plan.fadeRight) set('--fade-right-k', fadeStrength(node.scrollWidth - node.clientWidth - left));
    }
  };
  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(write);
  };
  node.setAttribute('data-scroll-edges', '');
  if (options.top === true) node.setAttribute('data-edge-top', '');
  if (options.bottom === true) node.setAttribute('data-edge-bottom', '');
  // What it brings into view (a field taking focus, a row chosen by the keys) stops clear of its edges.
  if (plan.lineTop || plan.fadeTop) node.style.setProperty('scroll-padding-top', plan.lineTop ? 'var(--edge-room)' : 'var(--edge-fade)');
  if (plan.lineBottom || plan.fadeBottom) node.style.setProperty('scroll-padding-bottom', plan.lineBottom ? 'var(--edge-room)' : 'var(--edge-fade)');
  if (plan.fadeLeft) node.style.setProperty('scroll-padding-left', 'var(--edge-fade)');
  if (plan.fadeRight) node.style.setProperty('scroll-padding-right', 'var(--edge-fade)');
  // At once: the first paint already shows the right edges.
  write();
  node.addEventListener('scroll', schedule, { passive: true });
  // The line being typed on never lies under a bar's hairline nor in a fade: as the caret moves, the
  // scroller keeps it clear (the browser's own caret scrolling ignores scroll-padding).
  const minds = plan.lineTop || plan.lineBottom || plan.fadeTop || plan.fadeBottom;
  let caretFrame = 0;
  const keepCaret = (): void => {
    caretFrame = 0;
    const caret = caretLine(node);
    if (!caret) return;
    const box = node.getBoundingClientRect();
    const top = plan.lineTop ? { at: box.top, room: EDGE_ROOM } : plan.fadeTop ? { at: box.top, room: EDGE_FADE } : null;
    const bottom = plan.lineBottom ? { at: box.bottom, room: EDGE_ROOM } : plan.fadeBottom ? { at: box.bottom, room: EDGE_FADE } : null;
    const shift = caretShift(caret, top, bottom, box);
    if (Math.abs(shift) >= 1) node.scrollTop += shift;
  };
  const caretMoved = (): void => {
    if (minds && !caretFrame) caretFrame = requestAnimationFrame(keepCaret);
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
    for (const name of ['data-scroll-edges', 'data-edge-top', 'data-edge-bottom', 'data-scroll-fade']) node.removeAttribute(name);
    for (const name of written.keys()) node.style.removeProperty(name);
    for (const name of ['scroll-padding-top', 'scroll-padding-bottom', 'scroll-padding-left', 'scroll-padding-right']) node.style.removeProperty(name);
  };
}

/** The scroller's ref: `<div ref={useScrollEdges({ top: true })} …>`. */
export function useScrollEdges<T extends HTMLElement = HTMLDivElement>(options: ScrollEdgesOptions = {}): RefCallback<T> {
  const { top, bottom, fade } = options;
  return useCallback((node: T | null) => (node ? watchScrollEdges(node, { top, bottom, fade }) : undefined), [top, bottom, fade]);
}

/**
 * The same for a scroller another hook already holds in a ref (to scroll it into place): its ref
 * keeps the element, this watches it. Pass what mounts or replaces the element as `deps`.
 */
export function useScrollEdgesOn(ref: RefObject<HTMLElement | null>, deps: readonly unknown[] = [], options: ScrollEdgesOptions = {}): void {
  const { top, bottom, fade } = options;
  useEffect(() => {
    const node = ref.current;
    return node ? watchScrollEdges(node, { top, bottom, fade }) : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the element is the ref's; `deps` say when it changes
  }, [ref, top, bottom, fade, ...deps]);
}

/**
 * A foot pinned to the bottom of what scrolls (`position: sticky`, a form's actions): how much of
 * its container still lies below it, as `--edge-below-k` on the foot itself (its hairline), 0 once
 * it rests at the container's end. Any scroll moves it (the window's or a scroller's), any change of
 * size too.
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
      const next = lineStrength(end - foot.getBoundingClientRect().bottom);
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
 * The window's own scroll, for the bars the page slides under (the header, the phone's top bar) and
 * over (the board's bottom bar): `--page-above-k` and `--page-below-k` on `<html>`, 0 to 1, a
 * hairline's strengths. Mounted once, by the shell.
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
      const nextAbove = lineStrength(top);
      const nextBelow = lineStrength(root.scrollHeight - root.clientHeight - top);
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
    // The line being typed on in the page itself stays clear of the header and of a form's foot.
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
      const shift = caretShift(caret, { at: header, room: EDGE_ROOM }, foot !== null && foot < window.innerHeight ? { at: foot, room: EDGE_ROOM } : null, { top: 0, bottom: window.innerHeight });
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
