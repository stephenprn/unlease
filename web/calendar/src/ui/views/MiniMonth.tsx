/**
 * A month in small, as the navigation's calendar and the year's twelve: its weeks from the week's
 * first day, the days with something dotted, today's number on the pebble, the days shown marked
 * (every day's hover and mark lie on its own pebble, a little inside its cell). With arrows to step
 * through the months it always shows six weeks, so nothing under it moves from a month to the next.
 *
 * Its days are one stop of the keyboard's Tab (the day shown, else today, else the 1st): the arrows
 * move by a day or a week, Home and End to the week's ends, past the grid into the next month.
 */
import { memo, useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { pebbleTurn } from '@unlease/design/pebbles';
import { longDay, monthTitle, narrowWeekday } from '@unlease/calendar/services/eventText';
import { addDays, monthGrid, partsOf, startOfMonth, weekdayOf } from '@unlease/calendar/services/time';

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

/** The weeks a month stepped through always shows: the most a month takes. */
const STEADY_WEEKS = 6;

/** How far each key moves the day with focus; Home and End are counted from its place in the week. */
const STEPS: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

function MiniMonthComponent({ month, weekStart, today, busy, shown, onPick, onTitle, onStep }: MiniMonthProps) {
  const first = startOfMonth(month);
  const weeks = monthGrid(first, weekStart);
  // A month that is stepped through keeps six weeks, as Google's: what lies under it (the navigation's rows, a popover's foot) never moves as the months turn.
  if (onStep) while (weeks.length < STEADY_WEEKS) weeks.push(Array.from({ length: 7 }, (_, index) => addDays(weeks[weeks.length - 1]![6]!, index + 1)));
  const title = monthTitle(first);
  const days = weeks.flat();
  const inMonth = (day: string): boolean => day.slice(0, 7) === first.slice(0, 7);
  // The one day Tab stops on: the one last moved to, else the first shown this month, else today, else the 1st.
  const [cursor, setCursor] = useState<string | null>(null);
  const stop = cursor && days.includes(cursor) ? cursor : (days.find(day => inMonth(day) && shown?.has(day)) ?? (inMonth(today) ? today : first));
  const grid = useRef<HTMLDivElement>(null);
  const focusNext = useRef<string | null>(null);
  // A day moved to by a key takes focus once drawn (the month turned first when it lay beyond the grid).
  useEffect(() => {
    const day = focusNext.current;
    if (!day) return;
    const button = grid.current?.querySelector<HTMLElement>(`[data-day="${day}"]`);
    if (!button) return;
    focusNext.current = null;
    button.focus();
  });
  const onDayKey = (event: KeyboardEvent<HTMLButtonElement>, day: string): void => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const index = days.indexOf(day);
    const step = event.key === 'Home' ? -(index % 7) : event.key === 'End' ? 6 - (index % 7) : STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = addDays(day, step);
    if (!days.includes(next)) {
      if (!onStep) return;
      onStep(next < day ? -1 : 1);
    }
    setCursor(next);
    focusNext.current = next;
    // Within the grid nothing redraws for a move alone: focus it now.
    grid.current?.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus();
  };
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
      <div ref={grid} className={styles.miniGrid} role="group" aria-label={title}>
        {weeks[0]!.map(day => (
          <span key={`h${day}`} className={styles.miniWeekday} aria-hidden="true">
            {narrowWeekday(weekdayOf(day))}
          </span>
        ))}
        {days.map(day => {
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
              data-day={day}
              tabIndex={day === stop ? 0 : -1}
              onKeyDown={event => onDayKey(event, day)}
              onFocus={() => setCursor(day)}
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
