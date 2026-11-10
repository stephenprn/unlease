/**
 * A calendar block (`calendar`): Agenda's next events, all or one label's, from today on for the
 * block's days, grouped by day as a short schedule. Both clients draw it from the events they sync
 * (Pages reads Agenda's records); Claude reads it as lines; a backup writes it as it stood.
 */
import { isLive, type CalendarEvent, type CalendarFeed, type CalendarLabel } from '@unlease/calendar/models/events';
import { eventColor } from '@unlease/calendar/services/colors';
import { hiddenFeedIds, occurrencesIn, type Occurrence } from '@unlease/calendar/services/occurrences';
import { addDays, instantToDay } from '@unlease/calendar/services/time';
import type { LineColor } from '@unlease/design/colors';
import type { Block } from '../models/blocks';

export interface CalendarBlockItem {
  readonly occurrence: Occurrence;
  readonly color: LineColor | null;
}

export interface CalendarBlockDay {
  readonly day: string;
  readonly items: readonly CalendarBlockItem[];
}

/** What a calendar block reads of Agenda: its events, labels and subscribed calendars. */
export interface CalendarBlockSource {
  readonly events: Readonly<Record<string, CalendarEvent>>;
  readonly labels: Readonly<Record<string, CalendarLabel>>;
  readonly feeds: Readonly<Record<string, CalendarFeed>>;
}

/** At most this many events in one block: it is a glance, Agenda has the rest. */
export const CALENDAR_BLOCK_MAX = 40;

/** The block's days that hold an event, today first, each with its events in order. */
export function calendarBlockDays(source: CalendarBlockSource, block: Pick<Block, 'calendarLabelId' | 'calendarDays'>, now: number): CalendarBlockDay[] {
  const today = instantToDay(now);
  const label = block.calendarLabelId ? source.labels[block.calendarLabelId] : undefined;
  const labelId = label && label.deletedAt === null ? label.id : null;
  const items = occurrencesIn(Object.values(source.events), today, addDays(today, Math.max(1, block.calendarDays)), { hiddenFeeds: hiddenFeedIds(Object.values(source.feeds)), labelId })
    .filter(item => item.allDay || item.endAt > now)
    .slice(0, CALENDAR_BLOCK_MAX);
  const days = new Map<string, CalendarBlockItem[]>();
  for (const occurrence of items) {
    // A long event shows once, on today when it began before.
    const day = occurrence.firstDay < today ? today : occurrence.firstDay;
    days.set(day, [...(days.get(day) ?? []), { occurrence, color: eventColor(occurrence.event, source.labels, source.feeds) }]);
  }
  return [...days.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, list]) => ({ day, items: list }));
}

/** The block's label, when it is still there. */
export function calendarBlockLabel(source: Pick<CalendarBlockSource, 'labels'>, block: Pick<Block, 'calendarLabelId'>): CalendarLabel | null {
  const label = block.calendarLabelId ? source.labels[block.calendarLabelId] : undefined;
  return label && label.deletedAt === null ? label : null;
}

/** The live labels a block may pick, in their order. */
export function calendarLabels(labels: Readonly<Record<string, CalendarLabel>>): CalendarLabel[] {
  return Object.values(labels)
    .filter(label => label.deletedAt === null)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : a.name.localeCompare(b.name)));
}

/** The block as lines of plain text, the same in every language (Claude, a backup): `2026-11-03 14:30–15:30 Dîner chez Paul (Lyon)`. */
export function calendarBlockLines(source: CalendarBlockSource, block: Pick<Block, 'calendarLabelId' | 'calendarDays'>, now: number): string[] {
  const lines: string[] = [];
  for (const { day, items } of calendarBlockDays(source, block, now)) {
    for (const { occurrence } of items) {
      const event = occurrence.event;
      const when = occurrence.allDay ? `${day} (all day)` : `${day} ${hhmm(occurrence.startAt)}–${hhmm(occurrence.endAt)}`;
      lines.push(`${when} ${event.title.trim() || 'Untitled'}${event.place.trim() ? ` (${event.place.trim()})` : ''}`);
    }
  }
  return lines;
}

const hhmm = (instant: number): string => {
  const date = new Date(instant);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

/** Whether an event is one a block may name (live, not one of a calendar gone). */
export const shownEvent = (event: CalendarEvent | undefined): event is CalendarEvent => !!event && isLive(event);
