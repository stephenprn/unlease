/**
 * What an app that rings arms, rings at once and lets go, from what it wants and what this phone armed.
 */
import { closeDatabase, openDatabase } from '../../data/db/database';
import { writePreference } from '../../data/repositories/stateRepository';
import { mustArmAgain, planAlarms, readBook, rememberMode, type AlarmEntry } from '../alarms';

const NOW = Date.UTC(2026, 10, 4, 13, 0);
const MINUTE = 60_000;
const book = (entries: Record<string, AlarmEntry>) => new Map(Object.entries(entries));

describe('planAlarms', () => {
  it('arms what is to come and not armed so, and nothing twice', () => {
    const wanted = book({ a: { at: NOW + MINUTE, key: 'a' }, b: { at: NOW + 2 * MINUTE, key: 'b' }, c: { at: NOW + 3 * MINUTE, key: 'c2' } });
    const armed = book({ b: { at: NOW + 2 * MINUTE, key: 'b' }, c: { at: NOW + 3 * MINUTE, key: 'c1' }, d: { at: NOW + MINUTE, key: 'd' } });
    expect(planAlarms(wanted, armed, NOW)).toEqual({ arm: ['a', 'c'], ringNow: [], gone: ['d'] });
    expect(planAlarms(wanted, armed, NOW, { armAll: true }).arm).toEqual(['a', 'b', 'c']);
  });

  it('rings at once one whose moment went by unarmed, or moved into the past before it came; never one that rang', () => {
    const wanted = book({ synced: { at: NOW - 5 * MINUTE, key: '' }, moved: { at: NOW - MINUTE, key: '' }, rang: { at: NOW - 5 * MINUTE, key: '' }, renamed: { at: NOW - 5 * MINUTE, key: 'new' } });
    const armed = book({ moved: { at: NOW + 30 * MINUTE, key: '' }, rang: { at: NOW - 5 * MINUTE, key: '' }, renamed: { at: NOW - 5 * MINUTE, key: 'old' } });
    expect(planAlarms(wanted, armed, NOW).ringNow).toEqual(['synced', 'moved']);
    expect(planAlarms(wanted, armed, NOW, { ringLate: false }).ringNow).toEqual([]);
  });
});

describe('readBook', () => {
  it('reads each moment from the key kept, and skips what it cannot read', () => {
    const key = JSON.stringify([NOW, 'Réunion', '14:00']);
    expect(readBook({ a: key, b: 'not json', c: 3, d: JSON.stringify(['x']) })).toEqual(new Map([['a', { at: NOW, key }]]));
    expect(readBook(null).size).toBe(0);
  });
});

describe('mustArmAgain', () => {
  beforeEach(() => {
    closeDatabase();
    openDatabase({ name: 'alarms.sqlite' });
  });

  it('arms every alarm again the first time, and once after a build that armed them another way', async () => {
    expect(await mustArmAgain('book', 'exact')).toEqual({ armAll: true, first: true });
    // A build before the launcher's entries kept the mode alone: its alarms' taps name the launcher's activity.
    writePreference('book.alarmMode', 'exact');
    expect(await mustArmAgain('book', 'exact')).toEqual({ armAll: true, first: false });
    rememberMode('book', 'exact');
    expect(await mustArmAgain('book', 'exact')).toEqual({ armAll: false, first: false });
    expect((await mustArmAgain('book', 'inexact')).armAll).toBe(true);
  });
});
