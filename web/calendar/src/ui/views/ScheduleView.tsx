/**
 * The planning, Google's « Planning »: the days ahead that hold something, each with its events in
 * order (their hours, their colour, their title and place), « Afficher plus » going further while
 * something lies further; nothing on these days, the view's empty state, centred, alone. What is
 * over lies back, as in « Ma journée »; on a phone-sized window each title is over its time and
 * place, as the phone's rows. An event not over whose place a map can find has « Y aller » at its
 * end (`DirectionsButton`).
 */
import { useMemo, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { longDay, shortMonth, shortWeekday, timeRange } from '@unlease/calendar/services/eventText';
import { directionsTo } from '@unlease/calendar/services/links';
import { onDay, type Occurrence } from '@unlease/calendar/services/occurrences';
import { addDays, daysBetween, partsOf, weekdayOf } from '@unlease/calendar/services/time';

import { useColorOf, useItems } from '../../app/hooks/useItems';
import { useNow } from '../../app/hooks/useToday';
import { anchorOf, openPeek } from '../../app/store/calendarUi';
import { usePrefsStore } from '../../app/store/prefs';
import { Button } from '@shared/ui/components/Button';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { useScrollEdges } from '@shared/ui/components/scrollEdges';
import { NARROW, useMedia } from '@shared/ui/useMedia';
import { DirectionsButton } from '../features/PlaceAndLink';
import styles from '../calendar.module.css';

/** Days a page of the planning reaches; « Afficher plus » adds as many. */
const SPAN = 30;

/** How far past the days shown « Afficher plus » looks for something: a year, as the year's view reads. */
const LOOK_AHEAD = 365;

export function ScheduleView({ day, today }: { day: string; today: string }) {
  const [span, setSpan] = useState(SPAN);
  const end = addDays(day, span);
  const items = useItems(day, end);
  // The first day past those shown that holds something, looked for only under a list (never under
  // the empty state); none within the year, nothing more to show.
  const later = useItems(end, items.length > 0 ? addDays(end, LOOK_AHEAD) : end);
  const next = useMemo(() => (later.length > 0 ? later.reduce((first, item) => (item.firstDay < first ? item.firstDay : first), later[0]!.firstDay) : null), [later]);
  // « Afficher plus » reaches that day and a page after it, so what it shows is never only empty days.
  const more = next ? () => setSpan(Math.max(span, daysBetween(day, next)) + SPAN) : undefined;
  return <ScheduleList from={day} days={span} items={items} today={today} onMore={more} />;
}

/** Days and their events, in order; also the search's results. */
export function ScheduleList({ from, days, items, today, onMore }: { from: string; days: number; items: readonly Occurrence[]; today: string; onMore?: () => void }) {
  const twelveHours = usePrefsStore(s => s.twelveHours);
  const colorOf = useColorOf();
  const { now } = useNow();
  const narrow = useMedia(NARROW);
  // Days past the panel's top or foot fade there, as far as they run on.
  const scheduleEdges = useScrollEdges({ fade: 'y' });
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
      <div ref={scheduleEdges} className={styles.schedule}>
        {groups.length === 0 ? (
          // The view's empty place, centred in it as « Ma journée »'s is.
          <div className={styles.scheduleEmpty}>
            <EmptyState scene="reminders" title={t('Nothing planned')} text={t('No events on these days. “Create” adds one.')} />
          </div>
        ) : null}
        {groups.map(group => (
          <section key={group.day} className={styles.scheduleDay} aria-label={longDay(group.day)}>
            {/* « lun. 16 nov. », the day's number the line's weight. */}
            <div className={styles.scheduleDate} data-today={group.day === today || undefined} aria-hidden="true">
              <span className="t-meta">{shortWeekday(weekdayOf(group.day))}</span>
              <strong className="tabular">{partsOf(group.day).day}</strong>
              <span className="t-meta">{shortMonth(partsOf(group.day).month)}</span>
            </div>
            <ul className={styles.scheduleItems}>
              {group.items.map(item => {
                const place = item.event.place.trim();
                const time = timeRange(item, twelveHours);
                const over = item.endAt <= now;
                const directions = over ? '' : directionsTo(place);
                return (
                  <li key={item.key} className={directions ? styles.withEnd : undefined}>
                    <button type="button" className={styles.scheduleItem} data-line={colorOf(item) ?? undefined} data-over={over || undefined} onClick={event => openPeek(item.key, anchorOf(event.currentTarget))}>
                      <span className={styles.swatch} aria-hidden="true" />
                      <span className={`${styles.scheduleTime} t-meta tabular`}>{narrow && place ? `${time} · ${place}` : time}</span>
                      <span className={`${styles.scheduleTitle} t-body`}>
                        {item.event.title.trim() || t('Untitled')}
                        {place && !narrow ? <span className={styles.muted}>{` · ${place}`}</span> : null}
                      </span>
                    </button>
                    {directions ? <DirectionsButton place={directions} compact className={styles.rowEnd} /> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {onMore && groups.length > 0 ? (
          <div className={styles.moreLater}>
            <Button kind="text" icon="arrowDown" onClick={onMore}>
              {t('Show more')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
