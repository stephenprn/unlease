/**
 * A saved timer, as an alarm's card (the phone's `SavedTimerCard`): its length large, its label over
 * what it rings with (« En cours » in link ink while one of it runs here), and at its end the start
 * button, the primary's pebble holding the start glyph: one click starts it, the card itself opens
 * its form.
 */
import { memo } from 'react';

import { t } from '@unlease/core/i18n';
import type { Timer } from '@unlease/clock/models/timer';
import { lengthSentence, lengthWords } from '@unlease/clock/services/timers';

import { Icon } from '@shared/ui/components/Icon';
import { OutlinedBox } from '@shared/ui/components/Outline';
import styles from '../../clock.module.css';
import tools from '../tools.module.css';
import { LengthFigure } from './LengthFigure';

interface Props {
  readonly timer: Timer;
  /** How many runs of it are under way here. */
  readonly running: number;
  readonly onOpen: (id: string) => void;
  readonly onStart: (timer: Timer) => void;
}

function SavedTimerCardComponent({ timer, running, onOpen, onStart }: Props) {
  const label = timer.label.trim();
  const length = lengthWords(timer.seconds);
  const name = label || length;
  return (
    <li>
      <OutlinedBox kind="card" lift="card" className={`${styles.row} ${tools.savedRow} paper`}>
        <button type="button" className={styles.rowOpen} onClick={() => onOpen(timer.id)} aria-label={[label, lengthSentence(timer.seconds), running > 0 ? t('Under way') : ''].filter(Boolean).join(', ')}>
          <span className={`${styles.rowTime} ${tools.length}`}>
            <LengthFigure seconds={timer.seconds} size={30} />
          </span>
          <span className={styles.rowWords}>
            {label ? <span className={`${styles.rowName} t-body-strong`}>{label}</span> : null}
            {running > 0 ? (
              <span className={`${styles.rowDays} t-meta`} data-running>
                {t('Under way')}
              </span>
            ) : null}
          </span>
        </button>
        <button type="button" className={tools.start} data-pebble-under={2} aria-label={t('Start {name}', { name })} data-tip={t('Start {name}', { name })} onClick={() => onStart(timer)}>
          <Icon name="go" size={24} />
        </button>
      </OutlinedBox>
    </li>
  );
}

export const SavedTimerCard = memo(SavedTimerCardComponent);
