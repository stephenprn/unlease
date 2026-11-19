/**
 * A filter among a few (a radio group: the import's fates, Carnet's board), a chip: its name and how
 * many it keeps, on paper at the chip radius with a hairline; the one chosen on the primary's wash.
 */
import styles from './filterChip.module.css';

export interface FilterChipProps {
  readonly checked: boolean;
  readonly label: string;
  readonly count: number;
  readonly onClick: () => void;
}

export function FilterChip({ checked, label, count, onClick }: FilterChipProps) {
  return (
    <button type="button" role="radio" aria-checked={checked} className={`${styles.chip} t-label`} onClick={onClick}>
      <span>{label}</span>
      <span className={`${styles.count} tabular`}>{count}</span>
    </button>
  );
}
