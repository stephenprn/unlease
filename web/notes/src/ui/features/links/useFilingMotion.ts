/**
 * A stamped link files itself under "Déjà faits" (and back) once its stamp has landed, the others
 * closing ranks: the phone's `ROW_MOVE`, 250 ms on standard after 150 ms. What arrives (the
 * heading, a link just added) fades in once they have made room.
 *
 * The rows (`data-flip`, a stable key each: a row, a tile of the gallery or the mosaic, a table's
 * line) are measured as the store changes, before React moves
 * them, and played from where they stood (FLIP), so a row caught mid-move starts from where it
 * is. A list drawn whole (the page opening) just appears; Reduce Motion keeps only the fade, as the
 * stylesheet keeps no transform transition then.
 */
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

import { useLibraryStore, type LibraryState } from '../../../app/store/library';

const MOVE = 'transform var(--duration-medium) var(--ease-standard) var(--duration-short)';
const ARRIVE = 'opacity var(--duration-medium) var(--ease-decelerate) var(--duration-short)';

const still = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

interface Spot {
  readonly x: number;
  readonly y: number;
}

/** Where each row (a tile, a table's line) stands from the list's own corner: scrolling, or a head growing above, moves nothing. */
function spotOf(row: Element, origin: DOMRect): Spot {
  const box = row.getBoundingClientRect();
  return { x: box.left - origin.left, y: box.top - origin.top };
}

function measure(list: HTMLElement): Map<string, Spot> {
  const origin = list.getBoundingClientRect();
  const spots = new Map<string, Spot>();
  for (const row of list.querySelectorAll<HTMLElement>('[data-flip]')) spots.set(row.dataset.flip ?? '', spotOf(row, origin));
  return spots;
}

/** The inline transition goes once the move has played, so the row's own (its hover) comes back. */
function settle(event: TransitionEvent): void {
  const row = event.currentTarget as HTMLElement;
  if (event.target !== row) return;
  row.style.transition = '';
  row.removeEventListener('transitionend', settle);
}

/** `order` says, from the store, how the list is laid out: when it changes, the rows move. */
export function useFilingMotion(list: RefObject<HTMLElement | null>, order: (state: LibraryState) => string): void {
  const before = useRef<Map<string, Spot> | null>(null);

  useEffect(
    () =>
      useLibraryStore.subscribe((state, previous) => {
        if (before.current || !list.current || order(state) === order(previous)) return;
        before.current = measure(list.current);
        // React lays a store change out within the task; a snapshot it never used must not linger.
        setTimeout(() => {
          before.current = null;
        }, 0);
      }),
    [list, order],
  );

  useLayoutEffect(() => {
    const from = before.current;
    const root = list.current;
    before.current = null;
    if (!from || !root) return;
    const rows = [...root.querySelectorAll<HTMLElement>('[data-flip]')];
    // Every row to its new place, still, to read where that is.
    for (const row of rows) {
      row.style.transition = 'none';
      row.style.transform = '';
      row.style.opacity = '';
    }
    const origin = root.getBoundingClientRect();
    const moving = !still();
    const played: HTMLElement[] = [];
    for (const row of rows) {
      const was = from.get(row.dataset.flip ?? '');
      if (was === undefined) {
        row.style.opacity = '0';
        played.push(row);
        continue;
      }
      const now = spotOf(row, origin);
      const dx = was.x - now.x;
      const dy = was.y - now.y;
      if (!moving || (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5)) {
        row.style.transition = '';
        continue;
      }
      row.style.transform = `translate(${dx}px, ${dy}px)`;
      played.push(row);
    }
    if (played.length === 0) return;
    // One reflow with the rows where they stood, then let them go.
    void root.offsetHeight;
    for (const row of played) {
      row.style.transition = row.style.opacity === '0' ? ARRIVE : MOVE;
      row.style.transform = '';
      row.style.opacity = '';
      row.addEventListener('transitionend', settle);
    }
  });
}
