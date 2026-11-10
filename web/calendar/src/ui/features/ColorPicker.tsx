/**
 * A colour among the palette's pigments (a label's, a calendar's, an event's), as Carnet's pickers
 * draw it: pebbles of painted paper, the chosen one ringed in ink and ticked. An event may also take
 * none of its own (its labels' colour): a pebble drawn by its edge with the label's tag. A radio
 * group: arrows move the choice, Tab leaves it.
 */
import { memo, useRef, type KeyboardEvent } from 'react';

import { LINE_COLORS, LINE_COLOR_NAMES, type LineColor } from '@unlease/design/colors';
import { pebbleTurn } from '@unlease/design/pebbles';

import { Icon } from '@shared/ui/components/Icon';
import { PebbleEdge } from '@shared/ui/components/Outline';
import styles from '../calendar.module.css';

interface ColorPickerProps<Empty extends boolean> {
  readonly value: Empty extends true ? LineColor | null : LineColor;
  readonly onChange: (color: Empty extends true ? LineColor | null : LineColor) => void;
  readonly label: string;
  /** The words of « none of its own », when that is a choice. */
  readonly none?: Empty extends true ? string : undefined;
}

function ColorPickerComponent<Empty extends boolean = false>({ value, onChange, label, none }: ColorPickerProps<Empty>) {
  const group = useRef<HTMLDivElement>(null);
  const choices: (LineColor | null)[] = none ? [null, ...LINE_COLORS] : [...LINE_COLORS];
  const change = onChange as (color: LineColor | null) => void;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = choices[(Math.max(0, choices.indexOf(value)) + step + choices.length) % choices.length]!;
    change(next);
    group.current?.querySelector<HTMLButtonElement>(`[data-color='${next ?? 'none'}']`)?.focus();
  };
  return (
    <div ref={group} className={styles.swatches} data-count={choices.length} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {choices.map((color, index) => {
        const selected = color === value;
        const name = color ? LINE_COLOR_NAMES[color] : none!;
        return (
          <button
            key={color ?? 'none'}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={name}
            data-tip={name}
            data-color={color ?? 'none'}
            data-line={color ?? undefined}
            data-none={color ? undefined : ''}
            tabIndex={selected ? 0 : -1}
            className={styles.colorPebble}
            data-pebble-under={pebbleTurn(index + 1)}
            data-still
            onClick={() => change(color)}
          >
            <PebbleEdge turn={pebbleTurn(index + 1)} />
            {selected ? <Icon name="check" size={18} /> : color ? null : <Icon name="tag" size={18} />}
          </button>
        );
      })}
    </div>
  );
}

export const ColorPicker = memo(ColorPickerComponent) as typeof ColorPickerComponent;
