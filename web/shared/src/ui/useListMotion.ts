/**
 * A list that moves as DESIGN's lists do (Motion: something leaving fades where it was, the rest
 * close ranks, something arriving settles in once they have made room), as the phone's do with
 * Reanimated's layout transitions: an item an update moves glides from where it was drawn to its
 * new place (FLIP, 250 on the standard curve); one arriving fades in (250, decelerate;
 * `data-motion-late`, or every arrival with `late` once something moves, waits 150 for the others to
 * make room); one leaving fades out where it was (100), drawn by a copy of its last frame. Every
 * app's lists take it: Carnet's checklists and facts, the bins, the labels, Contacts' list, Pages'
 * tree.
 *
 * The items are the elements under `root` carrying `data-motion="<key>"`, each measured in its
 * offset parent, so a group that moves carries its own items: give the list (and each group of
 * items that holds items of its own) `position: relative`, which also keeps a leaving item's copy
 * in it. The list as it opens is simply there, and so is a list drawn anew: another `scene` (the
 * words searched, a filter, another page) or more than `most` items coming or going at once (a
 * whole selection binned, an import). The hook acts when the component holding it renders: a list
 * whose rows render on their own (memo'd rows reading the store) has its holder read what it shows.
 * Reduced motion keeps the fades (without the wait) and drops the movement.
 *
 * Returns `settle(element)`: an item let go mid-drag (its `transform` set inline) settles from where
 * the hand left it, riding above the others (`data-settling`) until it lies down.
 */
import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

export interface ListMotionOptions {
  /** What the list shows (a search's words, a filter, a page): when it changes, the list is drawn anew and nothing moves. */
  readonly scene?: unknown;
  /** More items than this coming or going at once: the list just changes. */
  readonly most?: number;
  /** Every item arriving waits for the others to make room, when they move (`data-motion-late` asks it of one). */
  readonly late?: boolean;
}

interface Seen {
  readonly element: HTMLElement;
  /** Where its position was measured, and where its last frame fades if it leaves. */
  readonly frame: HTMLElement | null;
  /** Layout position in the frame: a glide or a drag (transforms) never counts. */
  readonly top: number;
  readonly left: number;
  readonly width: number;
}

/** The phone's ROW_OUT: out of the way before the next item slides into its place. */
const OUT_MS = 100;
/** The phone's ROW_IN_LATE: what arrives comes in once the others have closed ranks. */
const LATE_MS = 150;

const glides = new WeakMap<HTMLElement, Animation>();

function measure(root: HTMLElement): Map<string, Seen> {
  const seen = new Map<string, Seen>();
  for (const element of root.querySelectorAll<HTMLElement>('[data-motion]')) {
    const frame = element.offsetParent instanceof HTMLElement ? element.offsetParent : null;
    seen.set(element.dataset.motion!, { element, frame, top: element.offsetTop, left: element.offsetLeft, width: element.offsetWidth });
  }
  return seen;
}

/** How far a transform (inline, or a glide under way) draws the element from its layout place. */
function drawnOffset(element: HTMLElement): { x: number; y: number } {
  if (typeof DOMMatrixReadOnly === 'undefined') return { x: 0, y: 0 };
  const transform = getComputedStyle(element).transform;
  if (!transform || transform === 'none') return { x: 0, y: 0 };
  const matrix = new DOMMatrixReadOnly(transform);
  return { x: matrix.m41, y: matrix.m42 };
}

/** A motion token (`--ease-*`, `--duration-*` in base.css). */
function token(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** The item's last frame, fading where it stood: inert, and out of the list's own count. */
function fadeOut(was: Seen, easing: string): void {
  const frame = was.frame;
  // Gone with its group (whose own copy fades), or moved elsewhere rather than gone.
  if (!frame?.isConnected || was.element.isConnected) return;
  const ghost = was.element.cloneNode(true) as HTMLElement;
  for (const node of [ghost, ...ghost.querySelectorAll('[data-motion]')]) node.removeAttribute('data-motion');
  ghost.removeAttribute('data-settling');
  ghost.removeAttribute('id');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  Object.assign(ghost.style, { position: 'absolute', top: `${was.top}px`, left: `${was.left}px`, width: `${was.width}px`, margin: '0', transform: 'none', pointerEvents: 'none' });
  frame.appendChild(ghost);
  const fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: OUT_MS, easing, fill: 'forwards' });
  const drop = (): void => ghost.remove();
  fade.onfinish = drop;
  fade.oncancel = drop;
}

export function useListMotion(root: RefObject<HTMLElement | null>, options: ListMotionOptions = {}): (element: HTMLElement) => void {
  const { scene, most = Infinity, late = false } = options;
  const seen = useRef<Map<string, Seen> | null>(null);
  /** The list element measured last, and what it showed. */
  const measured = useRef<{ readonly element: HTMLElement; readonly scene: unknown } | null>(null);
  /** Keeps the measures current between the list's own renders (a line typed longer, the window resized), without moving anything. */
  const observer = useRef<ResizeObserver | null>(null);
  /** Items let go mid-drag since the last render, with where they were drawn from their place. */
  const released = useRef(new Map<HTMLElement, { x: number; y: number }>());

  useLayoutEffect(
    () => () => {
      observer.current?.disconnect();
      observer.current = null;
      measured.current = null;
    },
    [],
  );

  // Every render of the list: what moved glides, what came fades in, what went fades out.
  useLayoutEffect(() => {
    const element = root.current;
    const last = measured.current;
    // A list mounted anew (it was empty, or another page's) or showing something else is simply there.
    const before = last && last.element === element && Object.is(last.scene, scene) ? seen.current : null;
    if (last?.element !== element) {
      observer.current?.disconnect();
      observer.current = null;
      if (element && typeof ResizeObserver !== 'undefined') {
        const watched = new ResizeObserver(() => {
          if (measured.current?.element === element) seen.current = measure(element);
        });
        watched.observe(element);
        observer.current = watched;
      }
    }
    measured.current = element ? { element, scene } : null;
    const letGo = released.current;
    released.current = new Map();
    const now = element ? measure(element) : null;
    seen.current = now;
    if (!element || !now || !before || typeof element.animate !== 'function') return;
    const arriving = new Set<HTMLElement>();
    for (const [key, item] of now) if (!before.has(key)) arriving.add(item.element);
    const leaving = [...before].filter(([key]) => !now.has(key)).map(([, was]) => was);
    if (arriving.size + leaving.length > most) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const medium = parseFloat(token('--duration-medium', '250ms'));
    const standard = token('--ease-standard', 'ease');
    const decelerate = token('--ease-decelerate', 'ease-out');
    let moved = false;
    for (const [key, item] of now) {
      const was = before.get(key);
      const node = item.element;
      if (!was) continue;
      const dropped = letGo.get(node);
      // Its place has not changed: a glide under way carries on.
      if (still || (dropped === undefined && Math.abs(was.top - item.top) < 0.5 && Math.abs(was.left - item.left) < 0.5)) continue;
      // Where it is drawn right now (read before the glide under way is cancelled), to where it now belongs.
      const drawn = dropped ?? (glides.has(node) ? drawnOffset(node) : { x: 0, y: 0 });
      const dx = was.left + drawn.x - item.left;
      const dy = was.top + drawn.y - item.top;
      glides.get(node)?.cancel();
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      moved = true;
      if (dropped !== undefined) node.dataset.settling = '';
      const glide = node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: medium, easing: standard });
      glides.set(node, glide);
      const done = (): void => {
        if (glides.get(node) !== glide) return;
        glides.delete(node);
        delete node.dataset.settling;
      };
      glide.onfinish = done;
      glide.oncancel = done;
    }
    for (const node of arriving) {
      // A group arriving brings its items in with it.
      const group = node.parentElement?.closest<HTMLElement>('[data-motion]');
      if (group && arriving.has(group)) continue;
      // Nothing makes room when nothing moves: then a list's newcomer fades in at once.
      const waits = !still && (node.hasAttribute('data-motion-late') || (late && moved));
      node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: medium, easing: decelerate, delay: waits ? LATE_MS : 0, fill: 'backwards' });
    }
    const out = token('--ease-out', 'ease-out');
    for (const was of leaving) fadeOut(was, out);
  });

  return useCallback((element: HTMLElement) => {
    released.current.set(element, drawnOffset(element));
    element.style.transform = '';
  }, []);
}
