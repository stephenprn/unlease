import type { CalendarFeed, CalendarLabel } from '../../models/events';
import { CALENDAR_PREFS_DEFAULTS } from '../../models/prefs';
import { aloneShown, labelKey, readShownMemory, showAll, showOnly, shownChoices, shownNow, shownPatch } from '../shown';

const feed = (id: string, hidden = false, deletedAt: number | null = null): CalendarFeed => ({
  id,
  kind: 'ics',
  name: id,
  url: `https://example.org/${id}.ics`,
  account: '',
  color: 'violet',
  hidden,
  position: 'a0',
  refreshedAt: null,
  error: '',
  createdAt: 0,
  deletedAt,
});

// The web's list: one's own events, two calendars subscribed to, the layers (the pages' days off by default).
const listed = shownNow({ own: true, feeds: [feed('cinema'), feed('holidays'), feed('gone', false, 5)], prefs: CALENDAR_PREFS_DEFAULTS });

describe('the calendars shown', () => {
  it('lists one’s own (where the client can hide them), each live calendar, each layer', () => {
    expect(listed).toEqual({
      own: true,
      'feed:cinema': true,
      'feed:holidays': true,
      'layer:birthdays': true,
      'layer:noteReminders': true,
      'layer:pageDates': false,
      'layer:weather': true,
    });
    // The phone lists no « Mes événements »: its own events are never put away.
    expect(shownNow({ feeds: [feed('cinema', true)], prefs: CALENDAR_PREFS_DEFAULTS })).not.toHaveProperty('own');
  });

  it('puts every other one away, layers and one’s own included, and remembers what showed', () => {
    const { shown, memory } = showOnly(listed, 'feed:cinema', null);
    expect(aloneShown(shown)).toBe('feed:cinema');
    expect(memory).toEqual({ only: 'feed:cinema', before: listed });
    expect(shownPatch(listed, shown)).toEqual({
      feeds: [{ id: 'holidays', hidden: true }],
      labels: [],
      layers: { birthdays: false, noteReminders: false, weather: false },
      own: false,
    });
  });

  it('brings back what showed before, the pages’ days still off', () => {
    const only = showOnly(listed, 'layer:birthdays', null);
    const back = showAll(only.shown, only.memory);
    expect(back).toEqual(listed);
    expect(shownPatch(only.shown, back)).toEqual({
      feeds: [{ id: 'cinema', hidden: false }, { id: 'holidays', hidden: false }],
      labels: [],
      layers: { noteReminders: true, weather: true },
      own: true,
    });
  });

  it('keeps the first memory through a second « uniquement »', () => {
    const first = showOnly(listed, 'feed:cinema', null);
    const second = showOnly(first.shown, 'feed:holidays', first.memory);
    expect(aloneShown(second.shown)).toBe('feed:holidays');
    expect(second.memory.before).toEqual(listed);
    expect(showAll(second.shown, second.memory)).toEqual(listed);
  });

  it('starts a new memory once more than one shows again', () => {
    const first = showOnly(listed, 'feed:cinema', null);
    const byHand = { ...first.shown, 'feed:holidays': true };
    expect(showOnly(byHand, 'feed:holidays', first.memory).memory.before).toEqual(byHand);
  });

  it('puts away the labels too, where one’s own events are listed by them, and brings them back unticked as they were', () => {
    const label = (id: string, deletedAt: number | null = null): CalendarLabel => ({ id, name: id, color: 'blue', position: 'a0', createdAt: 0, deletedAt });
    const web = shownNow({ own: true, labels: { all: [label('work'), label('sport'), label('old', 3)], hidden: ['sport'] }, feeds: [feed('cinema')], prefs: CALENDAR_PREFS_DEFAULTS });
    expect(web).toMatchObject({ [labelKey('work')]: true, [labelKey('sport')]: false });
    expect(web).not.toHaveProperty(labelKey('old'));
    const only = showOnly(web, labelKey('work'), null);
    expect(shownPatch(web, only.shown)).toMatchObject({ feeds: [{ id: 'cinema', hidden: true }], labels: [], own: false });
    const cinema = showOnly(web, 'feed:cinema', null);
    expect(shownPatch(web, cinema.shown).labels).toEqual([{ id: 'work', hidden: true }]);
    expect(shownPatch(cinema.shown, showAll(cinema.shown, cinema.memory)).labels).toEqual([{ id: 'work', hidden: false }]);
  });

  it('shows a calendar subscribed to since, and drops one gone', () => {
    const { shown, memory } = showOnly(listed, 'own', null);
    const later: Record<string, boolean> = { ...shown, 'feed:new': false };
    delete later['feed:holidays'];
    const back = showAll(later, memory);
    expect(back['feed:new']).toBe(true);
    expect(back).not.toHaveProperty('feed:holidays');
    expect(back['feed:cinema']).toBe(true);
  });

  it('shows everything when nothing is remembered, or the memory would show nothing', () => {
    const none = Object.fromEntries(Object.keys(listed).map(key => [key, false]));
    expect(Object.values(showAll(none, null)).every(Boolean)).toBe(true);
    expect(Object.values(showAll(none, { only: 'own', before: none })).every(Boolean)).toBe(true);
  });

  it('offers « uniquement » unless alone already, and « Tout afficher » while one shows or none', () => {
    expect(shownChoices(listed, 'feed:cinema')).toEqual({ only: true, all: false });
    const { shown } = showOnly(listed, 'feed:cinema', null);
    expect(shownChoices(shown, 'feed:cinema')).toEqual({ only: false, all: true });
    expect(shownChoices(shown, 'own')).toEqual({ only: true, all: true });
    const none = Object.fromEntries(Object.keys(listed).map(key => [key, false]));
    expect(shownChoices(none, 'own')).toEqual({ only: true, all: true });
    // A single calendar listed has nothing to put away.
    expect(shownChoices({ 'feed:cinema': true }, 'feed:cinema')).toEqual({ only: false, all: false });
  });

  it('reads a stored memory whole, anything else as none', () => {
    expect(readShownMemory({ only: 'own', before: { own: true, 'feed:a': false, odd: 'yes' } })).toEqual({ only: 'own', before: { own: true, 'feed:a': false } });
    expect(readShownMemory(null)).toBeNull();
    expect(readShownMemory({ only: 3, before: {} })).toBeNull();
    expect(readShownMemory({ only: 'own', before: [true] })).toBeNull();
  });
});
