/**
 * The sheet drawn on: an SVG in drawing units across the sheet's width, as tall as what is drawn
 * and room under it to go on (or the room it is given, if more), transparent over its note's wash
 * and paper or its frame.
 *
 * A mouse, a pen or one finger draws: the stroke in progress is painted on its own path, frame by
 * frame, the others stay as they are; let go, it is smoothed, kept and saved. The eraser takes away
 * every stroke it passes over, its reach a quiet ring under the pointer. The wheel scrolls as ever;
 * under fingers, two scroll the sheet and hand their speed on (a line the first had only just
 * begun was the start of that scroll, and goes). A pen's eraser end erases; while a pen is down,
 * touches are a resting hand and draw nothing.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

import { DRAWING_WIDTH, HIGHLIGHTER_OPACITY, STROKE_WIDTHS, type DrawingInk, type DrawingSize, type DrawingTool, type Stroke } from '@unlease/notes/models/drawing';
import { eraserReach, finishStroke, newStrokeId, strokePath } from '@unlease/notes/services/drawing';

import { reducedMotion, velocityTracker } from '../../components/gestures';
import styles from './drawing.module.css';
import { usePen } from './pen';
import { StrokeList } from './StrokeArt';
import { lowestPoint, sheetHeight, strokesAlong } from './strokes';

/** Points nearer than this to the last one add nothing (drawing units). */
const MIN_STEP = 0.75;
/** A stroke takes no more points than this (`finishStroke` keeps fewer still). */
const MAX_POINTS = 20_000;
/** A line the first finger began this recently (ms) when a second comes down was the start of a scroll. */
const SCROLL_GRACE_MS = 250;
/** How quickly a two-finger fling slows down (s). */
const FLING_DECAY = 0.33;

/** Where the sheet is on screen, and its pixels per drawing unit. */
interface Place {
  rect: DOMRect;
  scale: number;
}

interface Gesture extends Place {
  readonly pointer: number;
  readonly touch: boolean;
  readonly erasing: boolean;
  readonly tool: DrawingTool;
  readonly size: DrawingSize;
  readonly ink: DrawingInk;
  readonly started: number;
  /** The eraser's reach, in drawing units. */
  readonly reach: number;
  /** x, y… in drawing units; the eraser keeps only where it is. */
  readonly points: number[];
  readonly erased: Set<string>;
  /** The animation frame that paints the stroke in progress, if one is asked for. */
  frame: number;
}

interface Pan {
  readonly scroller: HTMLElement | null;
  /** The fingers' middle height (px) when last followed. */
  last: number;
  readonly speed: ReturnType<typeof velocityTracker>;
}

/** What the hands are doing on the sheet. */
interface Hands {
  gesture: Gesture | null;
  /** Fingers down, by pointer: their height on screen. */
  readonly touches: Map<number, number>;
  pan: Pan | null;
  fling: number;
  /** A pen is down: a touch meanwhile is the hand resting on the sheet. */
  pen: boolean;
}

function placeOf(node: SVGSVGElement | null): Place | null {
  const rect = node?.getBoundingClientRect();
  return rect && rect.width > 0 ? { rect, scale: rect.width / DRAWING_WIDTH } : null;
}

const unitsAt = (place: Place, clientX: number, clientY: number): [number, number] => [(clientX - place.rect.left) / place.scale, (clientY - place.rect.top) / place.scale];


/** What scrolls the sheet: the nearest box around it that does, or the page. */
function scrollerOf(node: Element): HTMLElement | null {
  for (let at = node.parentElement; at; at = at.parentElement) {
    const overflow = getComputedStyle(at).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && at.scrollHeight > at.clientHeight) return at;
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
}

function middle(touches: ReadonlyMap<number, number>): number {
  let sum = 0;
  for (const y of touches.values()) sum += y;
  return touches.size > 0 ? sum / touches.size : 0;
}

function stopFling(hands: Hands): void {
  if (hands.fling) cancelAnimationFrame(hands.fling);
  hands.fling = 0;
}

/** Let go mid-scroll: the sheet goes on at the fingers' speed and slows to a stop. */
function fling(hands: Hands, pan: Pan): void {
  const scroller = pan.scroller;
  let speed = pan.speed.velocity();
  if (!scroller || reducedMotion() || Math.abs(speed) < 150) return;
  let last = performance.now();
  const step = (now: number): void => {
    const elapsed = Math.min(0.05, (now - last) / 1000);
    last = now;
    scroller.scrollTop -= speed * elapsed;
    speed *= Math.exp(-elapsed / FLING_DECAY);
    hands.fling = Math.abs(speed) > 30 ? requestAnimationFrame(step) : 0;
  };
  hands.fling = requestAnimationFrame(step);
}

export interface DrawingCanvasProps {
  readonly strokes: readonly Stroke[];
  readonly editable: boolean;
  /** Its accessible name. */
  readonly label: string;
  /** A hand comes down on the sheet (true) or lifts. */
  readonly onGesture?: (active: boolean) => void;
  readonly onStroke?: (stroke: Stroke) => void;
  readonly onErase?: (ids: ReadonlySet<string>) => void;
  readonly className?: string;
}

export function DrawingCanvas({ strokes, editable, label, onGesture, onStroke, onErase, className }: DrawingCanvasProps) {
  const mode = usePen(pen => pen.mode);
  // The strokes an eraser has gone over, gone from the sheet until it lifts.
  const [hidden, setHidden] = useState<ReadonlySet<string> | null>(null);
  const height = useMemo(() => sheetHeight(lowestPoint(strokes)), [strokes]);
  const svg = useRef<SVGSVGElement>(null);
  const live = useRef<SVGPathElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const hands = useRef<Hands>({ gesture: null, touches: new Map(), pan: null, fling: 0, pen: false });

  // Scrolled under a stroke (the wheel while drawing), the sheet has moved under the pointer.
  const remeasure = useCallback(() => {
    const gesture = hands.current.gesture;
    const place = placeOf(svg.current);
    if (!gesture || !place) return;
    gesture.rect = place.rect;
    gesture.scale = place.scale;
  }, []);

  useEffect(() => {
    const state = hands.current;
    return () => {
      stopFling(state);
      if (state.gesture?.frame) cancelAnimationFrame(state.gesture.frame);
      state.gesture = null;
      window.removeEventListener('scroll', remeasure, true);
    };
  }, [remeasure]);

  // Another tool in hand: the eraser's ring goes.
  useEffect(() => {
    if (mode !== 'eraser') ring.current?.removeAttribute('data-shown');
  }, [mode]);

  const hideRing = (): void => {
    ring.current?.removeAttribute('data-shown');
  };

  const showRing = (x: number, y: number, reach: number): void => {
    const circle = ring.current;
    if (!circle) return;
    circle.setAttribute('cx', String(x));
    circle.setAttribute('cy', String(y));
    circle.setAttribute('r', String(reach));
    circle.setAttribute('data-shown', '');
  };

  const paint = (): void => {
    const gesture = hands.current.gesture;
    if (!gesture) return;
    gesture.frame = 0;
    live.current?.setAttribute('d', strokePath(gesture.points));
  };

  const sweep = (gesture: Gesture, ax: number, ay: number, bx: number, by: number): void => {
    const found = strokesAlong(strokes, ax, ay, bx, by, gesture.reach, gesture.erased);
    if (found.length === 0) return;
    for (const id of found) gesture.erased.add(id);
    setHidden(new Set(gesture.erased));
  };

  const begin = (event: ReactPointerEvent<SVGSVGElement>, erasing: boolean): void => {
    const place = placeOf(svg.current);
    if (!place) return;
    const { tool, sizes, ink } = usePen.getState();
    const [x, y] = unitsAt(place, event.clientX, event.clientY);
    const gesture: Gesture = { ...place, pointer: event.pointerId, touch: event.pointerType === 'touch', erasing, tool, size: sizes[tool], ink, started: performance.now(), reach: eraserReach(1 / place.scale), points: [x, y], erased: new Set(), frame: 0 };
    hands.current.gesture = gesture;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    window.addEventListener('scroll', remeasure, { capture: true, passive: true });
    onGesture?.(true);
    if (erasing) {
      showRing(x, y, gesture.reach);
      sweep(gesture, x, y, x, y);
      return;
    }
    const path = live.current;
    if (path) {
      path.setAttribute('stroke-width', String(STROKE_WIDTHS[tool][gesture.size]));
      if (ink === 'ink') path.removeAttribute('data-line');
      else path.setAttribute('data-line', ink);
      if (tool === 'highlighter') path.setAttribute('opacity', String(HIGHLIGHTER_OPACITY));
      else path.removeAttribute('opacity');
    }
    paint();
  };

  /** The hand lifts: what it drew is kept (`keep`) or let go. */
  const end = (gesture: Gesture, keep: boolean): void => {
    hands.current.gesture = null;
    if (gesture.frame) cancelAnimationFrame(gesture.frame);
    window.removeEventListener('scroll', remeasure, true);
    live.current?.removeAttribute('d');
    if (gesture.touch) hideRing();
    if (gesture.erasing) {
      setHidden(null);
      if (keep && gesture.erased.size > 0) onErase?.(gesture.erased);
    } else if (keep) {
      const stroke = finishStroke(newStrokeId(), gesture.tool, gesture.size, gesture.ink, gesture.points);
      if (stroke) onStroke?.(stroke);
    }
    onGesture?.(false);
  };

  const follow = (gesture: Gesture, clientX: number, clientY: number): void => {
    const [x, y] = unitsAt(gesture, clientX, clientY);
    const points = gesture.points;
    const lastX = points[points.length - 2]!;
    const lastY = points[points.length - 1]!;
    if (Math.abs(x - lastX) < MIN_STEP && Math.abs(y - lastY) < MIN_STEP) return;
    if (gesture.erasing) {
      points[0] = x;
      points[1] = y;
      showRing(x, y, gesture.reach);
      sweep(gesture, lastX, lastY, x, y);
    } else if (points.length < MAX_POINTS * 2) points.push(x, y);
  };

  /** Two fingers: the line the first had only just begun goes (one drawn a while is kept), and the sheet scrolls under them. */
  const startPan = (): void => {
    const state = hands.current;
    const gesture = state.gesture;
    if (gesture) end(gesture, performance.now() - gesture.started > SCROLL_GRACE_MS);
    const node = svg.current;
    if (!node) return;
    state.pan ??= { scroller: scrollerOf(node), last: 0, speed: velocityTracker() };
    state.pan.last = middle(state.touches);
    state.pan.speed.add(state.pan.last);
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const state = hands.current;
    stopFling(state);
    if (event.pointerType === 'touch') {
      if (state.pen) return;
      state.touches.set(event.pointerId, event.clientY);
      if (state.touches.size > 1 || state.pan) {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        startPan();
        return;
      }
    } else if (event.button !== 0 && !(event.pointerType === 'pen' && event.button === 5)) return;
    if (state.gesture) return;
    // No text selected, no focus moved by the browser: the sheet takes it, so its keys work.
    event.preventDefault();
    if (event.pointerType === 'pen') state.pen = true;
    begin(event, usePen.getState().mode === 'eraser' || event.button === 5);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const state = hands.current;
    if (state.touches.has(event.pointerId)) state.touches.set(event.pointerId, event.clientY);
    const pan = state.pan;
    if (pan) {
      const y = middle(state.touches);
      if (pan.scroller) pan.scroller.scrollTop += pan.last - y;
      pan.last = y;
      pan.speed.add(y);
      return;
    }
    const gesture = state.gesture;
    if (!gesture) {
      // A mouse or a pen over the sheet shows the eraser's reach.
      if (mode !== 'eraser' || event.pointerType === 'touch') return;
      const place = placeOf(svg.current);
      if (!place) return;
      const [x, y] = unitsAt(place, event.clientX, event.clientY);
      showRing(x, y, eraserReach(1 / place.scale));
      return;
    }
    if (gesture.pointer !== event.pointerId) return;
    const native = event.nativeEvent;
    const coalesced = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    for (const each of coalesced.length > 0 ? coalesced : [native]) follow(gesture, each.clientX, each.clientY);
    if (!gesture.erasing && !gesture.frame) gesture.frame = requestAnimationFrame(paint);
  };

  const release = (event: ReactPointerEvent<SVGSVGElement>, keep: boolean): void => {
    const state = hands.current;
    if (event.pointerType === 'pen') state.pen = false;
    if (state.touches.delete(event.pointerId) && state.pan) {
      if (state.touches.size > 0) state.pan.last = middle(state.touches);
      else {
        const pan = state.pan;
        state.pan = null;
        if (keep) fling(state, pan);
      }
      return;
    }
    const gesture = state.gesture;
    if (gesture?.pointer === event.pointerId) end(gesture, keep);
  };

  const lostCapture = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const gesture = hands.current.gesture;
    if (gesture?.pointer === event.pointerId) end(gesture, true);
  };

  const leave = (): void => {
    if (!hands.current.gesture) hideRing();
  };

  return (
    <div className={className ? `${styles.canvasBox} ${className}` : styles.canvasBox} style={{ '--ratio': height / DRAWING_WIDTH } as CSSProperties}>
      <svg
        ref={svg}
        className={styles.canvas}
        viewBox={`0 0 ${DRAWING_WIDTH} ${height}`}
        preserveAspectRatio="xMinYMin meet"
        role="img"
        aria-label={label}
        tabIndex={editable ? -1 : undefined}
        data-mode={editable ? mode : undefined}
        onPointerDown={editable ? onPointerDown : undefined}
        onPointerMove={editable ? onPointerMove : undefined}
        onPointerUp={editable ? event => release(event, true) : undefined}
        // Taken away by the system, a line goes: it was a resting palm, more often than not.
        onPointerCancel={editable ? event => release(event, false) : undefined}
        onLostPointerCapture={editable ? lostCapture : undefined}
        onPointerLeave={editable ? leave : undefined}
        onContextMenu={editable ? event => event.preventDefault() : undefined}
      >
        <g className={styles.strokes}>
          <StrokeList strokes={strokes} hidden={hidden} />
          {editable ? <path ref={live} /> : null}
        </g>
        {editable ? <circle ref={ring} className={styles.eraser} /> : null}
      </svg>
    </div>
  );
}
