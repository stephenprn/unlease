/**
 * One tooltip for the whole app: any element with `data-tip` gets it on hover
 * (after a short delay) or on keyboard focus; never on touch, nor at all
 * where the pointer is a finger (the phone has no tooltips). A single listener,
 * so a wall of cards does not pay for a hundred tooltip components.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { overlayRoot } from './layers';
import styles from './layers.module.css';

interface Tip {
  readonly text: string;
  readonly anchor: DOMRect;
}

const DELAY_MS = 450;
/** Moving from one tooltip to the next shows the next almost at once. */
const CHAIN_MS = 80;

/** Its fade when the pointer drifts off (layers.module.css), with room to spare. */
const FADE_MS = 220;

export function Tooltip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [fading, setFading] = useState(false);
  const element = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const finger = typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)') : null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let current: HTMLElement | null = null;
    let showing = false;
    const forget = (): void => {
      if (timer) clearTimeout(timer);
      timer = null;
      current = null;
      showing = false;
    };
    // A press, a key or a scroll takes it away at once: it must not linger over what comes next.
    const hide = (): void => {
      forget();
      setTip(null);
      setFading(false);
    };
    const fade = (): void => {
      forget();
      setFading(true);
    };
    const schedule = (target: HTMLElement, delay: number): void => {
      if (timer) clearTimeout(timer);
      current = target;
      timer = setTimeout(() => {
        const text = target.dataset.tip;
        if (!text || !target.isConnected) return;
        showing = true;
        setFading(false);
        setTip({ text, anchor: target.getBoundingClientRect() });
      }, delay);
    };
    const onOver = (event: PointerEvent): void => {
      if (event.pointerType === 'touch' || finger?.matches) return;
      const target = (event.target as Element | null)?.closest?.<HTMLElement>('[data-tip]') ?? null;
      if (target === current) return;
      if (!target) {
        fade();
        return;
      }
      schedule(target, showing ? CHAIN_MS : DELAY_MS);
    };
    const onFocus = (event: FocusEvent): void => {
      if (finger?.matches) return;
      const target = (event.target as Element | null)?.closest?.<HTMLElement>('[data-tip]') ?? null;
      if (target && target.matches(':focus-visible')) schedule(target, DELAY_MS);
    };
    document.addEventListener('pointerover', onOver);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('keydown', hide, true);
    window.addEventListener('scroll', hide, true);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('keydown', hide, true);
      window.removeEventListener('scroll', hide, true);
    };
  }, []);

  // Placed after it renders, from its real width: centred under the anchor, above it near the bottom edge.
  useLayoutEffect(() => {
    const node = element.current;
    if (!tip || !node) return;
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    const left = Math.min(Math.max(8, tip.anchor.left + tip.anchor.width / 2 - width / 2), document.documentElement.clientWidth - width - 8);
    const below = tip.anchor.bottom + 6;
    const top = below + height + 8 > window.innerHeight ? tip.anchor.top - height - 6 : below;
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    node.style.visibility = 'visible';
  }, [tip]);

  useEffect(() => {
    if (!fading) return;
    const timer = setTimeout(() => {
      setTip(null);
      setFading(false);
    }, FADE_MS);
    return () => clearTimeout(timer);
  }, [fading]);

  if (!tip) return null;
  return createPortal(
    <div ref={element} className={styles.tooltip} role="tooltip" data-state={fading ? 'closed' : 'open'} style={{ visibility: 'hidden', left: 0, top: 0 }}>
      {tip.text}
    </div>,
    overlayRoot('live'),
  );
}
