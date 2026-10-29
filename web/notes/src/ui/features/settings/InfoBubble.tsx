/**
 * A section's "how it works", as on the phone: an info pebble beside its title opens a short card
 * of matcha wash under it, a calm sheet whose pointer stands on its top edge under the pebble (its
 * corner there kept tight, so the edge runs straight to it). It fades in, and out.
 */
import { useId, useState, type CSSProperties } from 'react';

import { t } from '@unlease/core/i18n';

import { IconButton } from '../../components/IconButton';
import { useOutline } from '../../components/Outline';
import { usePresence } from '../../components/presence';
import styles from './settings.module.css';

/** Its pointer stands under the info pebble, this far in from its right. */
const TAIL_FROM_RIGHT = 22;

/** Its fade out (`--duration-short`). */
const OUT_MS = 150;

export function useInfoBubble(): { readonly open: boolean; readonly id: string; readonly toggle: () => void } {
  const [open, setOpen] = useState(false);
  const id = useId();
  return { open, id, toggle: () => setOpen(value => !value) };
}

export function InfoButton({ open, bubble, onClick }: { open: boolean; bubble: string; onClick: () => void }) {
  return <IconButton icon="info" label={open ? t('Masquer l’explication') : t('Comment ça marche')} selected={open} expanded={open} controls={open ? bubble : undefined} size={20} onClick={onClick} />;
}

export function InfoBubble({ id, open, text }: { id: string; open: boolean; text: string }) {
  const { present, closing, done } = usePresence(open, OUT_MS);
  const { ref, vars } = useOutline<HTMLDivElement>('bubble');
  if (!present) return null;
  return (
    <div id={id} className={styles.bubbleWrap} style={{ '--tail-right': `${TAIL_FROM_RIGHT - 6}px` } as CSSProperties} data-closing={closing || undefined} onAnimationEnd={closing ? done : undefined}>
      <div ref={ref} className={styles.bubble} style={vars}>
        <p className="t-meta">{text}</p>
      </div>
    </div>
  );
}
