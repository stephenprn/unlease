/**
 * Done is a stamp, not a disappearance: a link marked bought, watched or
 * visited keeps its place at the foot of its line, punched with a tilted ink
 * stamp that says what was done and when, as a ticket is validated rather than
 * thrown away. The words are the phone's (`ui/components/Stamp.tsx`).
 */
import { memo } from 'react';

import { t, tc } from '@unlease/core/i18n';
import type { LinkKind } from '@unlease/notes/models/entities';

import styles from '@shared/ui/components/marks.module.css';

export function stampWord(kind: LinkKind): string {
  switch (kind) {
    case 'product':
      return t('Bought');
    case 'film':
    case 'series':
    case 'video':
      return t('Watched');
    case 'book':
    case 'article':
      return t('Read');
    case 'music':
      return t('Heard');
    case 'game':
      return t('Played');
    case 'restaurant':
    case 'place':
    case 'event':
      return t('Visited');
    case 'recipe':
      return t('Cooked');
    default:
      return tc('ticked', 'Done');
  }
}

function StampComponent({ kind, date, className }: { kind: LinkKind; date: string; className?: string }) {
  return (
    <span className={[styles.stamp, className ?? ''].join(' ')} role="img" aria-label={t('{stamp} on {date}', { stamp: stampWord(kind), date })}>
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
