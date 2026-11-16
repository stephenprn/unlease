/** « Jours travaillés seulement »: the week and the month without the days not worked, on both clients; and a day off is an all-day event's. */
import { setLocale } from '@unlease/core/i18n';
import type { SyncRecord } from '@unlease/core/sync/record';
import type { CalendarEvent } from '../../models/events';
import { eventFromRecord } from '../../sync/entities';
import { blankDraft, createEvent, draftOf } from '../editing';
import { keepWeekdays, shownWeekdays, viewDays, viewTitle, workingDaysMeta } from '../eventText';
import { layoutBars } from '../layout';
import { occurrencesIn } from '../occurrences';
import { monthGrid } from '../time';

/** An event as stored, from a draft. */
function stored(id: string, draft: ReturnType<typeof blankDraft>): CalendarEvent {
  const change = createEvent(draft, 1, id);
  return eventFromRecord({ type: 'calendarEvent', id, fields: change.patch, clocks: {} } as SyncRecord);
}

describe('the days a week shows', () => {
  beforeEach(() => setLocale('fr'));

  it('keeps every day unless only the working days are asked, and then only when some are worked but not all', () => {
    expect(shownWeekdays(false, [1, 2, 3, 4, 5])).toBeNull();
    expect(shownWeekdays(true, [1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4, 5]);
    expect(shownWeekdays(true, [5, 1, 3, 3])).toEqual([1, 3, 5]);
    // None worked, or all seven: a week of nothing, or of everything, hides nothing.
    expect(shownWeekdays(true, [])).toBeNull();
    expect(shownWeekdays(true, [0, 1, 2, 3, 4, 5, 6])).toBeNull();
  });

  it('leaves the days not worked out of the week, wherever they fall in it', () => {
    // The week of Monday 16 November 2026, from Monday.
    expect(viewDays('week', '2026-11-18', 1)).toHaveLength(7);
    expect(viewDays('week', '2026-11-18', 1, [1, 2, 3, 4, 5])).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
    // Sunday to Thursday, the week from Monday: Sunday stays at the week's end.
    expect(viewDays('week', '2026-11-18', 1, [0, 1, 2, 3, 4])).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-22']);
    expect(viewDays('week', '2026-11-18', 0, [1, 3, 5])).toEqual(['2026-11-16', '2026-11-18', '2026-11-20']);
    // A day and three days show what they show.
    expect(viewDays('day', '2026-11-21', 1, [1, 2, 3, 4, 5])).toEqual(['2026-11-21']);
    expect(viewDays('threeDays', '2026-11-20', 1, [1, 2, 3, 4, 5])).toEqual(['2026-11-20', '2026-11-21', '2026-11-22']);
  });

  it('titles the week by the days it shows', () => {
    // Its spaces are non-breaking ones.
    expect(viewTitle('week', '2026-11-18', 1)).toMatch(/^16\s–\s22\snov\.\s2026$/);
    expect(viewTitle('week', '2026-11-18', 1, [1, 2, 3, 4, 5])).toMatch(/^16\s–\s20\snov\.\s2026$/);
    expect(viewTitle('week', '2026-11-18', 1, [2, 3, 4, 5, 6])).toMatch(/^17\s–\s21\snov\.\s2026$/);
  });

  it('keeps the month’s columns to the days worked, every week alike', () => {
    const weeks = monthGrid('2026-11-01', 1).map(week => keepWeekdays(week, [1, 3, 5]));
    expect(weeks.every(week => week.length === 3)).toBe(true);
    expect(weeks[0]).toEqual(['2026-10-26', '2026-10-28', '2026-10-30']);
    expect(keepWeekdays(['2026-11-16', '2026-11-17'], null)).toEqual(['2026-11-16', '2026-11-17']);
    expect(keepWeekdays(['2026-11-16', '2026-11-17'], [])).toEqual(['2026-11-16', '2026-11-17']);
  });

  it('places bars on the days shown only, running on over the days left out', () => {
    const days = viewDays('week', '2026-11-18', 1, [1, 3, 5]);
    const events = [
      // Tuesday alone: on no day shown.
      stored('tuesday', blankDraft('2026-11-17', '2026-11-18', '')),
      // Tuesday to Thursday: Wednesday's column alone, started before it.
      stored('midweek', blankDraft('2026-11-17', '2026-11-20', '')),
      // Monday to Friday: the three columns.
      stored('week', blankDraft('2026-11-16', '2026-11-21', '')),
    ];
    const row = layoutBars(occurrencesIn(events, '2026-11-16', '2026-11-23'), days, { timed: false, maxLanes: 3 });
    const bars = Object.fromEntries(row.bars.map(bar => [bar.occurrence.seriesId, bar]));
    expect(bars.tuesday).toBeUndefined();
    expect(bars.midweek).toMatchObject({ column: 1, span: 1, continuesBefore: true, continuesAfter: true });
    expect(bars.week).toMatchObject({ column: 0, span: 3, continuesBefore: false, continuesAfter: false });
  });

  it('places bars as before on a week with no day left out', () => {
    const days = viewDays('week', '2026-11-18', 1);
    const row = layoutBars(occurrencesIn([stored('trip', blankDraft('2026-11-14', '2026-11-18', ''))], '2026-11-16', '2026-11-23'), days, { timed: false, maxLanes: 3 });
    expect(row.bars[0]).toMatchObject({ column: 0, span: 2, continuesBefore: true, continuesAfter: false });
  });

  it('says which days, and where they are chosen', () => {
    expect(workingDaysMeta([1, 2, 3, 4, 5])).toBe('Du lundi au vendredi, comme choisi dans l’Administration (« Votre semaine »).');
    setLocale('en');
    expect(workingDaysMeta([1, 3, 5])).toBe('Monday, Wednesday, Friday, as chosen in the Administration (“Your week”).');
  });
});

describe('a day off', () => {
  it('is an all-day event’s, never a timed one’s', () => {
    const allDay = stored('off', { ...blankDraft('2026-11-20', '2026-11-21', ''), dayOff: true });
    expect(allDay.dayOff).toBe(true);
    const timed = stored('meeting', { ...blankDraft('2026-11-20T09:00', '2026-11-20T10:00', 'Europe/Paris'), dayOff: true });
    expect(timed.dayOff).toBe(false);
    // The form opens on what the event says.
    const [occurrence] = occurrencesIn([allDay], '2026-11-20', '2026-11-21');
    expect(draftOf(occurrence!, allDay).dayOff).toBe(true);
  });
});
