/**
 * A label's gouache, as Carnet's pickers draw it: pebbles of painted paper, the chosen one ringed in
 * ink and ticked. A radio group: arrows move the choice, Tab leaves it.
 */
import { memo, useRef, type KeyboardEvent } from 'react';

import { LINE_COLORS, LINE_COLOR_NAMES, type LineColor } from '@unlease/design/colors';
import { pebbleTurn } from '@unlease/design/pebbles';

import { Icon } from '@shared/ui/components/Icon';
import { PebbleEdge } from '@shared/ui/components/Outline';
import styles from '../contacts.module.css';

function LabelColorPickerComponent({ value, onChange, label }: { value: LineColor; onChange: (color: LineColor) => void; label: string }) {
  const group = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = LINE_COLORS[(Math.max(0, LINE_COLORS.indexOf(value)) + step + LINE_COLORS.length) % LINE_COLORS.length]!;
    onChange(next);
    group.current?.querySelector<HTMLButtonElement>(`[data-color='${next}']`)?.focus();
  };
  return (
    <div ref={group} className={styles.swatches} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {LINE_COLORS.map((color, index) => {
        const selected = color === value;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={LINE_COLOR_NAMES[color]}
            data-tip={LINE_COLOR_NAMES[color]}
            data-color={color}
            data-line={color}
            tabIndex={selected ? 0 : -1}
            className={styles.swatch}
            data-pebble-under={pebbleTurn(index + 1)}
            data-still
            onClick={() => onChange(color)}
          >
            <PebbleEdge turn={pebbleTurn(index + 1)} />
            {selected ? <Icon name="check" size={18} /> : null}
          </button>
        );
      })}
    </div>
  );
}

export const LabelColorPicker = memo(LabelColorPickerComponent);
