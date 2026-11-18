/** Alarms in the spotlight: by their label, their time as typed every way, their days. */
import { setLocale } from '@unlease/core/i18n';
import { buildIndex, parseQuery, search } from '@unlease/core/services/searchIndex';
import type { Alarm } from '../../models/alarm';
import { alarmAnswers, clockSpotlightDocs, timeSpellings } from '../spotlight';

function alarm(extra: Partial<Alarm> = {}): Alarm {
  return {
    id: 'a',
    time: '07:30',
    days: [1, 2, 3, 4, 5],
    date: null,
    enabled: true,
    label: '',
    sound: 'melody',
    vibrate: true,
    weather: true,
    agenda: true,
    skipDay: null,
    offDays: false,
    eventId: null,
    eventStart: '',
    before: 0,
    createdAt: 1,
    deletedAt: null,
    editedAt: 1,
    ...extra,
  };
}

describe('alarms in the spotlight', () => {
  beforeEach(() => setLocale('en'));

  it('spells a time every way it is typed', () => {
    expect(timeSpellings('07:30').split(' ')).toEqual(expect.arrayContaining(['07:30', '7:30', '7h30', '730', '0730', '7:30am']));
    expect(timeSpellings('18:00').split(' ')).toEqual(expect.arrayContaining(['18:00', '18h00', '6:00pm', '6pm']));
    expect(timeSpellings('00:15').split(' ')).toEqual(expect.arrayContaining(['0h15', '12:15am']));
  });

  it('makes a document of each live alarm, its label the title and its days as meta', () => {
    const docs = clockSpotlightDocs([alarm({ id: 'work', label: 'Work' }), alarm({ id: 'gone', deletedAt: 5 }), alarm({ id: 'sat', time: '09:00', days: [6] })], 0, 1);
    expect(docs.map(doc => doc.key)).toEqual(['alarm:work', 'alarm:sat']);
    expect(docs[0]).toMatchObject({ title: 'Work', meta: { type: 'alarm', id: 'work', within: null } });
    expect(docs[0]!.parts.find(part => part.role === 'meta')?.text).toBe('Weekdays');
  });

  it('is found by its label or its time', () => {
    const index = buildIndex(clockSpotlightDocs([alarm({ id: 'work', label: 'Work' }), alarm({ id: 'train', time: '06:15', days: [], date: '2026-11-20', label: 'Train to Lyon' })], 0, 1));
    const found = (typed: string): string[] => search(index, parseQuery(typed)).hits.filter(hit => hit.missing.length === 0).map(hit => hit.doc.meta.id);
    expect(found('lyon')).toEqual(['train']);
    expect(found('6h15')).toEqual(['train']);
    expect(found('7:30')).toEqual(['work']);
  });

  it('finds an alarm on a home by its label or its time as typed', () => {
    const alarm = { label: 'Train pour Lyon', time: '07:30' };
    expect(alarmAnswers(alarm, '')).toBe(true);
    expect(alarmAnswers(alarm, 'lyon')).toBe(true);
    expect(alarmAnswers(alarm, '7h30')).toBe(true);
    expect(alarmAnswers(alarm, '730')).toBe(true);
    expect(alarmAnswers(alarm, '8h')).toBe(false);
  });
});
