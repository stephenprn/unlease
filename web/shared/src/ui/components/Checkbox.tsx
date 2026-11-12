/**
 * The checkbox (`design/checkbox`, the phone's drawing): a box with the continuous corner, its edge
 * in the second ink while open; checked, filled in ink with the tick punched through, so whatever
 * paper it lies on shows in the tick. `recede` fills it in the second ink instead, for an item done
 * (a checklist's, a to-do, an ingredient cooked) that steps back with its words. Neutral on any
 * note colour, never matcha.
 */
import { memo } from 'react';

import { CHECK_EDGE, CHECK_EDGE_PATH, CHECK_FILL_PATH, CHECK_GRID, CHECK_VIEWBOX } from '@unlease/design/checkbox';

import styles from './controls.module.css';

export interface CheckMarkProps {
  readonly checked: boolean;
  readonly recede?: boolean;
  readonly size?: number;
  readonly className?: string;
}

/** The picture of a checkbox, for a row that is the checkbox itself (its words its label). */
function CheckMarkComponent({ checked, recede, size = CHECK_GRID, className }: CheckMarkProps) {
  return (
    <svg
      className={className ? `${styles.checkMark} ${className}` : styles.checkMark}
      data-checked={checked || undefined}
      data-recede={recede || undefined}
      width={size}
      height={size}
      viewBox={CHECK_VIEWBOX}
      aria-hidden="true"
      focusable="false"
    >
      <path className={styles.checkEdge} d={CHECK_EDGE_PATH} strokeWidth={CHECK_EDGE} />
      <path className={styles.checkFill} d={CHECK_FILL_PATH} fillRule="evenodd" />
    </svg>
  );
}

export const CheckMark = memo(CheckMarkComponent);

/** A checkbox of its own beside its words, in a 40px target with its tint on a pebble (the phone's). */
function CheckboxComponent({ checked, onToggle, label, disabled, recede, size }: { checked: boolean; onToggle: () => void; label: string; disabled?: boolean; recede?: boolean; size?: number }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} className={styles.checkbox} data-pebble-under={1} onClick={onToggle} disabled={disabled}>
      <CheckMark checked={checked} recede={recede} size={size} />
    </button>
  );
}

export const Checkbox = memo(CheckboxComponent);

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={styles.switch} onClick={() => onChange(!checked)} />;
}

/** A switch drawn inside a row that is the switch itself (its words are the label): the picture alone. */
export function SwitchMark({ checked }: { checked: boolean }) {
  return <span className={styles.switch} data-checked={checked || undefined} aria-hidden="true" />;
}
