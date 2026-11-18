/**
 * The week of mornings (the phone's twin, `mobile/clock/src/ui/features/home/WeekStrip.tsx`): seven
 * days from today, each its weekday, its date, the time that rings that morning or a dash, and a dot
 * when an event starts that day (Safran when it comes too soon after the alarm). The chosen morning
 * lies on the primary's wash; today's date is in the accent's ink. ← and → move between mornings.
 */
import { memo, useRef, type KeyboardEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { longDay, shortWeekday } from '@unlease/calendar/services/eventText';
import { partsOf, weekdayOf } from '@unlease/calendar/services/time';
import type { Morning } from '@unlease/clock/services/week';
import { alarmClock } from '@unlease/clock/services/words';
import { Icon } from '@shared/ui/components/Icon';

import styles from './home.module.css';

interface Props {
  readonly week: readonly Morning[];
  readonly chosen: string;
  readonly today: string;
  /** Today's ring already gone by reads in the second ink. */
  readonly now: number;
  readonly twelveHours: boolean;
  readonly onChoose: (day: string) => void;
}

export const WeekStrip = memo(function WeekStrip({ week, chosen, today, now, twelveHours, onChoose }: Props) {
  const strip = useRef<HTMLDivElement>(null);
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    // ← and → a day at a time; Home and End to the week's ends, as every row of tabs.
    const target = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? week.length - 1 : null;
    if (target === null) return;
    const next = week[target];
    if (!next) return;
    event.preventDefault();
    onChoose(next.day);
    strip.current?.querySelectorAll('button')[target]?.focus();
  };
  return (
    <div ref={strip} className={styles.strip} role="tablist" aria-label={t('The week’s mornings')}>
      {week.map((morning, index) => {
        const isChosen = morning.day === chosen;
        const time = morning.waking ? alarmClock(morning.waking.alarm.time, twelveHours) : null;
        const gone = morning.waking !== null && morning.waking.at <= now;
        const clash = morning.clash !== null;
        const dot = morning.events > 0 ? 'events' : undefined;
        const label = [longDay(morning.day), time ? t('Alarm at {time}', { time }) : t('No alarm'), morning.clash ? t('An event too soon after the alarm') : morning.events > 0 ? plural(morning.events, 'event') : '']
          .filter(Boolean)
          .join(', ');
        return (
          <button
            key={morning.day}
            type="button"
            role="tab"
            aria-selected={isChosen}
            tabIndex={isChosen ? 0 : -1}
            aria-label={label}
            className={styles.day}
            data-chosen={isChosen ? '' : undefined}
            data-today={morning.day === today ? '' : undefined}
            data-clash={clash ? '' : undefined}
            onClick={() => onChoose(morning.day)}
            onKeyDown={event => move(event, index)}
          >
            <span className={`${styles.weekday} t-label-small`}>{shortWeekday(weekdayOf(morning.day))}</span>
            <span className={`${styles.date} t-title`}>{partsOf(morning.day).day}</span>
            <span className={`${styles.ring} t-meta`} data-none={time ? undefined : ''} data-gone={gone ? '' : undefined}>
              {time ?? '—'}
            </span>
            {clash ? <Icon name="alert" size={12} className={styles.mark} /> : <span className={styles.dot} data-dot={dot} aria-hidden />}
          </button>
        );
      })}
    </div>
  );
});
