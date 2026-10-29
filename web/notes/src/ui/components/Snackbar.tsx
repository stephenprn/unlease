/**
 * The snackbar, on the slip: one line of what happened and, for
 * anything destructive, "Annuler". It leaves after four seconds (ten with an
 * action, so it can be read and reached; a sticky one, Claude at work, waits
 * up to two minutes for its answer), and waits while the pointer or the
 * keyboard is on it. Swiped sideways, as Android's snackbars are, it is thrown
 * off with the hand's speed; Escape sends it away from the keyboard.
 */
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';

import type { GlyphName } from '@unlease/design/glyphs';

import { dismissSnack, selectSnack, useUiStore, type Snack, type SnackTone } from '../../app/store/ui';
import { play, reducedMotion, SPATIAL, springFrames, springPath, throwTiming, translation, velocityTracker } from './gestures';
import { Icon } from './Icon';
import { overlayRoot } from './layers';
import styles from './layers.module.css';

/** The slip's exit (layers.module.css), with room to spare: the timeout only backs up `animationend`. */
const EXIT_MS = 220;
/** A swipe starts once the hand has gone this far sideways, and never once it has gone this far up or down (the phone's offsets). */
const SLOP = 12;
const THROW_SPEED = 900;

/** Each tone's leading glyph. */
const TONE_GLYPHS: Record<SnackTone, GlyphName> = { info: 'info', success: 'check', warning: 'alert', error: 'error' };

/** Faint as it goes: full at rest, 0.2 at 60% of its width away. */
const fadeAt = (x: number, width: number): number => 1 - 0.8 * Math.min(1, Math.abs(x) / (0.6 * width));

/** The swipe, the phone's pan: it follows the hand sideways, and once let go is thrown off or springs back. */
function useSwipe(id: number) {
  const touch = useRef<{ pointer: number; x: number; y: number; active: boolean; failed: boolean; speed: ReturnType<typeof velocityTracker> } | null>(null);
  const springs = useRef<Animation[]>([]);
  const swiped = useRef(false);

  const show = (slip: HTMLElement, x: number): void => {
    slip.style.translate = x ? `${x}px 0` : '';
    slip.style.opacity = x ? String(fadeAt(x, slip.offsetWidth)) : '';
  };

  const release = (event: PointerEvent<HTMLDivElement>, cancelled: boolean): void => {
    const current = touch.current;
    if (!current || event.pointerId !== current.pointer) return;
    touch.current = null;
    if (!current.active) return;
    const slip = event.currentTarget;
    delete slip.dataset.dragging;
    current.speed.add(event.clientX);
    const x = event.clientX - current.x;
    const velocity = cancelled ? 0 : current.speed.velocity();
    const width = slip.offsetWidth;
    if (!cancelled && (Math.abs(x) > width * 0.3 || Math.abs(velocity) > THROW_SPEED)) {
      // Off the screen from wherever it sits, on the side it was going.
      const side = Math.sign(x || velocity);
      const target = side * window.innerWidth;
      const { duration, easing } = throwTiming(target - x, velocity);
      const motion = reducedMotion() ? null : play(slip, [{ translate: `${x}px 0`, opacity: fadeAt(x, width) }, { translate: `${target}px 0`, opacity: 0.2 }], { duration, easing });
      slip.style.translate = `${target}px 0`;
      slip.style.opacity = '0';
      if (motion) motion.finished.then(() => dismissSnack(id), () => {});
      else dismissSnack(id);
      return;
    }
    show(slip, 0);
    if (reducedMotion()) return;
    const path = springPath(x, velocity, SPATIAL);
    const back = springFrames(path, at => ({ translate: `${at}px 0`, opacity: fadeAt(at, width) }));
    const motion = play(slip, back.keyframes, { duration: back.duration });
    springs.current = motion ? [motion] : [];
  };

  return {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (!event.isPrimary || event.button !== 0) return;
      // A touch that swiped may end without a click: a new press starts clean.
      swiped.current = false;
      const slip = event.currentTarget;
      // Taken again mid-spring, it goes on from where it is.
      const [x] = translation(slip);
      for (const motion of springs.current) motion.cancel();
      springs.current = [];
      show(slip, x);
      const speed = velocityTracker();
      speed.add(event.clientX);
      touch.current = { pointer: event.pointerId, x: event.clientX - x, y: event.clientY, active: false, failed: false, speed };
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const current = touch.current;
      if (!current || event.pointerId !== current.pointer || current.failed) return;
      const slip = event.currentTarget;
      const x = event.clientX - current.x;
      if (!current.active) {
        if (Math.abs(event.clientY - current.y) > SLOP) {
          current.failed = true;
          return;
        }
        if (Math.abs(x) <= SLOP) return;
        current.active = true;
        swiped.current = true;
        slip.dataset.dragging = '';
        slip.setPointerCapture?.(event.pointerId);
        window.getSelection?.()?.removeAllRanges();
      }
      current.speed.add(event.clientX);
      show(slip, x);
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => release(event, false),
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) => release(event, true),
    /** The press that ends a swipe is not a press on the action. */
    onClickCapture(event: MouseEvent) {
      if (!swiped.current) return;
      swiped.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}

function Slip({ shown, leaving, onHeld }: { shown: Snack; leaving: boolean; onHeld: (held: boolean) => void }) {
  const swipe = useSwipe(shown.id);
  return (
    <div
      className={styles.snack}
      data-surface="slip"
      data-tone={shown.tone}
      data-action={shown.action ? '' : undefined}
      data-state={leaving ? 'closed' : 'open'}
      inert={leaving}
      aria-hidden={leaving || undefined}
      onPointerEnter={() => onHeld(true)}
      onPointerLeave={() => onHeld(false)}
      onFocus={() => onHeld(true)}
      onBlur={() => onHeld(false)}
      onKeyDown={event => {
        if (event.key === 'Escape') dismissSnack(shown.id);
      }}
      {...swipe}
    >
      <Icon name={TONE_GLYPHS[shown.tone]} size={20} className={styles.snackGlyph} />
      <p className={`${styles.snackMessage} t-body`}>{shown.message}</p>
      {shown.action ? (
        <button
          type="button"
          className={`${styles.snackAction} t-label`}
          onClick={() => {
            shown.action?.run();
            dismissSnack(shown.id);
          }}
        >
          {shown.action.label}
        </button>
      ) : null}
    </div>
  );
}

export function Snackbar() {
  const snack = useUiStore(selectSnack);
  const [held, setHeld] = useState(false);
  // The slip on screen: the current one, or the last one while it leaves. A new message replaces it at once.
  const [shown, setShown] = useState(snack);
  if (snack && snack !== shown) {
    setShown(snack);
    // A slip that left under the pointer never got its pointerleave: the next one starts unheld.
    setHeld(false);
  }
  const leaving = !snack && shown !== null;

  useEffect(() => {
    if (!snack || held) return;
    const timer = setTimeout(() => dismissSnack(snack.id), snack.sticky ? 120_000 : snack.action ? 10_000 : 4_000);
    return () => clearTimeout(timer);
  }, [snack, held]);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setShown(null), EXIT_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  return createPortal(
    <div
      className={styles.snackHost}
      role="status"
      aria-live="polite"
      onAnimationEnd={event => {
        if (leaving && event.target === event.currentTarget.firstElementChild) setShown(null);
      }}
    >
      {shown ? <Slip key={shown.id} shown={shown} leaving={leaving} onHeld={setHeld} /> : null}
    </div>,
    overlayRoot('live'),
  );
}
