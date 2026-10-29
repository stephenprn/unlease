/**
 * A card under a finger, as on the phone (NoteCard, SwipeToArchive): a hold picks it, a sideways
 * drag takes it off the board. Touch and pen only: a mouse keeps the link (its drag, middle click and
 * menu) and the corner pebble.
 *
 * Nothing is taken before the intent is clear: past 14px sideways and before 12px up or down, the
 * card captures the finger and follows it 1:1, turning up to 3° and growing see-through; otherwise the page scrolls as
 * usual (`touch-action: pan-y` leaves the vertical pan to the browser). Let go past 38% of its width,
 * or flung, it is thrown off with the hand's speed and `onSwiped` runs once it is gone; short of
 * that it springs back. It rides above its neighbours while it is off its place.
 */
import { useEffect, useRef, type DragEvent, type MouseEvent, type PointerEvent } from 'react';

import { CAN_ANIMATE, FRAME_MS, motionTokens, reducedMotion, settleIn, springPath, throwTiming } from './motion';

/** The phone's: past this share of the card's width, or flung, the card goes. */
const THRESHOLD = 0.38;
const FLING = 900;
/** The phone's pan: active past 14 sideways, failed past 12 up or down. */
const ACTIVE_X = 14;
const FAIL_Y = 12;
/** A finger that moved further than Android's touch slop is not holding still. */
const SLOP = 10;
/** React Native's long press (the platform's own, Android's `contextmenu`, counts if it comes first). */
const HOLD_MS = 500;
/** The press tint waits until the touch is clearly a tap (the phone's `listPressDelay`), so a scroll never flashes it. */
const PRESS_DELAY_MS = 100;
/** The hand's speed is read over its last stretch. */
const VELOCITY_MS = 100;
/** The click a hold or a drag leaves behind, if the browser sends one, comes this soon after the finger lifts. */
const SWALLOW_MS = 500;
const TILT = 3;

type Phase = 'idle' | 'pressing' | 'held' | 'dragging' | 'scrolling' | 'gone';

interface Track {
  phase: Phase;
  pointer: number;
  startX: number;
  startY: number;
  /** Still within the slop: a hold can still pick it. */
  still: boolean;
  /** The card's offset when the drag took it: caught on its way back, it carries on from there. */
  base: number;
  x: number;
  armed: boolean;
  samples: { t: number; x: number }[];
  hold: ReturnType<typeof setTimeout> | undefined;
  press: ReturnType<typeof setTimeout> | undefined;
  /** A hold or a drag never opens the note with the click that may follow it. */
  swallow: boolean;
  swallowUntil: number;
  /** The spring back or the throw, while it runs. */
  flight: Animation | null;
}

export interface CardGestureOptions {
  readonly id: string;
  /** The card's width: the threshold and the tilt are shares of it. */
  readonly width: number;
  readonly swipeable: boolean;
  /** A hold: the selection's toggle. */
  readonly onPick: (id: string, event: MouseEvent) => void;
  /** Thrown off the board. A card still on the wall afterwards (Rappels keeps archived notes) settles back in. */
  readonly onSwiped: (id: string) => void;
}

export interface CardGestureHandlers {
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  readonly onClickCapture: (event: MouseEvent<HTMLElement>) => void;
  readonly onContextMenu: (event: MouseEvent<HTMLElement>) => void;
  readonly onDragStart: (event: DragEvent<HTMLElement>) => void;
}

/** The phone's haptic click where the browser has one (Android), once the page has been touched, as browsers require. */
function click(): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function' || !navigator.userActivation?.hasBeenActive) return;
  navigator.vibrate(10);
}

/** The card's own offset, read off a spring still running. */
function offsetOf(node: HTMLElement): number {
  const shown = getComputedStyle(node).transform;
  return shown && shown !== 'none' ? new DOMMatrixReadOnly(shown).m41 : 0;
}

function remember(track: Track, time: number, x: number): void {
  track.samples.push({ t: time, x });
  while (track.samples.length > 2 && time - track.samples[0]!.t > VELOCITY_MS) track.samples.shift();
}

/** px/s over the last stretch of the drag. */
function velocityOf(track: Track): number {
  const first = track.samples[0];
  const last = track.samples[track.samples.length - 1];
  if (!first || !last || last.t - first.t < 1) return 0;
  return ((last.x - first.x) / (last.t - first.t)) * 1000;
}

export function useCardGestures({ id, width, swipeable, onPick, onSwiped }: CardGestureOptions): CardGestureHandlers {
  const track = useRef<Track>({
    phase: 'idle',
    pointer: -1,
    startX: 0,
    startY: 0,
    still: false,
    base: 0,
    x: 0,
    armed: false,
    samples: [],
    hold: undefined,
    press: undefined,
    swallow: false,
    swallowUntil: 0,
    flight: null,
  });

  useEffect(() => {
    const current = track.current;
    return () => {
      clearTimeout(current.hold);
      clearTimeout(current.press);
    };
  }, []);

  /**
   * A sheet pulled off the board tilts a little with the hand and turns see-through as it goes (about
   * 0.8 at the threshold, 0.45 a card's width away), then fades out as it leaves the screen.
   */
  const pose = (x: number): Keyframe => {
    const screen = window.innerWidth;
    const far = Math.abs(x) - screen * 0.75;
    const along = 1 - 0.55 * Math.min(1, Math.abs(x) / width);
    const leaving = far <= 0 ? 1 : Math.max(0, 1 - far / (screen * 0.25));
    return {
      transform: `translateX(${x}px) rotate(${Math.max(-1, Math.min(1, x / width)) * TILT}deg)`,
      opacity: Math.min(along, leaving),
    };
  };

  const place = (node: HTMLElement, x: number): void => {
    const { transform, opacity } = pose(x);
    node.style.transform = String(transform);
    node.style.opacity = String(opacity);
  };

  const unpress = (node: HTMLElement): void => {
    const t = track.current;
    clearTimeout(t.press);
    clearTimeout(t.hold);
    node.removeAttribute('data-pressed');
  };

  const pick = (event: MouseEvent): void => {
    const t = track.current;
    if (t.phase !== 'pressing' || !t.still) return;
    clearTimeout(t.hold);
    t.phase = 'held';
    t.swallow = true;
    click();
    onPick(id, event);
  };

  const follow = (node: HTMLElement, event: PointerEvent<HTMLElement>): void => {
    const t = track.current;
    t.x = t.base + (event.clientX - t.startX);
    remember(t, event.timeStamp, event.clientX);
    place(node, t.x);
    // A click when letting go would archive, another when it no longer would.
    const past = Math.abs(t.x) > width * THRESHOLD;
    if (past !== t.armed) {
      t.armed = past;
      click();
    }
  };

  const take = (node: HTMLElement, event: PointerEvent<HTMLElement>): void => {
    const t = track.current;
    unpress(node);
    t.phase = 'dragging';
    t.swallow = true;
    try {
      node.setPointerCapture?.(event.pointerId);
    } catch {
      // A pointer the browser no longer tracks: the moves still bubble here.
    }
    t.base = t.flight ? offsetOf(node) : 0;
    t.flight?.cancel();
    t.flight = null;
    node.style.zIndex = '1';
    follow(node, event);
  };

  /** Back into its place with the hand's own speed, settling without a bounce. */
  const springBack = (node: HTMLElement, velocity: number): void => {
    const t = track.current;
    const from = t.x;
    t.x = 0;
    node.style.transform = '';
    node.style.opacity = '';
    if (!CAN_ANIMATE || reducedMotion() || from === 0) {
      node.style.zIndex = '';
      return;
    }
    const path = springPath(from, velocity);
    const flight = node.animate(path.map(pose), { duration: (path.length - 1) * FRAME_MS, easing: 'linear' });
    t.flight = flight;
    flight.finished.then(
      () => {
        if (t.flight !== flight) return;
        t.flight = null;
        node.style.zIndex = '';
      },
      () => undefined,
    );
  };

  /** Off the screen, then off the board; if the board keeps it, it settles back in. */
  const throwOff = (node: HTMLElement, velocity: number): void => {
    const t = track.current;
    t.phase = 'gone';
    const from = t.x;
    const span = Math.sign(from) * window.innerWidth - from;
    const gone = (): void => {
      // Off the screen: a ghost takes no touch, and a sheet back on the wall is a card again.
      t.phase = 'idle';
      t.x = 0;
      node.style.zIndex = '';
      const flight = t.flight;
      onSwiped(id);
      setTimeout(() => {
        if (!node.isConnected || node.hasAttribute('data-leaving') || t.flight !== flight) return;
        t.flight?.cancel();
        t.flight = null;
        if (CAN_ANIMATE) settleIn(node);
      }, 0);
    };
    node.style.transform = '';
    node.style.opacity = '';
    if (!CAN_ANIMATE) {
      gone();
      return;
    }
    let flight: Animation;
    if (reducedMotion()) {
      // Movement goes: it fades where the hand left it.
      const { short, accelerate } = motionTokens();
      flight = node.animate([pose(from), { ...pose(from), opacity: 0 }], { duration: short, easing: accelerate, fill: 'forwards' });
    } else {
      // Keyframes at the turns of the pose (the tilt tops out at a card's width, the fade starts at 75% of the screen), in eased progress.
      const turns = [Math.sign(span) * width, Math.sign(span) * window.innerWidth * 0.75]
        .map(x => (x - from) / span)
        .filter(p => p > 0 && p < 1)
        .sort((a, b) => a - b);
      const frames = [0, ...turns, 1].map(p => ({ ...pose(from + span * p), offset: p }));
      flight = node.animate(frames, { ...throwTiming(span, velocity), fill: 'forwards' });
    }
    t.flight = flight;
    flight.finished.then(gone, () => undefined);
  };

  const release = (node: HTMLElement, velocity: number): void => {
    const t = track.current;
    t.armed = false;
    const flung = Math.abs(velocity) > FLING && Math.sign(velocity) === Math.sign(t.x);
    if (Math.abs(t.x) > width * THRESHOLD || flung) throwOff(node, velocity);
    else springBack(node, velocity);
  };

  /** Let go, or taken by the system (a cancelled drag never archives: it goes back). */
  const end = (event: PointerEvent<HTMLElement>, cancelled: boolean): void => {
    const t = track.current;
    if (event.pointerId !== t.pointer || t.phase === 'idle' || t.phase === 'gone') return;
    const node = event.currentTarget;
    const dragging = t.phase === 'dragging';
    unpress(node);
    if (t.swallow) t.swallowUntil = performance.now() + SWALLOW_MS;
    t.phase = 'idle';
    if (!dragging) return;
    remember(t, event.timeStamp, event.clientX);
    if (cancelled) {
      t.armed = false;
      springBack(node, 0);
    } else {
      // A throw keeps it 'gone' until it is off the board.
      release(node, velocityOf(t));
    }
  };

  return {
    onPointerDown: event => {
      const t = track.current;
      t.swallow = false;
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      if (t.phase === 'gone' || t.phase === 'dragging') return;
      const node = event.currentTarget;
      unpress(node);
      t.phase = 'pressing';
      t.pointer = event.pointerId;
      t.startX = event.clientX;
      t.startY = event.clientY;
      t.still = true;
      t.armed = false;
      t.samples = [{ t: event.timeStamp, x: event.clientX }];
      t.press = setTimeout(() => node.setAttribute('data-pressed', ''), PRESS_DELAY_MS);
      t.hold = setTimeout(() => pick(event), HOLD_MS);
    },
    onPointerMove: event => {
      const t = track.current;
      if (event.pointerId !== t.pointer) return;
      if (t.phase === 'dragging') {
        follow(event.currentTarget, event);
        return;
      }
      if (t.phase !== 'pressing') return;
      const dx = event.clientX - t.startX;
      const dy = event.clientY - t.startY;
      if (t.still && (Math.abs(dx) > SLOP || Math.abs(dy) > SLOP)) {
        t.still = false;
        unpress(event.currentTarget);
      }
      // Up or down first: the page scrolls, the card stays.
      if (Math.abs(dy) > FAIL_Y && Math.abs(dy) >= Math.abs(dx)) t.phase = 'scrolling';
      else if (swipeable && Math.abs(dx) > ACTIVE_X) take(event.currentTarget, event);
    },
    onPointerUp: event => end(event, false),
    onPointerCancel: event => end(event, true),
    onClickCapture: event => {
      const t = track.current;
      if (!t.swallow) return;
      t.swallow = false;
      if (performance.now() > t.swallowUntil) return;
      event.preventDefault();
      event.stopPropagation();
    },
    // The browser's own long press (a link's menu, its preview) would cover the card: a finger's hold is the pick.
    onContextMenu: event => {
      const t = track.current;
      if (t.phase === 'idle' || t.phase === 'gone') return;
      event.preventDefault();
      pick(event);
    },
    onDragStart: event => {
      if (track.current.phase !== 'idle') event.preventDefault();
    },
  };
}
