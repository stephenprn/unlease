/**
 * What « Prochaine alarme » is handed: for each ring of the week, the morning's first event as the home
 * says it, how far it stands from the alarm, and why it is too close when it is, or that nothing waits;
 * the days in words; the widget's words in the app's language.
 */
import { setLocale } from '@unlease/core/i18n';
import type { CalendarEvent } from '@unlease/calendar/models/events';
import { wallToInstant } from '@unlease/calendar/services/time';
import type { Alarm } from '@unlease/clock/models/alarm';

import { alarmWidgetPayload } from '../widgetPayloads';

const local = (wall: string): number => wallToInstant(wall, '');

function alarm(id: string, extra: Partial<Alarm> = {}): Alarm {
  return { id, time: '07:30', days: [1, 2, 3, 4, 5], date: null, enabled: true, label: id, sound: 'melody', vibrate: true, weather: true, agenda: true, skipDay: null, offDays: false, eventId: null, eventStart: '', before: 0, createdAt: 1, deletedAt: null, editedAt: 1, ...extra };
}

function event(id: string, start: string, end: string): CalendarEvent {
  return { id, title: id, description: '', place: '', start, end, timeZone: '', rrule: '', exdates: [], recurringId: null, originalStart: '', reminders: [], labelIds: [], contactIds: [], files: [], feedId: null, uid: '', url: '', color: null, dayOff: false, trashedAt: null, createdAt: 1, deletedAt: null, editedAt: 1 } as CalendarEvent;
}

const PREFS = { marginMinutes: 30, twelveHours: false };
// Monday 16 November 2026, in the evening.
const NOW = local('2026-11-16T21:00');

describe('« Prochaine alarme »', () => {
  beforeEach(() => setLocale('fr'));
  afterAll(() => setLocale('en'));

  const alarms = [alarm('Travail'), alarm('Marché', { time: '09:00', days: [6] }), alarm('Sieste', { time: '14:00', days: [2] }), alarm('Éteinte', { enabled: false, days: [0, 1, 2, 3, 4, 5, 6] })];
  const events = [event('Train pour Lyon', '2026-11-17T07:45', '2026-11-17T08:30'), event('Dentiste', '2026-11-17T15:00', '2026-11-17T16:00'), event('Réunion', '2026-11-18T10:00', '2026-11-18T11:00'), event('Armistice', '2026-11-21', '2026-11-22')];
  const payload = alarmWidgetPayload(alarms, { events, feeds: [] }, PREFS, 'fr', NOW);

  it('says the morning’s first event, and why it comes too soon', () => {
    expect(payload.mornings['Travail|2026-11-17']).toEqual({ event: '07:45 · Train pour Lyon', after: '15 min après le réveil', clash: 'Moins de 30 min pour se préparer.' });
    expect(payload.mornings['Travail|2026-11-18']).toEqual({ event: '10:00 · Réunion', after: '2 h 30 après le réveil', clash: '' });
    // A later ring of the day counts from itself, never clashes.
    expect(payload.mornings['Sieste|2026-11-17']).toEqual({ event: '15:00 · Dentiste', after: '1 h après le réveil', clash: '' });
  });

  it('names a morning’s all-day events, and says when the calendar holds nothing', () => {
    expect(payload.mornings['Marché|2026-11-21']).toEqual({ event: 'Armistice', after: 'Toute la journée', clash: '' });
    expect(payload.mornings['Travail|2026-11-19']).toEqual({ event: '', after: 'Rien dans votre agenda ce jour-là.', clash: '' });
  });

  it('holds only the rings of the week of alarms switched on', () => {
    expect(Object.keys(payload.mornings).every(key => !key.startsWith('Éteinte|'))).toBe(true);
    expect(Object.keys(payload.mornings).filter(key => key.startsWith('Travail|'))).toEqual(['Travail|2026-11-16', 'Travail|2026-11-17', 'Travail|2026-11-18', 'Travail|2026-11-19', 'Travail|2026-11-20', 'Travail|2026-11-23']);
  });

  it('writes the days and the words in the app’s language', () => {
    expect(payload.days['2026-11-18']?.replace(/\s/g, ' ')).toBe('Mer. 18 nov.');
    expect(payload.days['2026-11-17']).toBeUndefined();
    expect(payload.words).toMatchObject({ today: 'Aujourd’hui', tomorrow: 'Demain', none: 'Pas d’alarme', snoozed: 'Répétée jusqu’à {time}', ringing: 'Sonne', newAlarm: 'Nouvelle alarme' });
    expect(alarmWidgetPayload(alarms, { events, feeds: [] }, { ...PREFS, twelveHours: true }, 'fr', NOW).twelveHours).toBe(true);
  });
});
