/**
 * The month, as Google draws it: whole weeks from the week's first day, each day its number (today's
 * on the pebble), all-day and multi-day events as bars across the days, timed ones as a dot and a
 * line, « +2 » for what does not fit (it opens the day). A press on a day makes an all-day event
 * there; one's own event is dragged to another day.
 */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { pebbleTurn } from '@unlease/design/pebbles';
import { keepWeekdays, narrowWeekday, shortDay, shortWeekday, weekNumberShort, weekNumberWords } from '@unlease/calendar/services/eventText';
import { layoutBars, type BarRow } from '@unlease/calendar/services/layout';
import type { Occurrence } from '@unlease/calendar/services/occurrences';
import { addDays, daysBetween, monthGrid, partsOf, weekdayOf } from '@unlease/calendar/services/time';

import { useColorOf } from '../../app/hooks/useItems';
import { anchorOf, openPeek, openQuick } from '../../app/store/calendarUi';
import { usePrefsStore, useShownWeekdays } from '../../app/store/prefs';
import { useScrollEdgesOn } from '@shared/ui/components/scrollEdges';
import { navigate } from '@shared/ui/router';
import { NARROW, useMedia } from '@shared/ui/useMedia';
import styles from '../calendar.module.css';
import { paths } from '../routes';
import { Chip } from './Chip';
import { commitMove, DRAG_SLOP, movable, shiftedTimes } from './drag';

/** A month's lanes are 22 apart, the first under the day's number (32 from the row's top). */
const LANE_PX = 22;
const BARS_TOP = 32;
/** Lanes a row holds before it is measured (a test, the first frame): three bars, « +N » under them. */
const UNMEASURED_LANES = 4;

/** How many lanes (a bar, or « +N ») a week's row this tall holds, the last one's foot 3 off the row's line (its 1 and 2 clear). */
export function lanesFor(rowHeight: number): number {
  return Math.max(1, Math.floor((rowHeight - BARS_TOP - 2) / LANE_PX));
}

/**
 * A week's bars in its `lanes`: every one while they fit; where a day holds more, its last lane is
 * « +N »'s (a bar there across several days gives way on all of them, and each counts it).
 */
export function fitBars(items: readonly Occurrence[], week: readonly string[], lanes: number): BarRow {
  const full = layoutBars(items, week, { timed: true, maxLanes: lanes });
  if (full.hidden.every(count => count === 0)) return full;
  const crowded = full.hidden.map(count => count > 0);
  const hidden = [...full.hidden];
  const bars = full.bars.filter(bar => {
    const columns = Array.from({ length: bar.span }, (_, index) => bar.column + index);
    if (bar.lane !== lanes - 1 || !columns.some(column => crowded[column])) return true;
    for (const column of columns) hidden[column]! += 1;
    return false;
  });
  return { bars, lanes: Math.min(full.lanes, lanes), hidden };
}

export function MonthView({ day, items, today }: { day: string; items: readonly Occurrence[]; today: string }) {
  const weekStart = usePrefsStore(s => s.weekStart);
  const weekdays = useShownWeekdays();
  const twelveHours = usePrefsStore(s => s.twelveHours);
  const weekNumbers = usePrefsStore(s => s.weekNumbers);
  const narrow = useMedia(NARROW);
  // The weekdays' heads keep their rule over the weeks; past the panel's foot (a short window) the weeks fade, as far as they run on.
  const monthRef = useRef<HTMLDivElement>(null);
  useScrollEdgesOn(monthRef, [], { fade: 'bottom' });
  // The lanes a row has room for, from its height (the window's): « +N » always inside its day.
  const [rowHeight, setRowHeight] = useState<number | null>(null);
  const colorOf = useColorOf();
  const dragged = useRef(false);
  const [over, setOver] = useState<string | null>(null);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  // « Jours travaillés seulement »: each week without the days not worked.
  const weeks = useMemo(() => monthGrid(day, weekStart).map(week => keepWeekdays(week, weekdays)), [day, weekStart, weekdays]);
  const month = day.slice(0, 7);
  const lanes = rowHeight === null ? UNMEASURED_LANES : lanesFor(rowHeight);
  const rows = useMemo(() => weeks.map(week => fitBars(items, week, lanes)), [weeks, items, lanes]);

  useLayoutEffect(() => {
    const month = monthRef.current;
    if (!month || typeof ResizeObserver === 'undefined') return undefined;
    const measure = (): void => {
      const row = month.firstElementChild;
      if (row) setRowHeight(row.getBoundingClientRect().height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(month);
    return () => observer.disconnect();
  }, [weeks.length]);

  const open = (item: Occurrence, element: HTMLElement): void => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    openPeek(item.key, anchorOf(element));
  };

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>, item: Occurrence): void => {
    if (event.button !== 0 || !movable(item)) return;
    const origin = { x: event.clientX, y: event.clientY };
    const from = (document.elementFromPoint?.(event.clientX, event.clientY)?.closest('[data-day]') as HTMLElement | null)?.dataset.day ?? item.firstDay;
    let moved = false;
    let target: string | null = null;
    const move = (next: PointerEvent): void => {
      if (!moved && Math.hypot(next.clientX - origin.x, next.clientY - origin.y) < DRAG_SLOP) return;
      moved = true;
      setDraggedKey(item.key);
      target = (document.elementFromPoint?.(next.clientX, next.clientY)?.closest('[data-day]') as HTMLElement | null)?.dataset.day ?? null;
      setOver(target);
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setOver(null);
      setDraggedKey(null);
      if (!moved) return;
      dragged.current = true;
      setTimeout(() => {
        dragged.current = false;
      }, 0);
      if (target) void commitMove(item, shiftedTimes(item, daysBetween(from, target), 0));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const create = (cell: HTMLElement, at: string): void => openQuick({ start: at, end: addDays(at, 1), anchor: anchorOf(cell) });
  const columns = weeks[0]?.length ?? 7;

  return (
    <div className={`${styles.frame} paper`} data-outline="panel" style={{ '--days': columns } as CSSProperties}>
      <div className={styles.monthHeads} aria-hidden="true">
        {weeks[0]!.map(each => (
          <span key={each}>{narrow ? narrowWeekday(weekdayOf(each)) : shortWeekday(weekdayOf(each))}</span>
        ))}
      </div>
      <div ref={monthRef} className={styles.month} style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(96px, 1fr))` }}>
        {weeks.map((week, row) => {
          const layout = rows[row]!;
          return (
            <div key={week[0]} className={styles.week}>
              {/* Its ISO number at the row's start, as the phone's month and both clients' days write it. */}
              {weekNumbers ? (
                <span className={`${styles.monthWeek} tabular`} title={weekNumberWords(week[0]!)}>
                  {weekNumberShort(week[0]!)}
                </span>
              ) : null}
              {week.map(each => {
                const isToday = each === today;
                return (
                  <div
                    key={each}
                    className={styles.cell}
                    data-day={each}
                    data-outside={each.slice(0, 7) !== month || undefined}
                    data-over={over === each || undefined}
                    onClick={event => {
                      if (event.target === event.currentTarget) create(event.currentTarget, each);
                    }}
                  >
                    <div className={styles.cellHead}>
                      <button
                        type="button"
                        className={styles.cellDay}
                        data-today={isToday || undefined}
                        data-pebble-under={isToday ? pebbleTurn(partsOf(each).day) : undefined}
                        aria-label={t('See {day}', { day: each })}
                        onClick={() => navigate(paths.view('day', each))}
                      >
                        {partsOf(each).day === 1 ? shortDay(each) : partsOf(each).day}
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className={styles.weekBars}>
                {layout.bars.map(bar => (
                  <div
                    key={bar.occurrence.key}
                    className={styles.bar}
                    style={{ top: bar.lane * LANE_PX, left: `${(bar.column / columns) * 100}%`, width: `calc(${(bar.span / columns) * 100}% - 4px)` }}
                  >
                    <Chip
                      item={bar.occurrence}
                      color={colorOf(bar.occurrence)}
                      variant={bar.occurrence.allDay || bar.span > 1 ? 'bar' : 'dot'}
                      twelveHours={twelveHours}
                      // A phone-sized window's day is a few letters wide: its title, not its time.
                      showTime={!narrow}
                      dragging={draggedKey === bar.occurrence.key}
                      onOpen={open}
                      onPointerDown={startDrag}
                    />
                  </div>
                ))}
                {layout.hidden.map((count, column) =>
                  count > 0 ? (
                    <button
                      key={column}
                      type="button"
                      className={styles.more}
                      style={{ top: (lanes - 1) * LANE_PX, left: `${(column / columns) * 100}%` }}
                      onClick={() => navigate(paths.view('day', week[column]!))}
                      aria-label={t('{count} more on {day}', { count, day: week[column]! })}
                    >
                      {t('+{count}', { count })}
                    </button>
                  ) : null,
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
