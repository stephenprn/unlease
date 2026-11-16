/**
 * What each change of an alarm writes, the same on both clients (each writes it as one batch):
 * a new alarm with this device's defaults, an edit (a one-time alarm takes its day again), a copy,
 * « Ignorer la prochaine », and the evening check's « Sonner à 6:30 » (a one-time alarm moved, or a
 * repeating one kept quiet that morning and a one-time alarm set for it).
 */
import type { Fields } from '@unlease/core/sync/record';
import type { Day } from '@unlease/calendar/models/events';
import { ALARM_LIMITS, normalizeDays, type Alarm } from '../models/alarm';
import type { ClockPrefs } from '../models/prefs';
import { alarmFields } from '../sync/entities';
import type { EventLink } from './agenda';
import { onceDate, ringAt } from './schedule';

/** An alarm's event: which occurrence, how long before its start it rings, and the day that ring falls on. */
export interface DraftLink extends EventLink {
  readonly before: number;
  readonly day: Day;
}

/** What the editor holds: everything a person sets. */
export interface AlarmDraft {
  readonly time: string;
  readonly days: readonly number[];
  readonly label: string;
  readonly sound: string;
  readonly vibrate: boolean;
  readonly weather: boolean;
  readonly agenda: boolean;
  /** A repeating alarm stays quiet on public holidays and days off. */
  readonly offDays: boolean;
  /** The event it wakes the person for (then it rings once, `before` its start); null: an alarm of its own. */
  readonly link: DraftLink | null;
  /**
   * The day a one-time alarm was set for (« Ajouter une alarme » for a morning's event, `eventAlarmDraft`),
   * kept while its time is still to come that day; without one (or once gone by), it rings the next
   * time its time comes (`draftDate`).
   */
  readonly date?: Day | null;
}

/** The day a one-time draft rings: the day it was set for while its time is still to come then, else the next day its time comes. */
export function draftDate(draft: Pick<AlarmDraft, 'time' | 'date'>, now: number, zone = ''): Day {
  return draft.date && ringAt(draft.date, draft.time, zone) > now ? draft.date : onceDate(draft.time, now, zone);
}

/** A new alarm's draft: 07:00 unless told (as alarm clocks open), with this device's defaults. */
export function blankDraft(prefs: Pick<ClockPrefs, 'defaultSound' | 'weatherDefault' | 'agendaDefault'>, time = '07:00'): AlarmDraft {
  return { time, days: [], label: '', sound: prefs.defaultSound, vibrate: true, weather: prefs.weatherDefault, agenda: prefs.agendaDefault, offDays: true, link: null };
}

export const draftOf = (alarm: Alarm): AlarmDraft => ({
  time: alarm.time,
  days: alarm.days,
  label: alarm.label,
  sound: alarm.sound,
  vibrate: alarm.vibrate,
  weather: alarm.weather,
  agenda: alarm.agenda,
  offDays: alarm.offDays,
  link: alarm.eventId !== null ? { eventId: alarm.eventId, eventStart: alarm.eventStart, before: alarm.before, day: alarm.date ?? '' } : null,
});

const linkFields = (link: DraftLink | null): { eventId: string | null; eventStart: string; before: number } => ({ eventId: link?.eventId ?? null, eventStart: link?.eventStart ?? '', before: link?.before ?? 0 });

/** A new alarm's fields: switched on (saving an alarm means it should ring), its day if it rings once. */
export function newAlarmFields(draft: AlarmDraft, now: number, zone = ''): Fields {
  const days = draft.link ? [] : normalizeDays(draft.days);
  return alarmFields({
    time: draft.time,
    days,
    date: draft.link ? draft.link.day : days.length === 0 ? draftDate(draft, now, zone) : null,
    enabled: true,
    label: draft.label.trim(),
    sound: draft.sound,
    vibrate: draft.vibrate,
    weather: draft.weather,
    agenda: draft.agenda,
    skipDay: null,
    offDays: draft.offDays,
    ...linkFields(draft.link),
    createdAt: now,
    deletedAt: null,
  });
}

/**
 * What saving the editor writes on an alarm: only what changed, and, as a saved alarm is meant to
 * ring, it is switched on; its time or days changed, its skip goes (it named the old next ring).
 */
export function editFields(alarm: Alarm, draft: AlarmDraft, now: number, zone = ''): Fields {
  const days = draft.link ? [] : normalizeDays(draft.days);
  const patch: Fields = {};
  const timing = draft.time !== alarm.time || days.join() !== alarm.days.join();
  if (draft.time !== alarm.time) patch.time = draft.time;
  if (days.join() !== alarm.days.join()) patch.days = days;
  const label = draft.label.trim();
  if (label !== alarm.label) patch.label = label;
  if (draft.sound !== alarm.sound) patch.sound = draft.sound;
  if (draft.vibrate !== alarm.vibrate) patch.vibrate = draft.vibrate;
  if (draft.weather !== alarm.weather) patch.weather = draft.weather;
  if (draft.agenda !== alarm.agenda) patch.agenda = draft.agenda;
  if (draft.offDays !== alarm.offDays) patch.offDays = draft.offDays;
  const link = linkFields(draft.link);
  if (link.eventId !== alarm.eventId) patch.eventId = link.eventId;
  if (link.eventStart !== alarm.eventStart) patch.eventStart = link.eventStart;
  if (link.before !== alarm.before) patch.before = link.before;
  if (!alarm.enabled || timing || days.length === 0) {
    patch.enabled = true;
    const date = draft.link ? draft.link.day : days.length === 0 ? draftDate(draft, now, zone) : null;
    if (date !== alarm.date) patch.date = date;
  }
  if (timing && alarm.skipDay !== null) patch.skipDay = null;
  return patch;
}

/** Whether the draft differs from the alarm (the editor asks before dropping it). */
export function draftChanged(alarm: Alarm | null, draft: AlarmDraft, blank: AlarmDraft): boolean {
  const before = alarm ? draftOf(alarm) : blank;
  return (
    before.time !== draft.time ||
    normalizeDays(before.days).join() !== normalizeDays(draft.days).join() ||
    before.label.trim() !== draft.label.trim() ||
    before.sound !== draft.sound ||
    before.vibrate !== draft.vibrate ||
    before.weather !== draft.weather ||
    before.agenda !== draft.agenda ||
    before.offDays !== draft.offDays ||
    (before.date ?? null) !== (draft.date ?? null) ||
    (before.link?.eventId ?? null) !== (draft.link?.eventId ?? null) ||
    (before.link?.before ?? 0) !== (draft.link?.before ?? 0)
  );
}

/** One record a change writes. */
export interface AlarmWrite {
  readonly id: string;
  readonly fields: Fields;
  /** A record made by this change. */
  readonly created?: boolean;
}

/**
 * « Sonner à 6:30 » for one morning: a one-time alarm is moved there; a repeating one stays quiet that
 * morning and a one-time alarm like it rings at the earlier time (its own id, `newId`).
 */
export function ringEarlierWrites(alarm: Alarm, day: Day, time: string, now: number, newId: string, zone = ''): AlarmWrite[] {
  if (alarm.days.length === 0) {
    // An alarm for an event (as it rings, `ringingAlarms`) stays linked: it rings that much longer before.
    if (alarm.eventId !== null && alarm.date !== null) {
      const earlier = Math.round((ringAt(alarm.date, alarm.time, zone) - ringAt(day, time, zone)) / 60_000);
      return [{ id: alarm.id, fields: { time, date: day, enabled: true, before: Math.min(ALARM_LIMITS.before, alarm.before + earlier) } }];
    }
    return [{ id: alarm.id, fields: { time, date: day, enabled: true } }];
  }
  return [
    { id: alarm.id, fields: { skipDay: day } },
    {
      id: newId,
      created: true,
      fields: alarmFields({ ...alarm, time, days: [], date: day, enabled: true, skipDay: null, createdAt: now, deletedAt: null }),
    },
  ];
}
