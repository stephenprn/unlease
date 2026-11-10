/** The year: its twelve months in small, the days with something dotted; a day opens it. */
import { useMemo } from 'react';

import { dayKey } from '@unlease/calendar/services/time';
import type { Occurrence } from '@unlease/calendar/services/occurrences';
import { addDays } from '@unlease/calendar/services/time';

import { usePrefsStore } from '../../app/store/prefs';
import { navigate } from '@shared/ui/router';
import styles from '../calendar.module.css';
import { paths } from '../routes';
import { MiniMonth } from './MiniMonth';

export function YearView({ day, items, today }: { day: string; items: readonly Occurrence[]; today: string }) {
  const weekStart = usePrefsStore(s => s.weekStart);
  const year = Number(day.slice(0, 4));
  const busy = useMemo(() => {
    const out = new Set<string>();
    for (const item of items) for (let each = item.firstDay, guard = 0; each <= item.lastDay && guard < 366; each = addDays(each, 1), guard += 1) out.add(each);
    return out;
  }, [items]);
  return (
    <div className={`${styles.frame} paper`} data-outline="panel">
      <div className={styles.year}>
        {Array.from({ length: 12 }, (_, index) => {
          const month = dayKey(year, index + 1, 1);
          return <MiniMonth key={month} month={month} weekStart={weekStart} today={today} busy={busy} onPick={picked => navigate(paths.view('day', picked))} onTitle={() => navigate(paths.view('month', month))} />;
        })}
      </div>
    </div>
  );
}
