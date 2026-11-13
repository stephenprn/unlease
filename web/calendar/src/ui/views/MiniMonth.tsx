/**
 * A month in small, as the navigation's calendar and the year's twelve: its weeks from the week's
 * first day, the days with something dotted, today's number on the pebble, the days shown marked
 * (every day's hover and mark lie on its own pebble, a little inside its cell).
 */
import { memo } from 'react';

import { t } from '@unlease/core/i18n';
import { pebbleTurn } from '@unlease/design/pebbles';
import { longDay, monthTitle, narrowWeekday } from '@unlease/calendar/services/eventText';
import { monthGrid, partsOf, startOfMonth, weekdayOf } from '@unlease/calendar/services/time';

import { IconButton } from '@shared/ui/components/IconButton';
import styles from '../calendar.module.css';

export interface MiniMonthProps {
  /** A day of the month shown. */
  readonly month: string;
  readonly weekStart: number;
  readonly today: string;
  /** Days with something on them. */
  readonly busy?: ReadonlySet<string>;
  /** Days the view shows. */
  readonly shown?: ReadonlySet<string>;
  readonly onPick: (day: string) => void;
  /** The title opens the month; without it, it is plain. */
  readonly onTitle?: () => void;
  /** Arrows to the months before and after. */
  readonly onStep?: (direction: 1 | -1) => void;
}

function MiniMonthComponent({ month, weekStart, today, busy, shown, onPick, onTitle, onStep }: MiniMonthProps) {
  const first = startOfMonth(month);
  const weeks = monthGrid(first, weekStart);
  const title = monthTitle(first);
  return (
    <div className={styles.mini}>
      <div className={styles.miniHead}>
        {onTitle ? (
          <button type="button" className={`${styles.miniTitle} t-body-strong`} onClick={onTitle}>
            {title}
          </button>
        ) : (
          <span className={`${styles.miniTitle} t-body-strong`}>{title}</span>
        )}
        {onStep ? (
          <>
            <IconButton icon="back" label={t('Previous month')} compact size={18} onClick={() => onStep(-1)} />
            <span style={{ transform: 'scaleX(-1)', display: 'inline-flex' }}>
              <IconButton icon="back" label={t('Next month')} compact size={18} onClick={() => onStep(1)} />
            </span>
          </>
        ) : null}
      </div>
      <div className={styles.miniGrid} role="grid" aria-label={title}>
        {weeks[0]!.map(day => (
          <span key={`h${day}`} className={styles.miniWeekday} aria-hidden="true">
            {narrowWeekday(weekdayOf(day))}
          </span>
        ))}
        {weeks.flat().map(day => {
          const outside = day.slice(0, 7) !== first.slice(0, 7);
          const isToday = day === today;
          return (
            <button
              key={day}
              type="button"
              className={styles.miniDay}
              data-outside={outside || undefined}
              data-busy={(busy?.has(day) && !isToday) || undefined}
              data-shown={(shown?.has(day) && !isToday) || undefined}
              data-today={isToday || undefined}
              data-pebble-under={pebbleTurn(partsOf(day).day)}
              aria-current={isToday ? 'date' : undefined}
              aria-label={longDay(day)}
              onClick={() => onPick(day)}
            >
              {partsOf(day).day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const MiniMonth = memo(MiniMonthComponent);
