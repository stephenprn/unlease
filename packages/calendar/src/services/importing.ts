/**
 * A calendar file imported (Google Agenda's export from Takeout, an `.ics` shared to the phone, an
 * invitation): its events become one's own, written as one batch. An event whose UID is already here
 * (imported before, or a subscription's) is not added again; an exception follows its series.
 */
import { createId } from '@unlease/core/services/ids';
import { markupFromPlain } from '@unlease/core/services/richText';
import type { Fields } from '@unlease/core/sync/record';
import { EVENT_LIMITS, type CalendarEvent } from '../models/events';
import type { IcsCalendar, IcsEvent } from './ics';
import { feedKey, feedUrl } from './feeds';
import { cleanEventUrl } from './links';

export interface ImportPlan {
  /** New events, series first. */
  readonly creates: readonly { readonly id: string; readonly fields: Fields }[];
  /** Events of the file already here. */
  readonly skipped: number;
  /** Cancelled ones and exceptions without their series. */
  readonly dropped: number;
}

function importFields(event: IcsEvent, recurringId: string | null, exdates: readonly string[], now: number): Fields {
  return {
    title: event.title.slice(0, EVENT_LIMITS.title),
    // The file's words are only words (a `{` never reads as a link or a mention).
    description: markupFromPlain(event.description, EVENT_LIMITS.description),
    place: event.place.slice(0, EVENT_LIMITS.place),
    start: event.start,
    end: event.end,
    timeZone: event.timeZone,
    rrule: recurringId ? '' : event.rrule.slice(0, EVENT_LIMITS.rrule),
    exdates: [...new Set(exdates)].slice(0, EVENT_LIMITS.exdates),
    recurringId,
    originalStart: recurringId ? event.recurrenceId : '',
    reminders: event.reminders.filter(minutes => minutes >= -1440 && minutes <= 40_320).slice(0, EVENT_LIMITS.reminders),
    labelIds: [],
    contactIds: [],
    files: [],
    feedId: null,
    uid: event.uid.slice(0, EVENT_LIMITS.uid),
    // A web address only, kept as a link typed in Agenda is: its tracking off (`cleanEventUrl`).
    url: feedUrl(cleanEventUrl(event.url).url),
    color: null,
    trashedAt: null,
    createdAt: now,
    deletedAt: null,
  };
}

/** What importing a file would write, against the events already here. */
export function planImport(calendar: IcsCalendar, existing: Iterable<CalendarEvent>, now: number, makeId: () => string = () => createId(now)): ImportPlan {
  const here = new Set<string>();
  for (const event of existing) if (event.deletedAt === null && event.uid) here.add(feedKey(event.uid, event.recurringId ? event.originalStart : ''));
  const cancelled = new Map<string, string[]>();
  for (const event of calendar.events) if (event.recurrenceId && event.cancelled) cancelled.set(event.uid, [...(cancelled.get(event.uid) ?? []), event.recurrenceId]);
  const seriesIds = new Map<string, string>();
  const creates: { id: string; fields: Fields }[] = [];
  let skipped = 0;
  let dropped = 0;
  const ordered = [...calendar.events].sort((a, b) => Number(!!a.recurrenceId) - Number(!!b.recurrenceId));
  const seen = new Set<string>();
  for (const event of ordered) {
    const uid = event.uid || `${createId(now)}@import`;
    const key = feedKey(uid, event.recurrenceId);
    if (seen.has(key)) continue;
    seen.add(key);
    if (event.cancelled) {
      dropped += 1;
      continue;
    }
    if (here.has(key)) {
      skipped += 1;
      continue;
    }
    if (event.recurrenceId) {
      const seriesId = seriesIds.get(uid);
      if (!seriesId) {
        dropped += 1;
        continue;
      }
      creates.push({ id: makeId(), fields: importFields({ ...event, uid }, seriesId, [], now) });
      continue;
    }
    const id = makeId();
    seriesIds.set(uid, id);
    creates.push({ id, fields: importFields({ ...event, uid }, null, [...event.exdates, ...(cancelled.get(uid) ?? [])], now) });
  }
  return { creates, skipped, dropped };
}
