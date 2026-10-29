/**
 * A collection's page head: its emblem cut large and pinned at a slant, its name, the sentence
 * Claude files by, and what it holds. The same emblem, washed and huge, bleeds off the wall behind
 * and fades out toward its foot. It spans the whole page width, so the washed emblem leaves by the
 * screen's edge, not the column's.
 */
import { memo, type ReactNode } from 'react';

import type { CollectionEmblem } from '@unlease/design/emblems';
import type { LineColor } from '@unlease/design/colors';

import { Emblem, EmblemStone } from '../../components/Emblem';
import styles from './lines.module.css';

export interface CollectionHeaderProps {
  readonly title: string;
  readonly emblem: CollectionEmblem;
  readonly color: LineColor | null;
  /** The collection's id: its stone is the same wherever it shows. */
  readonly id: string;
  readonly hint?: string;
  /** "5 liens · total 407,90 €". */
  readonly meta?: string;
  readonly actions?: ReactNode;
}

function CollectionHeaderComponent({ title, emblem, color, id, hint, meta, actions }: CollectionHeaderProps) {
  return (
    <header className={styles.head}>
      <Emblem emblem={emblem} color={color} size={520} className={styles.ghost} />
      <div className={styles.headInner}>
        <EmblemStone id={id} emblem={emblem} color={color} size={56} width={88} height={80} className={styles.headMark} />
        <div className={styles.headText}>
          <h1 className={`${styles.headTitle} t-display`}>{title}</h1>
          {hint ? <p className={`${styles.headHint} t-body`}>{hint}</p> : null}
          {meta ? <p className={`${styles.headMeta} t-meta-strong tabular`}>{meta}</p> : null}
        </div>
        {actions ? (
          <div className={styles.headActions}>
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export const CollectionHeader = memo(CollectionHeaderComponent);
