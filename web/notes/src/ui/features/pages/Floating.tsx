/**
 * A panel floating by the text being typed (the "/" menu, the "@" picker, the formatting bar):
 * not a modal layer, so the caret stays where it is and typing goes on. It sits under its anchor
 * (above when there is no room), 8px inside what the window shows (the on-screen keyboard and the
 * scrollbar left out), and grows from the anchor as a menu does.
 */
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { overlayRoot } from '../../components/layers';
import styles from './pages.module.css';

const MARGIN = 8;
const GAP = 6;

/** What the window shows, in the coordinates a fixed panel is placed in. */
function visibleArea(): { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number } {
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight || window.innerHeight;
  const view = window.visualViewport;
  if (!view) return { left: 0, top: 0, right: width, bottom: height };
  return { left: view.offsetLeft, top: view.offsetTop, right: Math.min(width, view.offsetLeft + view.width), bottom: Math.min(height, view.offsetTop + view.height) };
}

export interface FloatingProps {
  readonly anchor: DOMRect;
  readonly children: ReactNode;
  readonly className?: string;
  /** Above the anchor by preference (the formatting bar over a selection). */
  readonly above?: boolean;
  readonly label: string;
  readonly role?: 'listbox' | 'toolbar' | 'dialog';
  readonly id?: string;
}

export function Floating({ anchor, children, className, above = false, label, role = 'dialog', id }: FloatingProps) {
  const panel = useRef<HTMLDivElement>(null);
  const placeRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    placeRef.current = () => {
      const node = panel.current;
      if (!node) return;
      const area = visibleArea();
      // Never taller than the window shows: a list in it scrolls instead.
      node.style.maxHeight = '';
      const room = Math.max(0, area.bottom - area.top - 2 * MARGIN);
      if (node.offsetHeight > room) node.style.maxHeight = `${room}px`;
      const width = node.offsetWidth;
      const height = node.offsetHeight;
      const roomBelow = area.bottom - anchor.bottom - MARGIN;
      const roomAbove = anchor.top - area.top - MARGIN;
      const up = above ? roomAbove >= height || roomAbove > roomBelow : roomBelow < height && roomAbove > roomBelow;
      const wanted = up ? anchor.top - height - GAP : anchor.bottom + GAP;
      const top = Math.max(area.top + MARGIN, Math.min(area.bottom - height - MARGIN, wanted));
      const left = Math.max(area.left + MARGIN, Math.min(area.right - width - MARGIN, above ? anchor.left + anchor.width / 2 - width / 2 : anchor.left));
      node.style.top = `${top}px`;
      node.style.left = `${left}px`;
      node.style.transformOrigin = `${Math.min(width, Math.max(0, anchor.left - left))}px ${up ? height : 0}px`;
      node.style.opacity = '';
    };
    placeRef.current();
  });
  // Placed again when it grows or shrinks, the window changes, or the on-screen keyboard comes or goes.
  useLayoutEffect(() => {
    const place = (): void => placeRef.current();
    const view = window.visualViewport;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    if (panel.current) observer?.observe(panel.current);
    window.addEventListener('resize', place);
    view?.addEventListener('resize', place);
    view?.addEventListener('scroll', place);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', place);
      view?.removeEventListener('resize', place);
      view?.removeEventListener('scroll', place);
    };
  }, []);
  return createPortal(
    // The stage casts the panel's lift along its organic outline (a clip would cut a shadow off).
    <div className={styles.floatingStage}>
      <div ref={panel} id={id} role={role} aria-label={label} className={[styles.floating, className ?? ''].join(' ')} data-outline="menu" data-edge
        // Unseen until placed, but focusable at once (a field in it takes the caret as it opens).
        style={{ opacity: 0 }}
        // A press on it keeps the caret in the text (a field in it still takes the focus).
        onPointerDown={event => {
          if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
        }}
      >
        {children}
      </div>
    </div>,
    overlayRoot('live'),
  );
}
