/** « Aujourd'hui »: the day gathered in reading order, now and next, the countdown's words, Carnet's missed reminders, tomorrow. */
import { setLocale } from '@unlease/core/i18n';
import type { Note } from '@unlease/notes/models/entities';
import type { CalendarEvent } from '../../models/events';
import { remindersIn } from '../layers';
import { occurrencesIn } from '../occurrences';
import { addDays, dayToInstant, wallToInstant } from '../time';
import { overdueReminders, planToday, rowStateWords, rowTimeWords, spanWords, TOMORROW_EVENTS, weatherPlaces, weatherWords, overdueWords, type DayItem } from '../today';

const TODAY = '2026-11-09';
const TOMORROW = addDays(TODAY, 1);
const at = (wall: string): number => wallToInstant(wall, '');

function event(id: string, start: string, end: string, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id,
    title: id,
    description: '',
    place: '',
    start,
    end,
    timeZone: '',
    rrule: '',
    exdates: [],
    recurringId: null,
    originalStart: '',
    reminders: [],
    labelIds: [],
    contactIds: [],
    files: [],
    feedId: null,
    uid: '',
    url: '',
    color: null,
    trashedAt: null,
    createdAt: 1,
    deletedAt: null,
    editedAt: 1,
    ...extra,
  };
}

function note(id: string, reminderAt: number | null, extra: Partial<Note> = {}): Note {
  return {
    id,
    kind: 'text',
    title: id,
    body: '',
    rich: false,
    drawing: '',
    color: null,
    pattern: null,
    pinned: false,
    archived: false,
    trashedAt: null,
    labelIds: [],
    position: 'a0',
    reminderAt,
    code: '',
    emblem: null,
    hint: '',
    modules: null,
    contactIds: [],
    createdAt: 1,
    deletedAt: null,
    editedAt: 1,
    ...extra,
  };
}

/** What a client hands over: its events' occurrences, as items. */
const items = (events: CalendarEvent[], from = TODAY, to = addDays(TODAY, 2)): DayItem[] =>
  occurrencesIn(events, from, to).map(occurrence => ({ kind: 'event', key: occurrence.key, occurrence, color: null }));

const titles = (rows: readonly { item: DayItem }[]): string[] =>
  rows.map(row => (row.item.kind === 'event' ? row.item.occurrence.event.title : row.item.kind === 'birthday' ? row.item.birthday.name : row.item.kind === 'reminder' ? row.item.reminder.title : row.item.page.title));

describe('« Aujourd’hui »', () => {
  beforeEach(() => setLocale('fr'));

  it('reads the day in order: whole days first (birthdays, events, pages), then by time, each before, under way, next or later', () => {
    const events = [
      event('Atelier', `${TODAY}T13:30`, `${TODAY}T15:00`),
      event('Point', `${TODAY}T09:30`, `${TODAY}T09:45`),
      event('Dentiste', `${TODAY}T16:00`, `${TODAY}T16:30`),
      event('Café', `${TODAY}T16:00`, `${TODAY}T16:15`),
      event('Soir', `${TODAY}T20:00`, `${TODAY}T22:00`),
      event('Congrès', addDays(TODAY, -1), addDays(TODAY, 2)),
    ];
    const birthdays = [{ key: `birthday:lea:${TODAY}`, contactId: 'lea', name: 'Léa Martin', day: TODAY, age: 35 }];
    const page: DayItem = { kind: 'page', key: `page-date:p:${TODAY}`, page: { key: `page-date:p:${TODAY}`, pageId: 'p', title: 'Compte rendu', day: TODAY, time: null } };
    const reminder = remindersIn([note('Appeler le garage', at(`${TODAY}T11:00`))], dayToInstant(TODAY), dayToInstant(TOMORROW))[0]!;
    const now = at(`${TODAY}T14:10`);
    const plan = planToday({
      today: TODAY,
      now,
      items: [page, ...items(events), ...birthdays.map((birthday): DayItem => ({ kind: 'birthday', key: birthday.key, birthday })), { kind: 'reminder', key: reminder.key, reminder }],
    });

    expect(plan.allDay.map(row => row.item.kind)).toEqual(['birthday', 'event', 'page']);
    expect(titles(plan.timed)).toEqual(['Point', 'Appeler le garage', 'Atelier', 'Dentiste', 'Café', 'Soir']);
    expect(plan.timed.map(row => row.state)).toEqual(['past', 'past', 'now', 'next', 'next', 'later']);
    // The now line lies under what has started.
    expect(plan.nowAt).toBe(3);
    expect(plan.empty).toBe(false);

    expect(rowStateWords(plan.timed[2]!, now, TODAY)).toBe('Encore 50 min');
    expect(rowStateWords(plan.timed[3]!, now, TODAY)).toBe('Dans 1 h 50');
    expect(rowStateWords(plan.timed[5]!, now, TODAY)).toBe('');
    // A minute on, both count down.
    expect(rowStateWords(plan.timed[3]!, now + 60_000, TODAY)).toBe('Dans 1 h 49');
  });

  it('counts a span in minutes and hours, never zero', () => {
    expect(spanWords(0.2)).toBe('1 min');
    expect(spanWords(20)).toBe('20 min');
    expect(spanWords(60)).toBe('1 h');
    expect(spanWords(65)).toBe('1 h 05');
    setLocale('en');
    expect(spanWords(65)).toBe('1 h 05');
    expect(rowStateWords({ state: 'next', startAt: 20 * 60_000, endAt: 30 * 60_000 }, 0, '1970-01-01')).toBe('In 20 min');
    expect(rowStateWords({ state: 'now', startAt: 0, endAt: 25 * 60_000 }, 0, '1970-01-01')).toBe('25 min left');
  });

  it('says « En cours » for what runs past tonight, and its hours as the day sees them', () => {
    const night = event('Garde', `${TODAY}T22:00`, `${TOMORROW}T06:00`);
    const plan = planToday({ today: TODAY, now: at(`${TODAY}T23:00`), items: items([night]) });
    expect(plan.timed[0]!.state).toBe('now');
    expect(rowStateWords(plan.timed[0]!, at(`${TODAY}T23:00`), TODAY)).toBe('En cours');
    expect(rowTimeWords(plan.timed[0]!, TODAY)).toBe('À partir de 22:00');
    const morning = planToday({ today: TOMORROW, now: at(`${TOMORROW}T05:00`), items: items([night], TOMORROW, addDays(TOMORROW, 2)) });
    expect(rowTimeWords(morning.timed[0]!, TOMORROW)).toBe('Jusqu’à 06:00');
    expect(rowStateWords(morning.timed[0]!, at(`${TOMORROW}T05:00`), TOMORROW)).toBe('Encore 1 h');
  });

  it('draws the now line on top when nothing has started, at the foot once all is over', () => {
    const events = [event('A', `${TODAY}T09:00`, `${TODAY}T10:00`), event('B', `${TODAY}T11:00`, `${TODAY}T12:00`)];
    expect(planToday({ today: TODAY, now: at(`${TODAY}T07:00`), items: items(events) }).nowAt).toBe(0);
    expect(planToday({ today: TODAY, now: at(`${TODAY}T18:00`), items: items(events) }).nowAt).toBe(2);
  });

  it('says an empty day, and looks at tomorrow: whole days, then its first events, the rest counted', () => {
    const later = Array.from({ length: TOMORROW_EVENTS + 2 }, (_, index) => event(`T${index}`, `${TOMORROW}T0${index + 1}:00`, `${TOMORROW}T0${index + 1}:30`));
    const plan = planToday({ today: TODAY, now: at(`${TODAY}T10:00`), items: items([...later, event('Férié', TOMORROW, addDays(TOMORROW, 1))]) });
    expect(plan.empty).toBe(true);
    expect(plan.tomorrow?.day).toBe(TOMORROW);
    expect(titles(plan.tomorrow!.rows)).toEqual(['Férié', 'T0', 'T1', 'T2']);
    expect(plan.tomorrow!.more).toBe(2);
    expect(planToday({ today: TODAY, now: 0, items: [] }).tomorrow).toBeNull();
  });

  it('leaves the day’s own page to « Note du jour »', () => {
    const daily: DayItem = { kind: 'page', key: `page-date:daily:${TODAY}`, page: { key: `page-date:daily:${TODAY}`, pageId: 'daily', title: 'Lundi 9 novembre 2026', day: TODAY, time: null } };
    expect(planToday({ today: TODAY, now: 0, items: [daily] }).allDay).toHaveLength(1);
    expect(planToday({ today: TODAY, now: 0, items: [daily], dailyPageId: 'daily' }).empty).toBe(true);
  });

  it('keeps Carnet’s reminders missed this week and still set, the most recent first', () => {
    const notes = [
      note('Hier', at(`${addDays(TODAY, -1)}T18:00`)),
      note('Samedi', at(`${addDays(TODAY, -2)}T09:00`)),
      note('Il y a longtemps', at(`${addDays(TODAY, -30)}T09:00`)),
      note('Rangée', at(`${addDays(TODAY, -1)}T09:00`), { archived: true }),
      note('Jetée', at(`${addDays(TODAY, -1)}T09:00`), { trashedAt: 5 }),
      note('Faite', null),
      note('Ce matin', at(`${TODAY}T08:00`)),
    ];
    const overdue = overdueReminders(notes, TODAY);
    expect(overdue.map(each => each.title)).toEqual(['Hier', 'Samedi']);
    expect(overdueWords(overdue[0]!, TODAY)).toBe('Hier · 18:00');
    expect(overdueWords(overdue[1]!, TODAY)).toMatch(/^sam\. 7\snov\. · 09:00$/);
  });

  it('asks the weather at the day’s placed events in order, then at home', () => {
    const plan = planToday({
      today: TODAY,
      now: 0,
      items: items([
        event('A', `${TODAY}T09:00`, `${TODAY}T10:00`, { place: 'Visio' }),
        event('B', `${TODAY}T11:00`, `${TODAY}T12:00`, { place: ' Lyon ' }),
        event('C', `${TODAY}T13:00`, `${TODAY}T14:00`),
      ]),
    });
    expect(weatherPlaces([...plan.allDay, ...plan.timed], 'Paris')).toEqual(['Visio', 'Lyon', 'Paris']);
    expect(weatherPlaces([], ' Paris ')).toEqual(['Paris']);
    expect(weatherPlaces([], '')).toEqual([]);
    expect(weatherWords({ day: TODAY, code: 3, max: 14.4, min: 6.6, rain: 10 })).toBe('Nuageux · 14° / 7°');
    expect(weatherWords({ day: TODAY, code: 61, max: 12, min: 8, rain: 64.6 })).toBe('Pluie · 12° / 8° · 65 % de pluie');
  });
});
