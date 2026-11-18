/**
 * A world clock, as an alarm's card (the phone's `CityCard`): its time large (in the accent's ink
 * while the ruler points away from now), the city's name over « Demain · +8 h », and the sun or the
 * moon as it is there (dusk: the sun, faint). A click opens it (rename, remove). A screen reader
 * hears it as one sentence.
 */
import { memo } from 'react';

import type { WorldClock } from '@unlease/clock/models/worldClock';
import { cityMeta, clockIn, clockSentence, daylight } from '@unlease/clock/services/worldClocks';

import { Icon } from '@shared/ui/components/Icon';
import { OutlinedBox } from '@shared/ui/components/Outline';
import styles from '../../clock.module.css';
import tools from '../tools.module.css';

interface Props {
  readonly clock: WorldClock;
  /** The moment shown: now, or where the ruler points. */
  readonly at: number;
  readonly shifted: boolean;
  readonly twelveHours: boolean;
  readonly onOpen: (id: string) => void;
}

function CityCardComponent({ clock, at, shifted, twelveHours, onOpen }: Props) {
  const sky = daylight(clock, at);
  return (
    <li>
      <OutlinedBox kind="card" lift="card" className={`${styles.row} ${tools.cityRow} paper`} data-sky={sky}>
        <button type="button" className={styles.rowOpen} onClick={() => onOpen(clock.id)} aria-label={clockSentence(clock, at, twelveHours)}>
          <span className={`${styles.rowTime} ${tools.cityTime} t-display`} data-shifted={shifted || undefined}>
            {clockIn(clock.zone, at, twelveHours)}
          </span>
          <span className={styles.rowWords}>
            <span className={`${styles.rowName} t-body-strong`}>{clock.name}</span>
            <span className={`${styles.rowDays} ${tools.tabular} t-meta`}>{cityMeta(clock.zone, at)}</span>
          </span>
          <span className={tools.sky} data-sky={sky}>
            <Icon name={sky === 'night' ? 'moon' : 'sun'} size={22} />
          </span>
        </button>
      </OutlinedBox>
    </li>
  );
}

export const CityCard = memo(CityCardComponent);
