/**
 * A way through in steps, as stones on a thread (the first run's head, an import's wizard): ticked
 * on the leaf once done, the step open a matcha-wash stone holding a small leaf, those ahead a bare
 * edge; each step's name under its stone, never in it. The count is read out (« Étape 2 sur 4 »),
 * not shown: the stones show it.
 */
import type { CSSProperties } from 'react';

import { t } from '@unlease/core/i18n';
import { pebbleTurn } from '@unlease/design/pebbles';

import { Icon } from './Icon';
import { PebbleEdge } from './Outline';
import styles from './stepTrail.module.css';

export interface TrailStep {
  readonly id: string;
  /** Its short name, under its stone. */
  readonly name: string;
}

export function StepTrail({ steps, current, label, small = false }: { steps: readonly TrailStep[]; current: number; label: string; small?: boolean }) {
  return (
    <ol className={styles.trail} aria-label={label} data-size={small ? 'small' : undefined} style={{ '--steps': steps.length } as CSSProperties}>
      {steps.map((entry, position) => {
        const state = position < current ? 'done' : position === current ? 'here' : 'ahead';
        return (
          <li key={entry.id} data-state={state} aria-current={state === 'here' ? 'step' : undefined}>
            <span className={styles.stone} aria-hidden="true">
              <span className={styles.stoneFill} data-pebble={pebbleTurn(position)} data-still>
                {state === 'done' ? <Icon name="check" size={small ? 14 : 16} /> : state === 'here' ? <span className={styles.stoneLeaf} data-pebble={pebbleTurn(position + 2)} data-still /> : null}
              </span>
              {state === 'done' ? null : <PebbleEdge turn={pebbleTurn(position)} />}
            </span>
            <span className={state === 'here' ? 't-meta-strong' : 't-meta'}>
              {entry.name}
              {state === 'done' ? <span className="sr-only">{` · ${t('Fait')}`}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
