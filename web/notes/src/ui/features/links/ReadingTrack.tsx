/** Small scissors working along a dashed cut line: a link's "being read" state. Still under reduced motion. */
import { memo, type CSSProperties } from 'react';

import { Icon } from '../../components/Icon';
import styles from './links.module.css';

const SCISSORS = 14;

function ReadingTrackComponent({ width = 72 }: { width?: number }) {
  return (
    <span className={styles.track} style={{ width, '--run': `${width - SCISSORS}px` } as CSSProperties} aria-hidden="true">
      <span className={styles.trackScissors}>
        <Icon name="scissors" size={SCISSORS} />
      </span>
    </span>
  );
}

export const ReadingTrack = memo(ReadingTrackComponent);
