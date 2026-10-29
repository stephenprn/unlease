/**
 * A list that moves as the phone's checklist does (Reanimated's layout transitions there): an
 * item an update moves glides from where it was drawn to its new place (FLIP, 250 on the standard
 * curve); one arriving fades in (250, decelerate; `data-motion-late` waits 150 for the others to
 * make room); one leaving fades out where it was (100), drawn by a copy of its last frame. The
 * items are the elements under `root` carrying `data-motion="<key>"`, each measured in its offset
 * parent, so a group that moves carries its own items. The list as it opens is simply there.
 * Reduced motion keeps the fades (without the wait) and drops the movement.
 *
 * Returns `settle(element)`: an item let go mid-drag (its `transform` set inline) settles from where
 * the hand left it, riding above the others (`data-settling`) until it lies down.
 */
import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

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
/** The phone's ROW_IN_LATE: the ticked group comes in once the open list has closed ranks. */
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
function drawnOffset(element: HTMLElement): number {
  if (typeof DOMMatrixReadOnly === 'undefined') return 0;
  const transform = getComputedStyle(element).transform;
  return transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).m42 : 0;
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
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  Object.assign(ghost.style, { position: 'absolute', top: `${was.top}px`, left: `${was.left}px`, width: `${was.width}px`, margin: '0', transform: 'none', pointerEvents: 'none' });
  frame.appendChild(ghost);
  const fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: OUT_MS, easing, fill: 'forwards' });
  const drop = (): void => ghost.remove();
  fade.onfinish = drop;
  fade.oncancel = drop;
}

export function useListMotion(root: RefObject<HTMLElement | null>): (element: HTMLElement) => void {
  const seen = useRef<Map<string, Seen> | null>(null);
  /** Items let go mid-drag since the last render, with how far from their place they were drawn. */
  const released = useRef(new Map<HTMLElement, number>());

  // Kept current between the list's own renders (a line typed longer, the window resized), without moving anything.
  useLayoutEffect(() => {
    const element = root.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      seen.current = measure(element);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [root]);

  // Every render of the list: what moved glides, what came fades in, what went fades out.
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const before = seen.current;
    const now = measure(element);
    seen.current = now;
    const letGo = released.current;
    released.current = new Map();
    if (!before || typeof element.animate !== 'function') return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const medium = parseFloat(token('--duration-medium', '250ms'));
    const standard = token('--ease-standard', 'ease');
    const decelerate = token('--ease-decelerate', 'ease-out');
    const arriving = new Set<HTMLElement>();
    for (const [key, item] of now) {
      const was = before.get(key);
      const node = item.element;
      if (!was) {
        arriving.add(node);
        continue;
      }
      const dropped = letGo.get(node);
      // Its place has not changed: a glide under way carries on.
      if (still || (dropped === undefined && Math.abs(was.top - item.top) < 0.5)) continue;
      // Where it is drawn right now (read before the glide under way is cancelled), to where it now belongs.
      const delta = was.top + (dropped ?? (glides.has(node) ? drawnOffset(node) : 0)) - item.top;
      glides.get(node)?.cancel();
      if (Math.abs(delta) < 0.5) continue;
      if (dropped !== undefined) node.dataset.settling = '';
      const glide = node.animate([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], { duration: medium, easing: standard });
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
      // Nothing makes room when nothing moves: then it fades in at once.
      const late = !still && node.hasAttribute('data-motion-late');
      node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: medium, easing: decelerate, delay: late ? LATE_MS : 0, fill: 'backwards' });
    }
    const leaving = token('--ease-out', 'ease-out');
    for (const [key, was] of before) if (!now.has(key)) fadeOut(was, leaving);
  });

  return useCallback((element: HTMLElement) => {
    released.current.set(element, drawnOffset(element));
    element.style.transform = '';
  }, []);
}
