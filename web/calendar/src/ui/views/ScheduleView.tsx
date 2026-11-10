/**
 * The planning, Google's « Planning »: the days ahead that hold something, each with its events in
 * order (their hours, their colour, their title and place), « Afficher plus » going further.
 */
import { useMemo, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { shortMonth, shortWeekday, timeRange } from '@unlease/calendar/services/eventText';
import { onDay, type Occurrence } from '@unlease/calendar/services/occurrences';
import { addDays, partsOf, weekdayOf } from '@unlease/calendar/services/time';

import { useColorOf, useItems } from '../../app/hooks/useItems';
import { anchorOf, openPeek } from '../../app/store/calendarUi';
import { usePrefsStore } from '../../app/store/prefs';
import { Button } from '@shared/ui/components/Button';
import { EmptyState } from '@shared/ui/components/EmptyState';
import styles from '../calendar.module.css';

/** Days a page of the planning reaches; « Afficher plus » adds as many. */
const SPAN = 30;

export function ScheduleView({ day, today }: { day: string; today: string }) {
  const [span, setSpan] = useState(SPAN);
  const items = useItems(day, addDays(day, span));
  return <ScheduleList from={day} days={span} items={items} today={today} onMore={() => setSpan(span + SPAN)} />;
}

/** Days and their events, in order; also the search's results. */
export function ScheduleList({ from, days, items, today, onMore }: { from: string; days: number; items: readonly Occurrence[]; today: string; onMore?: () => void }) {
  const twelveHours = usePrefsStore(s => s.twelveHours);
  const colorOf = useColorOf();
  const groups = useMemo(() => {
    const out: { day: string; items: Occurrence[] }[] = [];
    for (let index = 0; index < days; index += 1) {
      const each = addDays(from, index);
      const held = onDay(items, each);
      if (held.length > 0) out.push({ day: each, items: held });
    }
    return out;
  }, [from, days, items]);
  return (
    <div className={`${styles.frame} paper`} data-outline="panel">
      <div className={styles.schedule}>
        {groups.length === 0 ? <EmptyState scene="reminders" title={t('Rien de prévu')} text={t('Aucun événement sur ces jours. Un clic sur « Créer » en ajoute un.')} /> : null}
        {groups.map(group => (
          <section key={group.day} className={styles.scheduleDay} aria-label={group.day}>
            <div className={styles.scheduleDate} data-today={group.day === today || undefined}>
              <strong>{partsOf(group.day).day}</strong>
              <span className="t-meta">{`${shortMonth(partsOf(group.day).month)}, ${shortWeekday(weekdayOf(group.day))}`}</span>
            </div>
            <ul className={styles.scheduleItems}>
              {group.items.map(item => (
                <li key={item.key}>
                  <button type="button" className={styles.scheduleItem} data-line={colorOf(item) ?? undefined} onClick={event => openPeek(item.key, anchorOf(event.currentTarget))}>
                    <span className={styles.swatch} aria-hidden="true" />
                    <span className="t-meta tabular">{timeRange(item, twelveHours)}</span>
                    <span className="t-body">
                      {item.event.title.trim() || t('Sans titre')}
                      {item.event.place.trim() ? <span className={styles.muted}>{` · ${item.event.place.trim()}`}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {onMore ? (
          <div className={styles.moreLater}>
            <Button kind="text" icon="arrowDown" onClick={onMore}>
              {t('Afficher plus')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
