/** An event's colour: its own, a live label's, its calendar's, else the colour of the person's own events, never the accent. */
import { readCalendarPrefs } from '../../models/prefs';
import type { CalendarFeed, CalendarLabel } from '../../models/events';
import { eventColor, OWN_EVENTS_COLOR } from '../colors';

const label = (id: string, color: CalendarLabel['color'], deletedAt: number | null = null) => ({ id, name: id, color, deletedAt }) as CalendarLabel;
const feed = (id: string, color: CalendarFeed['color']) => ({ id, color, deletedAt: null }) as CalendarFeed;

describe('an event’s colour', () => {
  const labels = { work: label('work', 'red'), gone: label('gone', 'olive', 5) };
  const feeds = { club: feed('club', 'sky') };

  it('is its own, then a live label’s, then its calendar’s', () => {
    expect(eventColor({ color: 'violet', labelIds: ['work'], feedId: null }, labels, feeds)).toBe('violet');
    expect(eventColor({ color: null, labelIds: ['gone', 'work'], feedId: null }, labels, feeds)).toBe('red');
    expect(eventColor({ color: null, labelIds: [], feedId: 'club' }, labels, feeds)).toBe('sky');
  });

  it('is the colour of one’s own events otherwise, blue until Réglages say', () => {
    expect(eventColor({ color: null, labelIds: ['gone'], feedId: null }, labels, feeds)).toBe(OWN_EVENTS_COLOR);
    expect(OWN_EVENTS_COLOR).toBe('blue');
    expect(eventColor({ color: null, labelIds: [], feedId: null }, labels, feeds, 'green')).toBe('green');
  });

  it('keeps a stored choice that is a pigment, and drops anything else', () => {
    expect(readCalendarPrefs({ ownColor: 'ochre' }).ownColor).toBe('ochre');
    expect(readCalendarPrefs({ ownColor: 'gold' }).ownColor).toBe('blue');
    expect(readCalendarPrefs({}).ownColor).toBe('blue');
  });
});

describe('a new event’s reminders', () => {
  it('ring 30 minutes before, time to leave; the 10 stored untouched before then takes the new default, a choice is kept', () => {
    expect(readCalendarPrefs({}).reminders).toEqual([30]);
    expect(readCalendarPrefs({ reminders: [10] }).reminders).toEqual([30]);
    expect(readCalendarPrefs({ reminders: [10, 60] }).reminders).toEqual([10, 60]);
    // Stored since: 10 is a choice.
    expect(readCalendarPrefs({ reminders: [10], version: 2 }).reminders).toEqual([10]);
    expect(readCalendarPrefs({ reminders: [10] }).version).toBe(2);
  });
});
