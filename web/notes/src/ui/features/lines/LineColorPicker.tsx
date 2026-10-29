/**
 * A collection's or a label's gouache, as the phone's pebbles of painted paper, the chosen one
 * ringed in ink and ticked. A radio group: arrows move the choice, Tab leaves it.
 */
import { memo, useRef, type KeyboardEvent } from 'react';

import { pebbleTurn } from '@unlease/design/pebbles';
import { t } from '@unlease/core/i18n';
import { LINE_COLORS, LINE_COLOR_NAMES, type LineColor } from '@unlease/design/colors';

import { Icon } from '../../components/Icon';
import { PebbleEdge } from '../../components/Outline';
import styles from './colorPicker.module.css';

export interface LineColorPickerProps {
  readonly value: LineColor | null;
  readonly onChange: (color: LineColor | null) => void;
  readonly allowNone?: boolean;
  readonly label: string;
}

function LineColorPickerComponent({ value, onChange, allowNone = false, label }: LineColorPickerProps) {
  const group = useRef<HTMLDivElement>(null);
  const options: (LineColor | null)[] = [...(allowNone ? [null] : []), ...LINE_COLORS];
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = Math.max(0, options.indexOf(value));
    const next = options[(index + step + options.length) % options.length] ?? null;
    onChange(next);
    group.current?.querySelector<HTMLButtonElement>(`[data-color='${next ?? 'none'}']`)?.focus();
  };
  const focusable = options.includes(value) ? value : options[0];
  return (
    <div ref={group} className={styles.grid} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((color, index) => {
        const selected = color === value;
        return (
          <button
            key={color ?? 'none'}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={color ? LINE_COLOR_NAMES[color] : t('Aucune couleur')}
            data-tip={color ? LINE_COLOR_NAMES[color] : t('Aucune couleur')}
            data-color={color ?? 'none'}
            data-line={color ?? undefined}
            tabIndex={color === focusable ? 0 : -1}
            className={[styles.swatch, color === null ? styles.none : ''].join(' ')}
            // "No colour" takes the first turn, as on the phone, so neighbours never match.
            data-pebble-under={pebbleTurn(index + (allowNone ? 0 : 1))}
            data-still
            onClick={() => onChange(color)}
          >
            <PebbleEdge turn={pebbleTurn(index + (allowNone ? 0 : 1))} />
            {selected ? <Icon name="check" size={18} /> : null}
          </button>
        );
      })}
    </div>
  );
}

export const LineColorPicker = memo(LineColorPickerComponent);
