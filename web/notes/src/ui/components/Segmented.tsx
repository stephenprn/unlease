/**
 * habits-garden's segmented control, as on the phone: pebble segments in a sunken track, the chosen
 * one matcha. The matcha pebble is one piece that slides to the segment chosen, so the choice is
 * seen moving; the tick and the inks change hands as it passes the middle of its way. A radio
 * group: arrows (and Home, End) move the choice.
 */
import { memo, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

import type { GlyphName } from '@unlease/design/glyphs';

import styles from './controls.module.css';
import { Icon } from './Icon';

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly icon?: GlyphName;
}

export interface SegmentedProps<T extends string> {
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** The group's accessible name. */
  readonly label: string;
  /** While a change is on its way (a server saving it): the choice holds still, and keeps its focus. */
  readonly disabled?: boolean;
}

/** Half the pebble's slide (`--duration-medium`): the tick and the inks change hands there. */
const HALFWAY_MS = 125;

const STEPS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

function SegmentedComponent<T extends string>({ options, value, onChange, label, disabled = false }: SegmentedProps<T>) {
  const group = useRef<HTMLDivElement>(null);
  const chosen = Math.max(0, options.findIndex(option => option.value === value));
  const [drawn, setDrawn] = useState(chosen);
  useEffect(() => {
    if (drawn === chosen) return;
    const timer = setTimeout(() => setDrawn(chosen), HALFWAY_MS);
    return () => clearTimeout(timer);
  }, [chosen, drawn]);

  const choose = (index: number): void => {
    const next = options[index];
    if (!next) return;
    if (next.value !== value) onChange(next.value);
    group.current?.querySelector<HTMLButtonElement>(`[data-value='${next.value}']`)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = STEPS[event.key];
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : step ? (chosen + step + options.length) % options.length : null;
    if (index === null) return;
    event.preventDefault();
    if (!disabled) choose(index);
  };

  return (
    <div
      ref={group}
      className={styles.segmented}
      style={{ '--segments': options.length, '--at': chosen } as CSSProperties}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
    >
      <span className={styles.segmentPebble} aria-hidden="true" />
      {options.map((option, index) => {
        const shown = index === drawn;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={index === chosen}
            tabIndex={index === chosen ? 0 : -1}
            data-value={option.value}
            data-shown={shown || undefined}
            className={`${styles.segment} t-label`}
            onClick={() => !disabled && choose(index)}
          >
            {shown ? <Icon name="check" size={18} /> : option.icon ? <Icon name={option.icon} size={18} /> : null}
            <span className={styles.segmentLabel}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export const Segmented = memo(SegmentedComponent) as typeof SegmentedComponent;
