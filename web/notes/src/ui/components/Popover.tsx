/**
 * Something dropped from the button that opened it: a menu, a picker. It sits
 * below its anchor (above when there is no room), clamped to the viewport, and
 * closes on Escape or a press anywhere else. Taller than the room on either side
 * of its anchor, it slides over the anchor rather than scroll, as long as the
 * window can hold it whole. Under 720px a picker rises as the phone's bottom
 * sheet instead; a menu stays by its button, as on the phone.
 */
import { useCallback, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';

import { NARROW, useMedia } from '../useMedia';
import { Layer } from './Layer';
import styles from './layers.module.css';
import { OutlineEdge, useOutline } from './Outline';

export interface PopoverProps {
  readonly open: boolean;
  readonly anchor: RefObject<HTMLElement | null>;
  readonly onDismiss: () => void;
  readonly children: ReactNode;
  readonly label: string;
  readonly role?: 'dialog' | 'menu';
  readonly align?: 'start' | 'end';
  readonly width?: number;
  readonly className?: string;
  readonly initialFocus?: RefObject<HTMLElement | null>;
}

const MARGIN = 8;

function PopoverPanel({ anchor, children, label, role = 'dialog', align = 'start', width, className }: Omit<PopoverProps, 'open' | 'onDismiss' | 'initialFocus'>) {
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // A menu's own outline: its paint clipped to it, its edge inside it, its lift cast by the stage.
  const { ref: measure, d, vars } = useOutline<HTMLDivElement>('menu');
  const setPanel = useCallback(
    (node: HTMLDivElement | null) => {
      panelRef.current = node;
      measure(node);
    },
    [measure],
  );

  // Placed before the first paint, straight on the node: the layer focuses
  // inside it in this same commit, and a hidden panel cannot take focus.
  useLayoutEffect(() => {
    const place = (): void => {
      const target = anchor.current;
      const panel = panelRef.current;
      if (!target || !panel) return;
      const rect = target.getBoundingClientRect();
      panel.style.maxHeight = '';
      // Its laid-out size: the bounding box would be measured mid scale-in, too small, and the clamp would let it spill.
      const box = { width: panel.offsetWidth, height: panel.offsetHeight };
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const below = viewportHeight - rect.bottom - MARGIN;
      const above = rect.top - MARGIN;
      const downward = box.height <= below || below >= above;
      // On the roomier side; when neither holds it, it slides over its anchor, into the window, rather than scroll.
      const room = viewportHeight - 2 * MARGIN;
      const height = Math.min(box.height, room);
      const wanted = downward ? rect.bottom + 4 : rect.top - 4 - height;
      const top = Math.min(Math.max(MARGIN, wanted), viewportHeight - MARGIN - height);
      let left = align === 'end' ? rect.right - box.width : rect.left;
      left = Math.min(Math.max(MARGIN, left), viewportWidth - box.width - MARGIN);
      panel.style.top = `${top}px`;
      panel.style.left = `${left}px`;
      panel.style.maxHeight = `${room}px`;
      // It grows out of its button and shrinks back into it: the origin is the anchor's middle, or the side nearest it.
      const originX = Math.min(Math.max(0, rect.left + rect.width / 2 - left), box.width);
      const originY = Math.min(Math.max(0, rect.top + rect.height / 2 - top), height);
      panel.style.transformOrigin = `${originX}px ${originY}px`;
    };
    place();
    window.addEventListener('resize', place);
    // A picker that grows (the reminder's date fields) is placed again, flipping up if needed.
    // The content is watched, not the panel, whose max-height would hide the growth.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    if (contentRef.current) observer?.observe(contentRef.current);
    return () => {
      window.removeEventListener('resize', place);
      observer?.disconnect();
    };
  }, [anchor, align]);

  return (
    // Fixed over the whole window, the stage casts the menu's lift along its outline; the menu is placed in it as in the window.
    <div className={styles.popoverStage}>
      <div
        ref={setPanel}
        role={role}
        aria-modal={role === 'dialog' ? true : undefined}
        aria-label={label}
        tabIndex={-1}
        className={[styles.popover, className ?? ''].join(' ')}
        style={width ? { ...vars, width } : vars}
        data-layer-panel=""
      >
        {/* It scrolls inside its outline, so its edge stays put. */}
        <div className={styles.popoverScroll}>
          <div ref={contentRef}>{children}</div>
        </div>
        <OutlineEdge d={d} className={styles.panelEdge} />
      </div>
    </div>
  );
}

export function Popover({ open, onDismiss, initialFocus, ...rest }: PopoverProps) {
  const narrow = useMedia(NARROW);
  if (narrow && rest.role !== 'menu') {
    return (
      <Layer open={open} onDismiss={onDismiss} kind="bottom" label={rest.label} initialFocus={initialFocus}>
        <div className={[styles.sheetPicker, rest.className ?? ''].join(' ')}>{rest.children}</div>
      </Layer>
    );
  }
  return (
    <Layer open={open} onDismiss={onDismiss} kind="bare" clear initialFocus={initialFocus} bare>
      <PopoverPanel {...rest} />
    </Layer>
  );
}
