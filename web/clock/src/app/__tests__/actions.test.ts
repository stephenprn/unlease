import { beforeEach, describe, expect, it } from 'vitest';

import { allCities, type City } from '@unlease/clock/data/cities';
import { blankDraft } from '@unlease/clock/services/editing';
import { CLOCK_PREFS_DEFAULTS } from '@unlease/clock/models/prefs';
import { onceDate, skippedDay } from '@unlease/clock/services/schedule';
import { addDays, instantToDay } from '@unlease/calendar/services/time';
import { eventFields } from '@unlease/calendar/sync/entities';
import { blankDraft as blankEvent } from '@unlease/calendar/services/editing';

import { freshLibrary } from '@test/library';
import { getRecord, writeLocal } from '@shared/app/store/records';
import { clockModule } from '../../module';
import { useAgendaStore } from '../store/agenda';
import { addCity, createAlarm, createTimer, deleteAlarm, deleteTimer, duplicateAlarm, eraseClock, removeCity, renameCity, ringEarlier, saveAlarm, saveTimer, skipNext, stopSkipping, switchAlarm } from '../store/actions';
import { useClockStore } from '../store/library';

const state = () => useClockStore.getState();
const live = () => Object.values(state().alarms).filter(alarm => alarm.deletedAt === null);
const city = (name: string): City => allCities().find(each => each.name === name)!;
const draft = (extra: Partial<ReturnType<typeof blankDraft>> = {}) => ({ ...blankDraft(CLOCK_PREFS_DEFAULTS), ...extra });

/** Every field of the record written under one clock: one batch. */
const clocksOf = (id: string): string[] => [...new Set(Object.values(getRecord('alarm', id)!.clocks))];

describe('Clock’s actions', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('creates a one-time alarm whole in one batch, switched on, on the next day its time comes', () => {
    const now = Date.now();
    const id = createAlarm(draft({ time: '06:15', label: ' Train to Lyon ' }), now);
    expect(state().alarms[id]).toMatchObject({ time: '06:15', days: [], date: onceDate('06:15', now), enabled: true, label: 'Train to Lyon', sound: 'melody', skipDay: null, deletedAt: null });
    expect(clocksOf(id)).toHaveLength(1);
  });

  it('creates a repeating alarm with no day of its own', () => {
    const id = createAlarm(draft({ time: '07:30', days: [5, 1, 3] }));
    expect(state().alarms[id]).toMatchObject({ days: [1, 3, 5], date: null });
  });

  it('saves only what changed, switches the alarm on, and leaves the other fields’ clocks alone', () => {
    const id = createAlarm(draft({ time: '07:30', days: [1, 2, 3, 4, 5] }), Date.now() - 60_000);
    switchAlarm(id, false);
    const before = getRecord('alarm', id)!.clocks;
    saveAlarm(id, { ...draft({ time: '07:30', days: [1, 2, 3, 4, 5] }), label: 'Work' });
    const after = getRecord('alarm', id)!;
    expect(after.fields).toMatchObject({ label: 'Work', enabled: true });
    expect(after.clocks.label).toBe(after.clocks.enabled);
    expect(after.clocks.time).toBe(before.time);
    expect(after.clocks.sound).toBe(before.sound);
  });

  it('skips the next ring from the form in the same batch, and forgets it when asked', () => {
    const now = Date.now();
    const id = createAlarm(draft({ time: '07:30', days: [0, 1, 2, 3, 4, 5, 6] }), now);
    saveAlarm(id, draft({ time: '07:30', days: [0, 1, 2, 3, 4, 5, 6], label: 'Up' }), { skip: true }, now);
    const record = getRecord('alarm', id)!;
    expect(record.fields.label).toBe('Up');
    expect(skippedDay(state().alarms[id]!, now)).not.toBeNull();
    expect(record.clocks.skipDay).toBe(record.clocks.label);
    saveAlarm(id, draft({ time: '07:30', days: [0, 1, 2, 3, 4, 5, 6], label: 'Up' }), { skip: false }, now);
    expect(state().alarms[id]!.skipDay).toBeNull();
  });

  it('switches a one-time alarm gone by on again, for the next day its time comes, and takes it back', () => {
    const now = Date.now();
    const id = createAlarm(draft({ time: '06:15' }), now);
    // It rang three days ago (another device moved its day), and was switched off.
    writeLocal([{ type: 'alarm', id, patch: { date: addDays(instantToDay(now), -3), enabled: false } }]);
    const undo = switchAlarm(id, true, now);
    expect(state().alarms[id]).toMatchObject({ enabled: true, date: onceDate('06:15', now) });
    undo();
    expect(state().alarms[id]).toMatchObject({ enabled: false, date: addDays(instantToDay(now), -3) });
  });

  it('skips the next ring of a repeating alarm and rings it again', () => {
    const now = Date.now();
    const id = createAlarm(draft({ time: '07:30', days: [0, 1, 2, 3, 4, 5, 6] }), now);
    expect(skipNext(id, now)).not.toBeNull();
    expect(skippedDay(state().alarms[id]!, now)).not.toBeNull();
    stopSkipping(id, now);
    expect(state().alarms[id]!.skipDay).toBeNull();
    // A one-time alarm has no next one to skip.
    expect(skipNext(createAlarm(draft({ time: '06:15' })), now)).toBeNull();
  });

  it('rings earlier one morning: a repeating alarm kept quiet and a one-time one set, in one batch, and back', () => {
    const now = Date.now();
    const id = createAlarm(draft({ time: '07:30', days: [0, 1, 2, 3, 4, 5, 6] }), now);
    const tomorrow = addDays(instantToDay(now), 1);
    const undo = ringEarlier(id, tomorrow, '06:30', now);
    expect(state().alarms[id]!.skipDay).toBe(tomorrow);
    const made = live().find(alarm => alarm.id !== id)!;
    expect(made).toMatchObject({ time: '06:30', days: [], date: tomorrow, enabled: true });
    expect(getRecord('alarm', made.id)!.clocks.time).toBe(getRecord('alarm', id)!.clocks.skipDay);
    undo();
    expect(state().alarms[id]!.skipDay).toBeNull();
    expect(live().map(alarm => alarm.id)).toEqual([id]);
  });

  it('deletes an alarm and brings it back', () => {
    const id = createAlarm(draft());
    const undo = deleteAlarm(id);
    expect(state().alarms[id]!.deletedAt).not.toBeNull();
    undo();
    expect(state().alarms[id]!.deletedAt).toBeNull();
  });

  it('duplicates an alarm beside it, new from now', () => {
    const id = createAlarm(draft({ time: '09:00', days: [6], label: 'Market', sound: 'birdsong', weather: false }), 1_000);
    const now = Date.now();
    const copy = duplicateAlarm(id, now)!;
    expect(copy).not.toBe(id);
    expect(state().alarms[copy]).toMatchObject({ time: '09:00', days: [6], label: 'Market', sound: 'birdsong', weather: false, createdAt: now, deletedAt: null });
    expect(clocksOf(copy)).toHaveLength(1);
  });

  it('erases the parts chosen in one batch, as « Effacer des données » asks', () => {
    createAlarm(draft());
    createAlarm(draft({ days: [1] }));
    createTimer({ label: 'Pasta', seconds: 540, sound: 'bell', vibrate: true });
    addCity(city('Tokyo'));
    expect(clockModule.erase!.parts()).toEqual([
      expect.objectContaining({ id: 'alarms', count: 2 }),
      expect.objectContaining({ id: 'timers', count: 1 }),
      expect.objectContaining({ id: 'worldClocks', count: 1 }),
    ]);
    expect(clockModule.erase!.run(new Set(['alarms']))).toBe(2);
    expect(Object.values(state().alarms).every(alarm => alarm.deletedAt !== null)).toBe(true);
    expect(Object.values(state().timers).every(timer => timer.deletedAt === null)).toBe(true);
    expect(eraseClock(new Set(['alarms']))).toBe(0);
    expect(eraseClock(new Set(['timers', 'worldClocks']))).toBe(2);
    expect(Object.values(state().worldClocks).every(clock => clock.deletedAt !== null)).toBe(true);
  });

  it('saves a timer whole in one batch, then only what changed, and its delete is taken back', () => {
    const id = createTimer({ label: '  Green   tea ', seconds: 180, sound: 'chimes', vibrate: true }, Date.now() - 60_000);
    expect(state().timers[id]).toMatchObject({ label: 'Green tea', seconds: 180, sound: 'chimes', vibrate: true, deletedAt: null });
    expect(new Set(Object.values(getRecord('timer', id)!.clocks)).size).toBe(1);
    const before = getRecord('timer', id)!.clocks;
    saveTimer(id, { label: 'Green tea', seconds: 240, sound: 'chimes', vibrate: true });
    const after = getRecord('timer', id)!;
    expect(after.fields.seconds).toBe(240);
    expect(after.clocks.label).toBe(before.label);
    const undo = deleteTimer(id);
    expect(state().timers[id]!.deletedAt).not.toBeNull();
    undo();
    expect(state().timers[id]!.deletedAt).toBeNull();
  });

  it('adds a city once, renames it (its own name back when emptied), and takes its removal back', () => {
    const tokyo = city('Tokyo');
    const id = addCity(tokyo);
    expect(addCity(tokyo)).toBe(id);
    expect(Object.values(state().worldClocks)).toHaveLength(1);
    expect(state().worldClocks[id]).toMatchObject({ zone: 'Asia/Tokyo', country: 'JP', deletedAt: null });
    renameCity(id, ' Office ');
    expect(state().worldClocks[id]!.name).toBe('Office');
    renameCity(id, '   ');
    expect(state().worldClocks[id]!.name).toBe('Tokyo');
    const undo = removeCity(id);
    expect(state().worldClocks[id]!.deletedAt).not.toBeNull();
    undo();
    expect(state().worldClocks[id]!.deletedAt).toBeNull();
  });

  it('holds Agenda’s events, read only, for what an alarm says as it rings', () => {
    const day = instantToDay(Date.now());
    writeLocal([{ type: 'calendarEvent', id: 'standup', patch: eventFields({ ...blankEvent(`${day}T09:30`, `${day}T09:45`, 'Europe/Paris'), title: 'Stand-up', exdates: [], recurringId: null, originalStart: '', feedId: null, uid: '', trashedAt: null, createdAt: 1, deletedAt: null }) }]);
    expect(useAgendaStore.getState().events.standup?.title).toBe('Stand-up');
  });
});
