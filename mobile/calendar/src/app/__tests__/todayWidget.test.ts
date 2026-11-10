/** What « Aujourd'hui »'s widget is handed: today and the day after in reading order, Carnet's missed reminders, tomorrow and its count, the weather when known. */
import { CALENDAR_PREFS_DEFAULTS } from '@unlease/calendar/models/prefs';
import { blankDraft } from '@unlease/calendar/services/editing';
import { addDays, today, wallToInstant } from '@unlease/calendar/services/time';
import { noteFields } from '@unlease/notes/sync/entities';
import { closeDatabase, openDatabase } from '@shared/data/db/database';

import { addEvent } from '../store/actions';
import { loadLibrary, resetLibrary, useLibraryStore, writeLocal } from '../store/libraryStore';
import { todayPayload, todayWeatherPlaces } from '../todayWidget';

const day = today(Date.now());
const at = (wall: string): number => wallToInstant(wall, '');

beforeEach(() => {
  closeDatabase();
  resetLibrary();
  openDatabase({ name: 'today-widget.sqlite' });
  loadLibrary();
});

describe('« Aujourd’hui »’s widget', () => {
  it('hands over today and the day after, whole days first, each row with its instants and where it opens', () => {
    const tomorrow = addDays(day, 1);
    const lunch = addEvent({ ...blankDraft(`${day}T12:30`, `${day}T13:30`, ''), title: 'Déjeuner', place: 'Chez Paul' });
    addEvent({ ...blankDraft(day, tomorrow, ''), title: 'Férié' });
    addEvent({ ...blankDraft(`${tomorrow}T09:00`, `${tomorrow}T10:00`, ''), title: 'Standup' });
    for (const hour of [11, 12, 13, 14]) addEvent({ ...blankDraft(`${tomorrow}T${hour}:00`, `${tomorrow}T${hour}:30`, ''), title: `Réunion ${hour}` });
    writeLocal([
      {
        type: 'note',
        id: 'missed',
        patch: noteFields({ kind: 'text', title: 'Payer la facture', body: '', color: null, pinned: false, archived: false, trashedAt: null, labelIds: [], position: 'a0', reminderAt: at(`${addDays(day, -1)}T18:00`), code: '', hint: '', createdAt: 1, deletedAt: null }),
      },
    ]);
    const payload = todayPayload(useLibraryStore.getState(), CALENDAR_PREFS_DEFAULTS, at(`${day}T08:00`), { day, code: 3, max: 14, min: 7, rain: 0 });

    expect(payload.days.map(each => each.day)).toEqual([day, tomorrow]);
    const [first] = payload.days;
    expect(first!.weather).toBe('Nuageux · 14° / 7°');
    expect(first!.rows.map(row => row.title)).toEqual(['Férié', 'Déjeuner']);
    expect(first!.rows[1]).toMatchObject({ time: '12:30 – 13:30', place: 'Chez Paul', allDay: false, moment: false, startAt: at(`${day}T12:30`), open: `event/${lunch}?at=${encodeURIComponent(`${day}T12:30`)}` });
    expect(first!.tomorrow.map(row => row.title)).toEqual(['Standup', 'Réunion 11', 'Réunion 12']);
    expect(first!.more).toMatch(/^Et 2\sautres événements demain$/);
    expect(first!.moreOpen).toBe(`day/${tomorrow}`);
    // The day after, drawn after midnight before the app feeds the widget again.
    expect(payload.days[1]!.rows.map(row => row.title)).toEqual(['Standup', 'Réunion 11', 'Réunion 12', 'Réunion 13', 'Réunion 14']);
    expect(payload.days[1]!.weather).toBe('');

    expect(payload.overdueTitle).toBe('En retard');
    expect(payload.overdue).toEqual([expect.objectContaining({ title: 'Payer la facture', time: 'Hier · 18:00', open: 'carnet://note/missed', moment: true })]);
    expect(payload.words.now).toBe('En cours');
  });

  it('leaves Carnet’s reminders out with their layer, and asks the weather at the day’s placed events, then home', () => {
    addEvent({ ...blankDraft(`${day}T12:30`, `${day}T13:30`, ''), title: 'Déjeuner', place: 'Lyon' });
    writeLocal([
      {
        type: 'note',
        id: 'missed',
        patch: noteFields({ kind: 'text', title: 'Payer', body: '', color: null, pinned: false, archived: false, trashedAt: null, labelIds: [], position: 'a0', reminderAt: at(`${addDays(day, -2)}T09:00`), code: '', hint: '', createdAt: 1, deletedAt: null }),
      },
    ]);
    const prefs = { ...CALENDAR_PREFS_DEFAULTS, noteReminders: false, homePlace: 'Paris' };
    expect(todayPayload(useLibraryStore.getState(), prefs, at(`${day}T08:00`)).overdue).toEqual([]);
    expect(todayWeatherPlaces(useLibraryStore.getState(), prefs, at(`${day}T08:00`))).toEqual(['Lyon', 'Paris']);
  });
});
