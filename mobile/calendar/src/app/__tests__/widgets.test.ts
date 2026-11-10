/** What the widgets are handed: the schedule's days, the month's marked days, the next event, a countdown's event and its picker's rows. */
import { CALENDAR_PREFS_DEFAULTS } from '@unlease/calendar/models/prefs';
import { blankDraft } from '@unlease/calendar/services/editing';
import { dayDistance, weekdayDay } from '@unlease/calendar/services/eventText';
import { findOccurrence } from '@unlease/calendar/services/occurrences';
import { addDays, today } from '@unlease/calendar/services/time';
import { closeDatabase, openDatabase } from '@shared/data/db/database';

import { addEvent, createLabel, deleteEvent } from '../store/actions';
import { loadLibrary, resetLibrary, useLibraryStore } from '../store/libraryStore';
import { countdownChoices, countdownPayload, countdownTarget, monthPayload, nextPayload, schedulePayload } from '../widgetPayloads';

const now = Date.now();
const day = today(now);

beforeEach(() => {
  closeDatabase();
  resetLibrary();
  openDatabase({ name: 'widgets.sqlite' });
  loadLibrary();
});

describe('the widgets’ pictures', () => {
  it('hands the schedule its days, the month its marks and the next event', () => {
    const tomorrow = addDays(day, 1);
    const id = addEvent({ ...blankDraft(`${tomorrow}T09:00`, `${tomorrow}T10:00`, ''), title: 'Dentiste', place: 'Cabinet' });
    addEvent({ ...blankDraft(addDays(day, 3), addDays(day, 4), ''), title: 'Vacances' });
    const state = useLibraryStore.getState();
    const prefs = CALENDAR_PREFS_DEFAULTS;

    const schedule = schedulePayload(state, prefs, now);
    expect(schedule.days.map(each => each.day)).toEqual([tomorrow, addDays(day, 3)]);
    expect(schedule.days[0]!.items[0]).toMatchObject({ title: 'Dentiste', time: '09:00 – 10:00', place: 'Cabinet', open: `event/${id}?at=${encodeURIComponent(`${tomorrow}T09:00`)}` });

    const month = monthPayload(state, prefs, now);
    const cells = month.months[0]!.weeks.flat();
    expect(cells.find(cell => cell.day === tomorrow)?.count).toBe(1);
    expect(month.weekdays).toHaveLength(7);

    const next = nextPayload(state, prefs, now);
    expect(next.items[0]).toMatchObject({ title: 'Dentiste', day: tomorrow });
  });
});

describe('the countdown', () => {
  const prefs = CALENDAR_PREFS_DEFAULTS;
  const year = Number(day.slice(0, 4));

  it('hands over the day an event falls on and the words of its line', () => {
    const party = addDays(day, 12);
    const label = createLabel('Famille', 'green');
    const id = addEvent({ ...blankDraft(`${party}T14:30`, `${party}T18:00`, ''), title: 'Mariage de Léa', labelIds: [label] });
    const payload = countdownPayload(countdownTarget(id), useLibraryStore.getState(), prefs, now);
    expect(payload).toMatchObject({ id: 'countdown', target: `event:${id}`, gone: false, title: 'Mariage de Léa', color: 'green' });
    expect(payload.occurrences).toEqual([
      {
        day: party,
        lastDay: party,
        endAt: expect.any(Number),
        when: `${weekdayDay(party, year)} · 14:30`,
        time: '14:30',
        onDay: '14:30 – 18:00',
        open: `event/${id}?at=${encodeURIComponent(`${party}T14:30`)}`,
      },
    ]);
  });

  it('says a stay of several days from its first to its last', () => {
    const from = addDays(day, 30);
    const id = addEvent({ ...blankDraft(from, addDays(from, 3), ''), title: 'Vacances' });
    const [stay] = countdownPayload(countdownTarget(id), useLibraryStore.getState(), prefs, now).occurrences;
    expect(stay).toMatchObject({ day: from, lastDay: addDays(from, 2), time: '', when: `Du ${weekdayDay(from, year)} au ${weekdayDay(addDays(from, 2), year)}`, onDay: `Jusqu’au ${weekdayDay(addDays(from, 2), year)}` });
  });

  it('counts to a repeating event’s next times, and keeps one gone by', () => {
    const weekly = addEvent({ ...blankDraft(addDays(day, -21), addDays(day, -20), ''), title: 'Marché', rrule: 'FREQ=WEEKLY' });
    const past = addEvent({ ...blankDraft(addDays(day, -3), addDays(day, -2), ''), title: 'Concert' });
    const state = useLibraryStore.getState();

    const next = countdownPayload(countdownTarget(weekly), state, prefs, now).occurrences;
    expect(next.map(each => each.day)).toEqual(Array.from({ length: 8 }, (_, index) => addDays(day, 7 * index)));
    expect(next[1]!.open).toBe(`event/${weekly}?at=${encodeURIComponent(addDays(day, 7))}`);

    // An event that does not repeat stays: the widget counts the days since.
    expect(countdownPayload(countdownTarget(past), state, prefs, now)).toMatchObject({ gone: false, occurrences: [{ day: addDays(day, -3) }] });
  });

  it('says when its event is in the bin or not on this phone', () => {
    const id = addEvent({ ...blankDraft(addDays(day, 5), addDays(day, 6), ''), title: 'Dentiste' });
    deleteEvent(findOccurrence(useLibraryStore.getState().events, id, null)!, 'all');
    const state = useLibraryStore.getState();
    expect(countdownPayload(countdownTarget(id), state, prefs, now)).toMatchObject({ gone: true, occurrences: [] });
    expect(countdownPayload(countdownTarget('nowhere'), state, prefs, now).gone).toBe(true);
  });

  it('offers what is coming, one row per event, the nearest first; a search finds the past too', () => {
    addEvent({ ...blankDraft(addDays(day, -14), addDays(day, -13), ''), title: 'Yoga', rrule: 'FREQ=WEEKLY' });
    addEvent({ ...blankDraft(addDays(day, 2), addDays(day, 3), ''), title: 'Anniversaire de Paul' });
    addEvent({ ...blankDraft(addDays(day, -40), addDays(day, -39), ''), title: 'Anniversaire de Léa' });
    const state = useLibraryStore.getState();

    const coming = countdownChoices(state, prefs, '', now);
    expect(coming.map(each => each.title)).toEqual(['Yoga', 'Anniversaire de Paul']);
    expect(coming[1]).toMatchObject({ when: weekdayDay(addDays(day, 2), year), distance: dayDistance(addDays(day, 2), day) });

    const found = countdownChoices(state, prefs, 'anniversaire', now);
    expect(found.map(each => each.title)).toEqual(['Anniversaire de Paul', 'Anniversaire de Léa']);
    expect(found[1]!.distance).toBe(dayDistance(addDays(day, -40), day));
  });
});
