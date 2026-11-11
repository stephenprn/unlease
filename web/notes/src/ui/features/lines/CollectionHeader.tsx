/**
 * A collection's page head: its emblem cut large and pinned at a slant, its name, the sentence
 * Claude files by, and what it holds. The same emblem, washed and huge, bleeds off the wall behind
 * and fades out toward its foot. It spans the whole page width, so the washed emblem leaves by the
 * screen's edge, not the column's. Each time a collection opens, its ghost is laid down as an empty
 * state's cut-out is (`GHOST_ENTRANCE`): it drifts in from beyond its corner and turns into its slant
 * as it fades up to its wash.
 */
import { memo, type CSSProperties, type ReactNode } from 'react';

import { COLLAGE_LAY, GHOST_ENTRANCE } from '@unlease/design/collage';
import type { CollectionEmblem } from '@unlease/design/emblems';
import type { LineColor } from '@unlease/design/colors';

import { Emblem, EmblemStone } from '@shared/ui/components/Emblem';
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

/** Where the ghost starts as it is laid, read by `.ghost`'s arrival. */
const GHOST_LAY = {
  '--ghost-dx': `${GHOST_ENTRANCE.dx}px`,
  '--ghost-dy': `${GHOST_ENTRANCE.dy}px`,
  '--ghost-turn': `${GHOST_ENTRANCE.turn}deg`,
  '--ghost-from': GHOST_ENTRANCE.scale,
  '--ghost-duration': `${COLLAGE_LAY}ms`,
} as CSSProperties;

function CollectionHeaderComponent({ title, emblem, color, id, hint, meta, actions }: CollectionHeaderProps) {
  return (
    <header className={styles.head} style={GHOST_LAY}>
      {/* Keyed by the collection: another one opened lays its own down, a re-render never replays it. */}
      <Emblem key={id} emblem={emblem} color={color} size={520} className={styles.ghost} />
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
