/** The cut-outs a collection can wear, each in the collection's gouache. Arrows move the choice. */
import { memo, useRef, type KeyboardEvent } from 'react';

import { EMBLEMS, EMBLEM_NAMES, type Emblem as EmblemKey } from '@unlease/design/emblems';
import { pebbleTurn } from '@unlease/design/pebbles';
import { t } from '@unlease/core/i18n';
import type { LineColor } from '@unlease/design/colors';

import { Emblem } from '../../components/Emblem';
import { PebbleEdge } from '../../components/Outline';
import styles from './colorPicker.module.css';

export interface EmblemPickerProps {
  readonly value: EmblemKey;
  readonly color: LineColor | null;
  readonly onChange: (emblem: EmblemKey) => void;
  readonly label?: string;
}

function EmblemPickerComponent({ value, color, onChange, label = t('Emblème') }: EmblemPickerProps) {
  const group = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = EMBLEMS[(EMBLEMS.indexOf(value) + step + EMBLEMS.length) % EMBLEMS.length]!;
    onChange(next);
    group.current?.querySelector<HTMLButtonElement>(`[data-emblem='${next}']`)?.focus();
  };
  return (
    <div ref={group} className={styles.emblems} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {EMBLEMS.map((emblem, index) => {
        const selected = emblem === value;
        return (
          <button
            key={emblem}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={EMBLEM_NAMES[emblem]}
            data-tip={EMBLEM_NAMES[emblem]}
            data-emblem={emblem}
            tabIndex={selected ? 0 : -1}
            className={styles.emblemCell}
            data-pebble-under={pebbleTurn(index)}
            data-still
            onClick={() => onChange(emblem)}
          >
            <Emblem emblem={emblem} color={color} size={34} />
            <PebbleEdge turn={pebbleTurn(index)} />
          </button>
        );
      })}
    </div>
  );
}

export const EmblemPicker = memo(EmblemPickerComponent);
