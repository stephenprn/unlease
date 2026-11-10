/**
 * The demo's calendar: labels, a weekly series with one occurrence moved and one taken out, a daily
 * stand-up on workdays, a dinner with a guest and a page mentioned, a long weekend, a calendar one
 * subscribes to (read-only) with its events. Every day is counted from today, so the week shown is
 * always lived in.
 */
import { keysBetween } from '@unlease/core/services/fractionalIndex';
import { createEvent, blankDraft } from '@unlease/calendar/services/editing';
import { addDays, deviceZone, instantToDay, weekdayOf } from '@unlease/calendar/services/time';
import { eventFields, feedFields, labelFields } from '@unlease/calendar/sync/entities';

import type { LocalChange } from '@shared/app/store/records';

const DAY = 86_400_000;

/** The next such weekday from today (0 Sunday), or today. */
const next = (today: string, weekday: number): string => addDays(today, (weekday - weekdayOf(today) + 7) % 7);

export function calendarChanges(now: number): { readonly time: number; readonly changes: LocalChange[] }[] {
  const today = instantToDay(now);
  const zone = deviceZone() || 'Europe/Paris';
  const created = now - 20 * DAY;
  const labels = [
    { id: 'demo-cal-travail', name: 'Work', color: 'blue' as const },
    { id: 'demo-cal-sport', name: 'Sport', color: 'green' as const },
    { id: 'demo-cal-famille', name: 'Family', color: 'pink' as const },
  ];
  const keys = keysBetween(null, null, labels.length);
  const labelChanges: LocalChange[] = labels.map((label, index) => ({ type: 'calendarLabel', id: label.id, patch: labelFields({ name: label.name, color: label.color, position: keys[index]!, createdAt: created, deletedAt: null }) }));
  const event = (id: string, draft: Parameters<typeof createEvent>[0], extra: Record<string, unknown> = {}): LocalChange => {
    const made = createEvent(draft, created, id);
    return { type: made.type, id, patch: { ...made.patch, ...extra } };
  };
  const tuesday = addDays(next(today, 2), -7);
  const climbing = blankDraft(`${tuesday}T19:00`, `${tuesday}T21:00`, zone, [60]);
  const standup = blankDraft(`${addDays(today, -14)}T09:30`, `${addDays(today, -14)}T09:45`, zone, [5]);
  const dinner = blankDraft(`${addDays(today, 3)}T20:00`, `${addDays(today, 3)}T23:00`, zone, [120]);
  // The trip the pages plan (`tripDay` in demoData.ts): the first Thursday six weeks out, to the Sunday.
  const tripStart = next(addDays(today, 42), 4);
  const weekend = blankDraft(tripStart, addDays(tripStart, 4), '', [-540]);
  const dentist = blankDraft(`${addDays(today, 1)}T14:00`, `${addDays(today, 1)}T14:30`, zone, [60]);
  // Today lived in too (« Aujourd'hui »): a lunch, and an evening class.
  const lunch = blankDraft(`${today}T12:30`, `${today}T13:45`, zone, [30]);
  const pottery = blankDraft(`${today}T18:30`, `${today}T20:00`, zone, [60]);
  const events: LocalChange[] = [
    event('demo-cal-escalade', { ...climbing, title: 'Bouldering', place: 'Arkose Montreuil', labelIds: ['demo-cal-sport'], rrule: 'FREQ=WEEKLY;BYDAY=TU', contactIds: ['demo-contact-noah'] }, { exdates: [`${addDays(tuesday, 21)}T19:00`] }),
    event('demo-cal-escalade-x', { ...climbing, start: `${addDays(tuesday, 7)}T20:00`, end: `${addDays(tuesday, 7)}T22:00`, title: 'Bouldering (later)', place: 'Arkose Montreuil', labelIds: ['demo-cal-sport'] }, { recurringId: 'demo-cal-escalade', originalStart: `${addDays(tuesday, 7)}T19:00` }),
    event('demo-cal-standup', { ...standup, title: 'Team stand-up', place: 'Video call', labelIds: ['demo-cal-travail'], rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', contactIds: ['demo-contact-camille', 'demo-contact-julien'] }),
    event('demo-cal-diner', { ...dinner, title: 'Dinner at Léa’s', place: '12 rue des Lilas, 69003 Lyon', labelIds: ['demo-cal-famille'], contactIds: ['demo-contact-lea', 'demo-contact-paul'], description: 'Bring dessert. Recipe ideas are in {@page=demo-page-recettes}, the booking in {@note=demo-resto}.' }),
    event('demo-cal-lisbonne', { ...weekend, title: 'Long weekend in Lisbon', place: 'Lisbon, Portugal', labelIds: ['demo-cal-famille'], description: 'The programme: {@page=demo-page-lisbonne}.', url: 'https://www.visitlisboa.com' }),
    event('demo-cal-dentiste', { ...dentist, title: 'Dentist', place: 'Dr Roux’s practice, Paris' }),
    event('demo-cal-dejeuner', { ...lunch, title: 'Lunch with Camille', place: 'Le Petit Cambodge, Paris', contactIds: ['demo-contact-camille'] }),
    event('demo-cal-ceramique', { ...pottery, title: 'Ceramics workshop', place: 'Canal Studio, Paris', labelIds: ['demo-cal-sport'] }),
  ];
  const feed: LocalChange = {
    type: 'calendarFeed',
    id: 'demo-cal-feed',
    patch: feedFields({ kind: 'ics', name: 'The local cinema', url: 'https://cinema.example.org/agenda.ics', color: 'violet', hidden: false, position: 'a1', refreshedAt: now - 2 * 3_600_000, error: '', createdAt: created, deletedAt: null }),
  };
  const screening = (id: string, day: string, title: string): LocalChange => ({
    type: 'calendarEvent',
    id,
    patch: eventFields({
      ...blankDraft(`${day}T20:30`, `${day}T22:30`, zone),
      title,
      place: 'The local cinema',
      exdates: [],
      recurringId: null,
      originalStart: '',
      feedId: 'demo-cal-feed',
      uid: `${id}@cinema.example.org`,
      trashedAt: null,
      createdAt: created,
      deletedAt: null,
    }),
  });
  return [
    { time: created, changes: labelChanges },
    { time: created + 60_000, changes: [...events, feed, screening('demo-cal-film-1', addDays(today, 2), 'Preview: The Big Blue'), screening('demo-cal-film-2', addDays(today, 9), 'Film club: Playtime')] },
  ];
}
