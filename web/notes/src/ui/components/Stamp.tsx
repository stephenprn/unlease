/**
 * Done is a stamp, not a disappearance: a link marked bought, watched or
 * visited keeps its place at the foot of its line, punched with a tilted ink
 * stamp that says what was done and when, as a ticket is validated rather than
 * thrown away. The words are the phone's (`ui/components/Stamp.tsx`).
 */
import { memo } from 'react';

import { t } from '@unlease/core/i18n';
import type { LinkKind } from '@unlease/notes/models/entities';

import styles from './marks.module.css';

export function stampWord(kind: LinkKind): string {
  switch (kind) {
    case 'product':
      return t('Acheté');
    case 'film':
    case 'series':
    case 'video':
      return t('Vu');
    case 'book':
    case 'article':
      return t('Lu');
    case 'music':
      return t('Écouté');
    case 'game':
      return t('Joué');
    case 'restaurant':
    case 'place':
    case 'event':
      return t('Visité');
    case 'recipe':
      return t('Cuisiné');
    default:
      return t('Fait');
  }
}

function StampComponent({ kind, date, className }: { kind: LinkKind; date: string; className?: string }) {
  return (
    <span className={[styles.stamp, className ?? ''].join(' ')} role="img" aria-label={t('{stamp} le {date}', { stamp: stampWord(kind), date })}>
      <span className={styles.stampWord} aria-hidden="true">
        {stampWord(kind).toUpperCase()}
      </span>
      <span className={styles.stampDate} aria-hidden="true">
        {date}
      </span>
    </span>
  );
}

export const Stamp = memo(StampComponent);
