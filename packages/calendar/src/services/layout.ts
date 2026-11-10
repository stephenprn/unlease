/**
 * Where each occurrence sits in the views, the same on the phone and the web: side by side in a
 * day's column where times overlap (Google's way: a cluster of overlapping events shares the width,
 * each taking the first free column, and widens over free columns on its right), and in lanes across
 * a week for the all-day and multi-day bars, with « +2 » for what does not fit.
 */
import type { Day } from '../models/events';
import type { Occurrence } from './occurrences';
import { addDays, dayToInstant, daysBetween } from './time';

const MINUTE = 60_000;

export interface TimedBox {
  readonly occurrence: Occurrence;
  /** Minutes from the day's midnight, cut to the day. */
  readonly top: number;
  readonly bottom: number;
  /** Its column and how many share its cluster; `span` columns wide. */
  readonly column: number;
  readonly columns: number;
  readonly span: number;
  /** It starts before this day or ends after it. */
  readonly continuesBefore: boolean;
  readonly continuesAfter: boolean;
}

/** The shortest an event is drawn, in minutes: a five-minute meeting still holds its title. */
export const MIN_BOX_MINUTES = 20;

/** The timed occurrences of a day (not all day, not spanning it whole), placed in columns. */
export function layoutDay(occurrences: readonly Occurrence[], day: Day): TimedBox[] {
  const dayStart = dayToInstant(day);
  const dayEnd = dayToInstant(addDays(day, 1));
  const items = occurrences
    .filter(item => !item.allDay && item.startAt < dayEnd && (item.endAt > dayStart || (item.endAt === item.startAt && item.startAt >= dayStart)))
    .map(item => {
      const top = Math.max(0, Math.round((item.startAt - dayStart) / MINUTE));
      const end = Math.min((dayEnd - dayStart) / MINUTE, Math.round((item.endAt - dayStart) / MINUTE));
      return { item, top, bottom: Math.max(end, top + MIN_BOX_MINUTES) };
    })
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  const boxes: TimedBox[] = [];
  let cluster: { item: Occurrence; top: number; bottom: number; column: number }[] = [];
  let clusterEnd = -1;
  const flush = (): void => {
    if (cluster.length === 0) return;
    const columns = Math.max(...cluster.map(entry => entry.column)) + 1;
    for (const entry of cluster) {
      // Widen over the columns to its right that nothing overlapping it uses.
      let span = 1;
      while (entry.column + span < columns && !cluster.some(other => other.column === entry.column + span && other.top < entry.bottom && other.bottom > entry.top)) span += 1;
      boxes.push({
        occurrence: entry.item,
        top: entry.top,
        bottom: entry.bottom,
        column: entry.column,
        columns,
        span,
        continuesBefore: entry.item.startAt < dayStart,
        continuesAfter: entry.item.endAt > dayEnd,
      });
    }
    cluster = [];
  };
  for (const entry of items) {
    if (entry.top >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    const used = new Set(cluster.filter(other => other.bottom > entry.top).map(other => other.column));
    let column = 0;
    while (used.has(column)) column += 1;
    cluster.push({ ...entry, column });
    clusterEnd = Math.max(clusterEnd, entry.bottom);
  }
  flush();
  return boxes;
}

export interface BarSlot {
  readonly occurrence: Occurrence;
  /** The lane, from the top. */
  readonly lane: number;
  /** Its first column in the row (0 to the row's length) and how many it covers. */
  readonly column: number;
  readonly span: number;
  readonly continuesBefore: boolean;
  readonly continuesAfter: boolean;
}

export interface BarRow {
  readonly bars: readonly BarSlot[];
  /** How many lanes it uses. */
  readonly lanes: number;
  /** Per column, how many of its occurrences sit below `maxLanes` (« +2 »). */
  readonly hidden: readonly number[];
}

/**
 * The bars of a row of consecutive days (a week of the month, the week view's all-day strip): all-day
 * occurrences, and in the month timed ones too (`timed`), each in the first lane free on all its days.
 * Longer bars first, so they keep the top lanes.
 */
export function layoutBars(occurrences: readonly Occurrence[], days: readonly Day[], options: { readonly timed: boolean; readonly maxLanes: number }): BarRow {
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const items = occurrences
    .filter(item => (options.timed || item.allDay) && item.firstDay <= last && item.lastDay >= first)
    .map(item => {
      const column = Math.max(0, daysBetween(first, item.firstDay));
      const end = Math.min(days.length - 1, daysBetween(first, item.lastDay));
      return { item, column, span: end - column + 1 };
    })
    .sort((a, b) => a.column - b.column || b.span - a.span || (a.item.allDay === b.item.allDay ? a.item.startAt - b.item.startAt : a.item.allDay ? -1 : 1));
  const taken: boolean[][] = [];
  const bars: BarSlot[] = [];
  const hidden = days.map(() => 0);
  for (const entry of items) {
    let lane = 0;
    while ((taken[lane] ?? []).slice(entry.column, entry.column + entry.span).some(Boolean)) lane += 1;
    if (lane >= options.maxLanes) {
      for (let column = entry.column; column < entry.column + entry.span; column += 1) hidden[column]! += 1;
      continue;
    }
    taken[lane] ??= [];
    for (let column = entry.column; column < entry.column + entry.span; column += 1) taken[lane]![column] = true;
    bars.push({ occurrence: entry.item, lane, column: entry.column, span: entry.span, continuesBefore: entry.item.firstDay < first, continuesAfter: entry.item.lastDay > last });
  }
  return { bars, lanes: taken.length, hidden };
}

/** Minutes past midnight of an instant on this device's day. */
export function minutesInDay(instant: number, day: Day): number {
  return Math.round((instant - dayToInstant(day)) / MINUTE);
}

/** The minute a pointer at `offset` of a column `height` tall points at, snapped to `step` minutes. */
export function minuteAt(offset: number, height: number, step = 15): number {
  const minute = Math.max(0, Math.min(1440 - step, Math.round(((offset / height) * 1440) / step) * step));
  return minute;
}
