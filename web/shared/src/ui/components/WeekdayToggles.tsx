/**
 * The days of a week, each turned on or off: seven square toggles in the week's order (from
 * `weekStart`), each its day's letter, its name read out and shown on hover. A day on lies on the
 * primary's wash within the primary's edge; off, the control's edge on the field's veil. Clock's
 * alarm days and Agenda's working days; the phone's twin is `mobile/shared`'s `WeekdayToggles`.
 */
import { t } from '@unlease/core/i18n';
import { weekdayNames } from '@unlease/core/services/format';
import styles from './WeekdayToggles.module.css';

/** The week's days from `weekStart` (1 Monday: 1 2 3 4 5 6 0). */
const weekOrder = (weekStart: number): number[] => Array.from({ length: 7 }, (_, index) => (weekStart + index) % 7);

export interface WeekdayTogglesProps {
  readonly days: readonly number[];
  /** 0 Sunday, 1 Monday, 6 Saturday. */
  readonly weekStart: number;
  /** The days, each once, sorted. */
  readonly onChange: (days: number[]) => void;
  readonly disabled?: boolean;
  /** What the group is read out as (« Jours », « Jours travaillés »). */
  readonly label?: string;
}

export function WeekdayToggles({ days, weekStart, onChange, disabled = false, label }: WeekdayTogglesProps) {
  const names = weekdayNames();
  const toggle = (day: number): void => onChange((days.includes(day) ? days.filter(each => each !== day) : [...days, day]).sort((a, b) => a - b));
  return (
    <div role="group" aria-label={label ?? t('Days')} className={styles.days}>
      {weekOrder(weekStart).map(day => (
        <button key={day} type="button" aria-pressed={days.includes(day)} aria-label={names[day]} data-tip={names[day]} className={styles.day} disabled={disabled} onClick={() => toggle(day)}>
          {names[day]!.charAt(0).toLocaleUpperCase()}
        </button>
      ))}
    </div>
  );
}
