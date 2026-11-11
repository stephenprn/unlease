/**
 * A day, three days or a week on the hours' grid, as Google draws them: the days' heads (today's
 * number on the pebble, the weather when there is one), the all-day strip (the bars of all-day and
 * multi-day events, `layoutBars`), and the hours, each day a column where overlapping events share
 * the width (`layoutDay`), the time now as a red line. A press on the grid drawn down makes an event
 * of that span (a click: one of the usual length) and opens its quick form; one's own event is
 * dragged to another time or day, or its end dragged.
 */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { pebbleTurn } from '@unlease/design/pebbles';
import { hourLabel, shortWeekday, weekNumberShort, weekNumberWords } from '@unlease/calendar/services/eventText';
import { layoutBars, layoutDay, minuteAt, minutesInDay, type TimedBox } from '@unlease/calendar/services/layout';
import type { Occurrence } from '@unlease/calendar/services/occurrences';
import { addMinutes, daysBetween, partsOf, weekdayOf } from '@unlease/calendar/services/time';
import { temperatures, weatherKind, WEATHER_WORDS } from '@unlease/calendar/services/weather';

import { useColorOf } from '../../app/hooks/useItems';
import { useWeather } from '../../app/hooks/useWeather';
import { anchorOf, openPeek, openQuick, useCalendarUi } from '../../app/store/calendarUi';
import { usePrefsStore } from '../../app/store/prefs';
import { Icon } from '@shared/ui/components/Icon';
import { useScrollEdgesOn } from '@shared/ui/components/scrollEdges';
import { navigate } from '@shared/ui/router';
import styles from '../calendar.module.css';
import { paths } from '../routes';
import { Chip } from './Chip';
import { commitMove, DRAG_SLOP, movable, resizedTimes, shiftedTimes } from './drag';

/** One hour's height, as the stylesheet's `--hour`. */
const HOUR_PX = 48;
const pad = (value: number): string => String(value).padStart(2, '0');
const clockOf = (minutes: number): string => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** A day's minute as a time of day on this device (`1440`: the next day's midnight). */
const wallAt = (day: string, minutes: number): string => addMinutes(`${day}T00:00`, minutes);

const minutesOf = (wall: string): number => Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16));

/** The span of the quick form open over this grid, in its column. */
function quickSpan(quick: ReturnType<typeof useCalendarUi.getState>['quick'], days: readonly string[]): { readonly index: number; readonly from: number; readonly to: number } | null {
  if (!quick || !quick.start.includes('T')) return null;
  const index = days.indexOf(quick.start.slice(0, 10));
  if (index < 0) return null;
  return { index, from: minutesOf(quick.start), to: quick.end.slice(0, 10) !== quick.start.slice(0, 10) ? 1440 : minutesOf(quick.end) };
}

interface Drag {
  readonly key: string;
  readonly resize: boolean;
  readonly days: number;
  readonly minutes: number;
}

function DayHead({ day, today, weather }: { day: string; today: string; weather: ReturnType<typeof useWeather> extends ReadonlyMap<string, infer V> ? V | undefined : never }) {
  const isToday = day === today;
  return (
    <button type="button" className={styles.head} onClick={() => navigate(paths.view('day', day))} aria-label={t('Voir le {day}', { day: `${shortWeekday(weekdayOf(day))} ${partsOf(day).day}` })}>
      <span className="t-label-small">{shortWeekday(weekdayOf(day))}</span>
      <span className={styles.headDay} data-today={isToday || undefined} data-pebble-under={isToday ? pebbleTurn(partsOf(day).day) : undefined}>
        {partsOf(day).day}
      </span>
      {weather ? (
        <span className={styles.weather} title={`${WEATHER_WORDS[weatherKind(weather.day.code)]} · ${weather.place}`}>
          <Icon name={weatherKind(weather.day.code) === 'clear' ? 'sun' : 'cloud'} size={14} />
          {temperatures(weather.day.max, weather.day.min)}
        </span>
      ) : null}
    </button>
  );
}

export interface TimeGridProps {
  readonly days: readonly string[];
  readonly items: readonly Occurrence[];
  readonly now: number;
  readonly today: string;
}

export function TimeGrid({ days, items, now, today }: TimeGridProps) {
  const twelveHours = usePrefsStore(s => s.twelveHours);
  const eventLength = usePrefsStore(s => s.eventLength);
  const weekNumbers = usePrefsStore(s => s.weekNumbers);
  const colorOf = useColorOf();
  const weather = useWeather(days, items);
  const quick = useCalendarUi(s => s.quick);
  const scroller = useRef<HTMLDivElement>(null);
  // The hours fade and blur under the days' heads and the all-day strip as far as they run on.
  useScrollEdgesOn(scroller, [], { top: true });
  const columns = useRef<(HTMLDivElement | null)[]>([]);
  const dragged = useRef(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [creating, setCreating] = useState<{ readonly index: number; readonly from: number; readonly to: number } | null>(null);

  // The morning first, as Google opens a day (from 7:30, earlier for an earlier event); today, the
  // time it is, a third of the way down, once it is past what the morning shows.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const shown = (node.clientHeight || 600) / HOUR_PX;
    let top = 7.5;
    for (const item of items) if (!item.allDay && item.firstDay === item.lastDay && days.includes(item.firstDay)) top = Math.min(top, Math.max(0, minutesInDay(item.startAt, item.firstDay) / 60 - 0.5));
    if (days.includes(today)) {
      const hour = minutesInDay(now, today) / 60;
      if (hour < top || hour > top + shown - 1) top = Math.max(0, hour - shown / 3);
    }
    node.scrollTop = Math.max(0, Math.min(top, 24 - shown)) * HOUR_PX;
    // Once, as the view opens: moving to another week keeps the hours where they were.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const strip = useMemo(() => items.filter(item => item.allDay || item.firstDay !== item.lastDay), [items]);
  const timed = useMemo(() => items.filter(item => !item.allDay && item.firstDay === item.lastDay), [items]);
  const bars = useMemo(() => layoutBars(strip, days, { timed: true, maxLanes: 6 }), [strip, days]);
  const boxes = useMemo(() => days.map(day => layoutDay(timed, day)), [timed, days]);

  const open = (item: Occurrence, element: HTMLElement): void => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    openPeek(item.key, anchorOf(element));
  };

  /** The column under a pointer, by its index; null outside them. */
  const columnAt = (x: number): number | null => {
    for (let index = 0; index < days.length; index += 1) {
      const rect = columns.current[index]?.getBoundingClientRect();
      if (rect && x >= rect.left && x < rect.right) return index;
    }
    return null;
  };

  const startCreate = (event: ReactPointerEvent<HTMLDivElement>, index: number): void => {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    const column = event.currentTarget;
    const rect = column.getBoundingClientRect();
    const first = minuteAt(event.clientY - rect.top, rect.height || 24 * HOUR_PX);
    const startY = event.clientY;
    let moved = false;
    let range = { from: first, to: Math.min(1440, first + eventLength) };
    const move = (next: PointerEvent): void => {
      if (!moved && Math.abs(next.clientY - startY) < DRAG_SLOP) return;
      moved = true;
      const at = minuteAt(next.clientY - rect.top, rect.height || 24 * HOUR_PX);
      range = { from: Math.min(first, at), to: Math.min(1440, Math.max(first, at) + 15) };
      setCreating({ index, ...range });
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setCreating(null);
      const day = days[index]!;
      const top = rect.top + (range.from / 1440) * rect.height;
      openQuick({ start: wallAt(day, range.from), end: wallAt(day, range.to), anchor: { left: rect.left, top, width: rect.width, height: Math.max(20, ((range.to - range.from) / 1440) * rect.height) } });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>, item: Occurrence): void => {
    if (event.button !== 0 || !movable(item)) return;
    const resize = (event.target as HTMLElement).closest('[data-resize]') !== null;
    const origin = { x: event.clientX, y: event.clientY };
    const fromColumn = columnAt(event.clientX) ?? 0;
    const height = columns.current[0]?.getBoundingClientRect().height || 24 * HOUR_PX;
    let moved = false;
    let state: Drag = { key: item.key, resize, days: 0, minutes: 0 };
    const move = (next: PointerEvent): void => {
      if (!moved && Math.hypot(next.clientX - origin.x, next.clientY - origin.y) < DRAG_SLOP) return;
      moved = true;
      const minutes = item.allDay ? 0 : Math.round(((next.clientY - origin.y) / height) * 1440 / 15) * 15;
      const column = columnAt(next.clientX);
      state = { key: item.key, resize, days: resize || column === null ? 0 : column - fromColumn, minutes };
      setDrag(state);
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDrag(null);
      if (!moved) return;
      dragged.current = true;
      // The click that follows a drag is the drag's: the next press opens again.
      setTimeout(() => {
        dragged.current = false;
      }, 0);
      void commitMove(item, state.resize ? resizedTimes(item, state.minutes) : shiftedTimes(item, state.days, state.minutes));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // A quick form open on this grid: its span stays drawn under it.
  const ghost = creating ?? quickSpan(quick, days);

  const dragging = drag ? items.find(item => item.key === drag.key) : undefined;
  const todayIndex = days.indexOf(today);
  const vars = { '--days': days.length } as CSSProperties;

  /** The lines a box's text has room for (16px each, under the chip's 1 + 1 and the box's 2 at its foot). */
  const linesFor = (box: TimedBox): number => Math.max(1, Math.floor((Math.max(18, ((box.bottom - box.top) / 60) * HOUR_PX) - 4) / 16));

  const boxStyle = (box: TimedBox): CSSProperties => ({
    top: (box.top / 60) * HOUR_PX,
    height: Math.max(18, ((box.bottom - box.top) / 60) * HOUR_PX),
    left: `${(box.column / box.columns) * 100}%`,
    width: `${(box.span / box.columns) * 100}%`,
  });

  return (
    <div className={`${styles.frame} paper`} data-outline="panel">
      <div className={styles.heads} style={vars} data-many={days.length > 3 || undefined}>
        <span className={styles.weekNumber} title={weekNumbers ? weekNumberWords(days[0]!) : undefined}>
          {weekNumbers ? weekNumberShort(days[0]!) : ''}
        </span>
        {days.map(day => (
          <DayHead key={day} day={day} today={today} weather={weather.get(day)} />
        ))}
      </div>
      <div className={styles.allDay}>
        <span className={styles.allDayLabel}>{bars.bars.length > 0 ? t('Journée') : ''}</span>
        <div className={styles.bars} style={{ '--lanes': Math.max(1, bars.lanes) } as CSSProperties}>
          {bars.bars.map(bar => {
            const shift = drag && drag.key === bar.occurrence.key ? drag.days : 0;
            return (
              <div
                key={bar.occurrence.key}
                className={styles.bar}
                style={{ top: bar.lane * 24, left: `calc(${((bar.column + shift) / days.length) * 100}% + 0px)`, width: `calc(${(bar.span / days.length) * 100}% - 4px)` }}
              >
                <Chip item={bar.occurrence} color={colorOf(bar.occurrence)} variant="bar" twelveHours={twelveHours} dragging={!!drag && drag.key === bar.occurrence.key} onOpen={open} onPointerDown={startDrag} />
              </div>
            );
          })}
          {bars.hidden.map((count, column) =>
            count > 0 ? (
              <button key={column} type="button" className={styles.more} style={{ top: 6 * 24, left: `${(column / days.length) * 100}%` }} onClick={() => navigate(paths.view('day', days[column]!))}>
                {t('+{count}', { count })}
              </button>
            ) : null,
          )}
        </div>
      </div>
      <div ref={scroller} className={styles.scroller}>
        <div className={styles.grid} style={vars}>
          <div className={styles.hours} aria-hidden="true">
            {Array.from({ length: 23 }, (_, index) => (
              <span key={index} className={styles.hourLabel} style={{ top: (index + 1) * HOUR_PX }}>
                {hourLabel(index + 1, twelveHours)}
              </span>
            ))}
          </div>
          {days.map((day, index) => (
            <div
              key={day}
              ref={node => {
                columns.current[index] = node;
              }}
              className={styles.column}
              data-day={day}
              data-weekend={weekdayOf(day) === 0 || weekdayOf(day) === 6 || undefined}
              onPointerDown={event => startCreate(event, index)}
            >
              {boxes[index]!.map(box => {
                const own = drag?.key === box.occurrence.key;
                return (
                  <div key={box.occurrence.key} className={styles.box} style={boxStyle(box)}>
                    <Chip
                      item={box.occurrence}
                      color={colorOf(box.occurrence)}
                      variant="box"
                      lines={linesFor(box)}
                      twelveHours={twelveHours}
                      dragging={own}
                      onOpen={open}
                      onPointerDown={startDrag}
                    >
                      {movable(box.occurrence) && !box.continuesAfter ? <span className={styles.resize} data-resize="" aria-hidden="true" /> : null}
                    </Chip>
                  </div>
                );
              })}
              {index === todayIndex ? <div className={styles.now} style={{ top: (minutesInDay(now, today) / 60) * HOUR_PX }} aria-hidden="true" /> : null}
              {ghost && ghost.index === index ? (
                <div className={styles.ghost} style={{ top: (ghost.from / 60) * HOUR_PX, height: Math.max(18, ((ghost.to - ghost.from) / 60) * HOUR_PX) }} aria-hidden="true">
                  {`${clockOf(ghost.from)} – ${clockOf(ghost.to % 1440)}`}
                </div>
              ) : null}
              {dragging && drag && !dragging.allDay && daysBetween(days[0]!, dragging.firstDay) + drag.days === index ? (
                <DragGhost item={dragging} drag={drag} />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Where the occurrence dragged would land, drawn in its column. */
function DragGhost({ item, drag }: { item: Occurrence; drag: Drag }) {
  const startDay = item.firstDay;
  const from = minutesInDay(item.startAt, startDay) + (drag.resize ? 0 : drag.minutes);
  const length = Math.max(15, Math.round((item.endAt - item.startAt) / 60_000) + (drag.resize ? drag.minutes : 0));
  return (
    <div className={styles.ghost} style={{ top: (from / 60) * HOUR_PX, height: (length / 60) * HOUR_PX }} aria-hidden="true">
      {`${item.event.title.trim() || t('Sans titre')} · ${clockOf(((from % 1440) + 1440) % 1440)}`}
    </div>
  );
}
