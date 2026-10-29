/**
 * Dragging blocks and pages. From a block's grip or a row of the page tree, a paper label follows
 * the pointer and a matcha line shows where it would land: before or after a block, beside it (its
 * left or right edge: columns), at the end of a page, or on a page of the tree. Pointer events, so
 * a mouse, a pen and a finger drag alike; a press that does not move stays a click.
 */
import styles from './pages.module.css';

export type DropZone = 'before' | 'after' | 'left' | 'right' | 'inside';

export type DropTarget =
  /** A block of a page (`data-drop-block`); `left` and `right` only where it can stand in columns (`data-drop-sides`). */
  | { readonly type: 'block'; readonly id: string; readonly zone: 'before' | 'after' | 'left' | 'right' }
  /** A page in the tree (`data-tree-page`). */
  | { readonly type: 'tree'; readonly id: string; readonly zone: 'before' | 'after' | 'inside' }
  /** Under a page's last block (`data-drop-tail`, the page's id). */
  | { readonly type: 'tail'; readonly id: string };

export interface DragSource {
  /** A page dragged from the tree can land anywhere a block can; blocks land on a page of the tree only inside it. */
  readonly kind: 'blocks' | 'page';
  readonly ids: readonly string[];
  /** What the label says. */
  readonly label: string;
  /** Not a place to drop: the dragged blocks and everything inside them. */
  readonly excludes: (id: string) => boolean;
}

const START_DISTANCE = 4;
const EDGE_SCROLL = 64;

let justDragged = false;

/** How fast the window scrolls under a pointer held near its top or bottom edge, in pixels a frame. */
export function edgeScrollSpeed(y: number): number {
  if (y < EDGE_SCROLL) return -(EDGE_SCROLL - y) / 3;
  if (y > innerHeight - EDGE_SCROLL) return (y - (innerHeight - EDGE_SCROLL)) / 3;
  return 0;
}

/** A click that ends a drag is not a click. */
export function consumeDragClick(): boolean {
  const was = justDragged;
  justDragged = false;
  return was;
}

function targetAt(x: number, y: number, source: DragSource): { readonly target: DropTarget; readonly rect: DOMRect } | null {
  const element = document.elementFromPoint(x, y);
  const hit = element?.closest<HTMLElement>('[data-drop-block], [data-tree-page], [data-drop-tail]');
  if (!hit) return null;
  const rect = hit.getBoundingClientRect();
  const tree = hit.dataset.treePage;
  if (tree !== undefined) {
    if (source.excludes(tree)) return null;
    if (source.kind === 'blocks') return { target: { type: 'tree', id: tree, zone: 'inside' }, rect };
    const zone = y < rect.top + rect.height * 0.28 ? 'before' : y > rect.bottom - rect.height * 0.28 ? 'after' : 'inside';
    return { target: { type: 'tree', id: tree, zone }, rect };
  }
  const tail = hit.dataset.dropTail;
  if (tail !== undefined) return source.excludes(tail) ? null : { target: { type: 'tail', id: tail }, rect };
  const id = hit.dataset.dropBlock!;
  if (source.excludes(id)) return null;
  const edge = Math.min(56, rect.width * 0.14);
  if (hit.dataset.dropSides !== undefined && x < rect.left + edge) return { target: { type: 'block', id, zone: 'left' }, rect };
  if (hit.dataset.dropSides !== undefined && x > rect.right - edge) return { target: { type: 'block', id, zone: 'right' }, rect };
  return { target: { type: 'block', id, zone: y < rect.top + rect.height / 2 ? 'before' : 'after' }, rect };
}

function placeIndicator(indicator: HTMLElement, found: { readonly target: DropTarget; readonly rect: DOMRect } | null): void {
  if (!found) {
    indicator.hidden = true;
    return;
  }
  const { target, rect } = found;
  indicator.hidden = false;
  const zone = target.type === 'tail' ? 'tail' : target.zone;
  indicator.dataset.zone = zone;
  const set = (left: number, top: number, width: number, height: number): void => {
    indicator.style.left = `${left}px`;
    indicator.style.top = `${top}px`;
    indicator.style.width = `${width}px`;
    indicator.style.height = `${height}px`;
  };
  if (zone === 'inside') set(rect.left, rect.top, rect.width, rect.height);
  else if (zone === 'left') set(rect.left - 5, rect.top, 3, rect.height);
  else if (zone === 'right') set(rect.right + 2, rect.top, 3, rect.height);
  else if (zone === 'before') set(rect.left, rect.top - 2, rect.width, 3);
  else if (zone === 'tail') set(rect.left, rect.top + 4, rect.width, 3);
  else set(rect.left, rect.bottom - 1, rect.width, 3);
}

/**
 * Starts following the pointer from a press (`pointerdown`); the drag begins once it has moved a
 * few pixels. `onDrop` gets where it was let go; Escape or a press elsewhere drops nothing.
 */
export function pressToDrag(event: PointerEvent, source: DragSource, onDrop: (target: DropTarget) => void): void {
  if (event.button !== 0 || !event.isPrimary) return;
  const start = { x: event.clientX, y: event.clientY };
  let pointer = { x: start.x, y: start.y };
  let dragging = false;
  let ghost: HTMLElement | null = null;
  let indicator: HTMLElement | null = null;
  let current: { readonly target: DropTarget; readonly rect: DOMRect } | null = null;
  let frame = 0;

  const scroll = (): void => {
    frame = 0;
    if (!dragging) return;
    const speed = edgeScrollSpeed(pointer.y);
    if (speed !== 0) {
      window.scrollBy(0, speed);
      current = targetAt(pointer.x, pointer.y, source);
      if (indicator) placeIndicator(indicator, current);
      frame = requestAnimationFrame(scroll);
    }
  };

  const begin = (): void => {
    dragging = true;
    ghost = document.createElement('div');
    ghost.className = styles.dragGhost!;
    ghost.textContent = source.label;
    indicator = document.createElement('div');
    indicator.className = styles.dropIndicator!;
    indicator.hidden = true;
    document.body.append(ghost, indicator);
    document.documentElement.dataset.dragging = '';
    window.getSelection()?.removeAllRanges();
  };

  const move = (next: PointerEvent): void => {
    pointer = { x: next.clientX, y: next.clientY };
    if (!dragging) {
      if (Math.hypot(pointer.x - start.x, pointer.y - start.y) < START_DISTANCE) return;
      begin();
    }
    next.preventDefault();
    ghost!.style.transform = `translate(${pointer.x + 12}px, ${pointer.y + 8}px)`;
    current = targetAt(pointer.x, pointer.y, source);
    placeIndicator(indicator!, current);
    if (!frame) frame = requestAnimationFrame(scroll);
  };

  const finish = (drop: boolean): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', key, true);
    if (frame) cancelAnimationFrame(frame);
    if (!dragging) return;
    ghost?.remove();
    indicator?.remove();
    delete document.documentElement.dataset.dragging;
    justDragged = true;
    // The click that follows the release, if any, comes right away; a drag with no click forgets it.
    setTimeout(() => {
      justDragged = false;
    }, 0);
    if (drop && current) onDrop(current.target);
  };
  const up = (): void => finish(true);
  const cancel = (): void => finish(false);
  const key = (next: KeyboardEvent): void => {
    if (next.key !== 'Escape' || !dragging) return;
    next.preventDefault();
    next.stopPropagation();
    finish(false);
  };

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', key, true);
}
