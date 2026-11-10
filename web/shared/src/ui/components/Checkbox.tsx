/** A checklist box drawn with the icon set's glyphs, announced as a checkbox. */
import { memo } from 'react';

import styles from './controls.module.css';
import { Icon } from './Icon';

function CheckboxComponent({ checked, onToggle, label, disabled, size = 20 }: { checked: boolean; onToggle: () => void; label: string; disabled?: boolean; size?: number }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} className={styles.checkbox} data-pebble-under={1} onClick={onToggle} disabled={disabled}>
      <Icon name={checked ? 'boxChecked' : 'box'} size={size} />
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
