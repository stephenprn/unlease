/**
 * A modal layer: a portal into `#overlays`, a scrim, and a panel that holds
 * focus until it is dismissed (Escape, a press on the scrim, or its own
 * buttons). `kind` picks the shape: a centred dialog, the phone's bottom sheet,
 * a side sheet, the start drawer, or bare (menus and popovers position
 * themselves). Under 720px a dialog that is neither a whole page (`full`) nor a
 * confirmation rises as a bottom sheet, as each of them does on the phone.
 *
 * Back closes it before it leaves the page, as on the phone (`useBackCloses`),
 * unless it is a route's own (the note, a link), whose Back is the route's.
 */
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type AnimationEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import type { OutlineKind } from '@unlease/design/outline';

import { useBackCloses } from '../router';
import { NARROW, useMedia } from '../useMedia';
import { play, reducedMotion, SPATIAL_SLOW, springFrames, springPath, throwTiming, translation, velocityTracker } from './gestures';
import { dimmedBelow, firstFocusable, holdScroll, overlayRoot, pushLayer } from './layers';
import styles from './layers.module.css';
import { OutlineEdge, useOutline } from './Outline';
import { usePresence } from './presence';

export type LayerKind = 'center' | 'bottom' | 'side' | 'start' | 'bare';

export interface LayerProps {
  readonly open: boolean;
  readonly onDismiss: () => void;
  readonly children: ReactNode;
  readonly kind?: LayerKind;
  /** The accessible name, or the id of the element that names it. */
  readonly label?: string;
  readonly labelledBy?: string;
  /** Takes the whole screen under 720px (the editor, a link). */
  readonly full?: boolean;
  /** No dimming: menus and popovers. */
  readonly clear?: boolean;
  readonly role?: 'dialog' | 'alertdialog';
  readonly panelClassName?: string;
  readonly panelStyle?: React.CSSProperties;
  readonly initialFocus?: RefObject<HTMLElement | null>;
  /** The children are the panel (menus, popovers, the photo viewer): they place and label themselves. */
  readonly bare?: boolean;
  /** A route's own layer (the note, a link): leaving the route closes it, so Back is already the route's. */
  readonly routed?: boolean;
}

/** Each kind's exit (layers.module.css), with room to spare: the timeout only backs up `animationend` (and a sheet's throw). */
const EXIT_MS: Record<LayerKind, number> = { center: 220, bare: 220, bottom: 340, side: 280, start: 280 };

const LAYER_CLASS: Record<LayerKind, string | undefined> = { center: styles.center, bottom: styles.bottom, side: styles.side, start: styles.start, bare: undefined };
const PANEL_CLASS: Record<LayerKind, string | undefined> = { center: styles.centerPanel, bottom: styles.sheetPanel, side: styles.sidePanel, start: styles.startPanel, bare: undefined };

/** Each panel's outline (`outline.ts`): a dialog, the bottom sheet, a sheet on the right edge. The drawer runs the screen's full height, square. */
const OUTLINE_OF: Record<LayerKind, OutlineKind | null> = { center: 'dialog', bottom: 'sheet', side: 'sideSheet', start: null, bare: null };

/** The phone's sheet: pulled this far down (px), or flung this fast (px/s), it goes. */
const DISMISS_DRAG = 120;
const DISMISS_SPEED = 900;

/** Down the sheet follows the finger; up it resists, it is already as high as it goes. */
const follow = (pull: number): number => (pull >= 0 ? pull : -Math.sqrt(-pull) * 2);
const unfollow = (offset: number): number => (offset >= 0 ? offset : -((offset / 2) ** 2));

/** Under 720px a dialog that is not a whole page or a confirmation is the phone's bottom sheet. */
function resolveKind({ kind = 'center', full, role }: LayerProps, narrow: boolean): LayerKind {
  return narrow && kind === 'center' && !full && role !== 'alertdialog' ? 'bottom' : kind;
}

/** How much of the window's foot the on-screen keyboard covers: the sheet stands on it (the phone's KeyboardAvoidingView). */
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = typeof window === 'undefined' ? undefined : window.visualViewport;
    if (!active || !viewport) return;
    // A pinch zoom shrinks the visual viewport too: only an unzoomed one is the keyboard's doing.
    const update = (): void => setInset(viewport.scale > 1.01 ? 0 : Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, [active]);
  return active ? inset : 0;
}

/**
 * The sheet's handle, the phone's pan: the sheet (`panel`) follows the finger and the scrim fades
 * with it. Let go far or fast it is thrown off with the hand's speed, and the layer is let go once
 * it is gone (`onExited`); short of that it springs back, from wherever it is if taken again.
 */
function useSheetDrag(onDismiss: () => void, closing: boolean, onExited: () => void, onPanel: (node: HTMLDivElement | null) => void) {
  const panel = useRef<HTMLDivElement>(null);
  // The panel's ref, also handed to whoever measures it (its outline).
  const setPanel = useCallback(
    (node: HTMLDivElement | null) => {
      panel.current = node;
      onPanel(node);
    },
    [onPanel],
  );
  const scrim = useRef<HTMLDivElement>(null);
  const drag = useRef<{ readonly pointer: number; readonly start: number; offset: number; readonly speed: ReturnType<typeof velocityTracker> } | null>(null);
  const springs = useRef<Animation[]>([]);
  // A throw ends after the layer has been told to close; by then it knows whether it is closing.
  const closingNow = useRef(closing);
  useLayoutEffect(() => {
    closingNow.current = closing;
  }, [closing]);

  const show = (offset: number): void => {
    const sheet = panel.current;
    if (!sheet) return;
    sheet.style.translate = offset ? `0 ${offset}px` : '';
    if (scrim.current) scrim.current.style.opacity = offset > 0 ? String(1 - Math.min(1, offset / Math.max(1, sheet.offsetHeight))) : '';
  };

  const springBack = (sheet: HTMLDivElement, offset: number, velocity: number): void => {
    show(0);
    if (offset === 0 || reducedMotion()) return;
    const height = Math.max(1, sheet.offsetHeight);
    const path = springPath(offset, velocity, SPATIAL_SLOW);
    const lift = springFrames(path, y => ({ translate: `0 ${y}px` }));
    const dim = springFrames(path, y => ({ opacity: 1 - Math.min(1, Math.max(0, y) / height) }));
    springs.current = [play(sheet, lift.keyframes, { duration: lift.duration }), scrim.current ? play(scrim.current, dim.keyframes, { duration: dim.duration }) : null].filter(
      (motion): motion is Animation => motion !== null,
    );
  };

  const throwOff = (sheet: HTMLDivElement, offset: number, velocity: number): void => {
    // Without movement it just leaves (its exit is a fade from where the hand left it).
    if (reducedMotion()) {
      onDismiss();
      return;
    }
    // A little past its own height, so its lift is gone too; the scrim fades as the layer closes.
    const target = sheet.offsetHeight + 48;
    const { duration, easing } = throwTiming(target - offset, velocity);
    sheet.dataset.thrown = '';
    const motion = play(sheet, [{ translate: `0 ${offset}px` }, { translate: `0 ${target}px` }], { duration, easing });
    sheet.style.translate = `0 ${target}px`;
    onDismiss();
    // Where nothing animates, it is gone at once, once the layer has heard it is closing.
    if (motion) motion.finished.then(gone, () => {});
    else setTimeout(gone, 0);
  };

  const gone = (): void => {
    const sheet = panel.current;
    if (closingNow.current || !sheet) {
      onExited();
      return;
    }
    // Kept open after all: it comes back up.
    delete sheet.dataset.thrown;
    springBack(sheet, translation(sheet)[1], 0);
  };

  const release = (event: PointerEvent<HTMLDivElement>, cancelled: boolean): void => {
    const current = drag.current;
    const sheet = panel.current;
    if (!current || event.pointerId !== current.pointer || !sheet) return;
    drag.current = null;
    current.speed.add(event.clientY);
    const velocity = cancelled ? 0 : current.speed.velocity();
    if (!cancelled && (current.offset > DISMISS_DRAG || velocity > DISMISS_SPEED)) throwOff(sheet, current.offset, velocity);
    else springBack(sheet, current.offset, velocity);
  };

  const handle = {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      const sheet = panel.current;
      if (!sheet || !event.isPrimary || event.button !== 0 || sheet.dataset.thrown !== undefined) return;
      // The handle takes no focus: a field being typed in keeps it (and the keyboard stays up).
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      // Taken again mid-spring, it turns round from where it is.
      const [, offset] = translation(sheet);
      for (const motion of springs.current) motion.cancel();
      springs.current = [];
      show(offset);
      const speed = velocityTracker();
      speed.add(event.clientY);
      drag.current = { pointer: event.pointerId, start: event.clientY - unfollow(offset), offset, speed };
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const current = drag.current;
      if (!current || event.pointerId !== current.pointer) return;
      current.offset = follow(event.clientY - current.start);
      current.speed.add(event.clientY);
      show(current.offset);
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => release(event, false),
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) => release(event, true),
  };
  return { panel, setPanel, scrim, handle };
}

function LayerBody({
  onDismiss,
  children,
  kind,
  label,
  labelledBy,
  full,
  clear,
  role = 'dialog',
  panelClassName,
  panelStyle,
  initialFocus,
  bare,
  routed = false,
  closing,
  onExited,
}: Omit<LayerProps, 'open' | 'kind'> & { kind: LayerKind; closing: boolean; onExited: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  // What had focus before the layer, read while rendering: a field inside with autoFocus takes focus before the effects run.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  // Opened over a layer that dims already (a confirmation over a sheet): its own scrim stays clear, so the page never darkens twice.
  const [stacked] = useState(() => !clear && dimmedBelow());
  const dims = !clear && !stacked;
  const outlineKind = OUTLINE_OF[kind];
  const { ref: measure, d, vars } = useOutline<HTMLDivElement>(outlineKind);
  const { panel, setPanel, scrim, handle } = useSheetDrag(onDismiss, closing, onExited, measure);
  const dismiss = useEffectEvent(() => onDismiss());
  useBackCloses(!closing && !routed, onDismiss);
  const narrow = useMedia(NARROW);
  const sheet = kind === 'bottom';
  // A whole page on a phone (the note) stands on the keyboard too, its bar above it as the phone's is.
  const page = kind === 'center' && !!full && narrow;
  const keyboard = useKeyboardInset((sheet || page) && !closing);

  // The page holds still from the first frame to the last of the exit (a panel centred in the window would move if the scrollbar came back).
  useLayoutEffect(() => holdScroll(), []);

  // Closing leaves the stack at once (focus goes back, the page wakes up); only the picture stays to animate out.
  useLayoutEffect(() => {
    if (closing) return;
    const layer = container.current;
    const element = bare ? barePanel(layer) : panel.current;
    if (!layer || !element) return;
    const focused = document.activeElement instanceof HTMLElement && !layer.contains(document.activeElement) ? document.activeElement : null;
    const restore = opener && opener.isConnected && !layer.contains(opener) ? opener : focused;
    const pop = pushLayer({ element: layer, dismiss: () => dismiss(), restore, dims });
    // A child that already took focus (a new checklist's first item) keeps it.
    if (!element.contains(document.activeElement)) {
      const target = initialFocus?.current ?? firstFocusable(element) ?? element;
      target.focus({ preventScroll: true });
      // Never leave focus behind in what just became inert.
      if (!element.contains(document.activeElement)) element.focus({ preventScroll: true });
    }
    return pop;
  }, [initialFocus, bare, closing, panel, opener, dims]);

  const onAnimationEnd = (event: AnimationEvent<HTMLDivElement>): void => {
    const leaving = bare ? barePanel(container.current) : panel.current;
    if (closing && event.target === leaving) onExited();
  };

  const layerClass = [styles.layer, LAYER_CLASS[kind], full ? styles.full : ''].join(' ');
  const layerStyle = (sheet || page) && keyboard > 0 ? { paddingBottom: keyboard } : undefined;

  return (
    <div
      ref={container}
      className={layerClass}
      style={layerStyle}
      data-state={closing ? 'closed' : 'open'}
      inert={closing}
      aria-hidden={closing || undefined}
      onAnimationEnd={onAnimationEnd}
    >
      <div
        ref={scrim}
        className={[styles.scrim, dims ? '' : styles.clear].join(' ')}
        onPointerDown={event => {
          // A press on the scrim dismisses; the click that follows must not reach the page.
          event.preventDefault();
          onDismiss();
        }}
        aria-hidden="true"
      />
      {bare ? (
        children
      ) : (
        // The stage lays the panel out as the layer would and casts its lift: a drop shadow follows the panel's outline, which its clip would cut off.
        <div className={styles.stage}>
          <div
            ref={setPanel}
            role={role}
            aria-modal="true"
            aria-label={labelledBy ? undefined : label}
            aria-labelledby={labelledBy}
            tabIndex={-1}
            className={[PANEL_CLASS[kind], panelClassName ?? ''].join(' ')}
            style={{ ...vars, ...panelStyle }}
          >
            {sheet ? (
              <>
                <div className={styles.sheetHandle} aria-hidden="true" onPointerDown={handle.onPointerDown} onPointerMove={handle.onPointerMove} onPointerUp={handle.onPointerUp} onPointerCancel={handle.onPointerCancel} />
                <div className={styles.sheetBody}>{children}</div>
              </>
            ) : (
              children
            )}
            {/* The panel's edge, drawn over its content, so a sheet inside (the editor's note) keeps it too. */}
            <OutlineEdge d={d} className={styles.panelEdge} />
          </div>
        </div>
      )}
    </div>
  );
}

/** A bare layer's panel (a popover): the element marked as the panel, or its last child. */
function barePanel(layer: HTMLElement | null): HTMLElement | null {
  return layer?.querySelector<HTMLElement>('[data-layer-panel]') ?? (layer?.lastElementChild as HTMLElement | null) ?? null;
}

export function Layer(props: LayerProps) {
  const narrow = useMedia(NARROW);
  const kind = resolveKind(props, narrow);
  const { present, closing, done } = usePresence(props.open, EXIT_MS[kind]);
  // Every opening is a fresh layer, even one reopened while the last is still leaving.
  const [opening, setOpening] = useState({ open: props.open, count: 0 });
  if (props.open !== opening.open) setOpening({ open: props.open, count: opening.count + (props.open ? 1 : 0) });
  if (!present) return null;
  return createPortal(<LayerBody key={opening.count} {...props} kind={kind} closing={closing} onExited={done} />, overlayRoot('overlays'));
}
