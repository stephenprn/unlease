/**
 * A collection's cut-out: its emblem in its gouache (`design/emblems`),
 * flat on the paper. It always does a job: it names, opens or receives a
 * collection, never decorates.
 */
import { memo, type CSSProperties } from 'react';

import { emblemShape, type CollectionEmblem } from '@unlease/design/emblems';
import { pebbleTurnOf } from '@unlease/design/pebbles';
import type { LineColor } from '@unlease/design/colors';

import styles from './marks.module.css';

export interface EmblemProps {
  readonly emblem: CollectionEmblem;
  readonly color: LineColor | null;
  readonly size?: number;
  readonly className?: string;
}

function EmblemComponent({ emblem, color, size = 28, className }: EmblemProps) {
  const { d, rule } = emblemShape(emblem);
  return (
    <svg className={[styles.emblem, className ?? ''].join(' ')} data-line={color ?? 'grey'} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path d={d} fill="var(--fill)" fillRule={rule} />
    </svg>
  );
}

export const Emblem = memo(EmblemComponent);

export interface EmblemStoneProps extends EmblemProps {
  /** Whose stone: the collection's id, so it is the same stone wherever the collection shows. */
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

/**
 * A collection's emblem lying on its stone: the brand's pebble in the collection's wash, turned
 * the collection's own way, as the mark's card lies on its pebble. Identity, never decoration.
 */
function EmblemStoneComponent({ id, emblem, color, size = 22, width, height, className }: EmblemStoneProps) {
  return (
    <span className={[styles.stone, className ?? ''].join(' ')} data-line={color ?? 'grey'} data-pebble-under={pebbleTurnOf(id)} data-still style={{ width, height } as CSSProperties}>
      <Emblem emblem={emblem} color={color} size={size} />
    </span>
  );
}

export const EmblemStone = memo(EmblemStoneComponent);
