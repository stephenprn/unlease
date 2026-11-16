/**
 * What a person does to an alarm, each one batch: switching one on writes `switchedFields` (a
 * one-time alarm gone by takes its next day) and says when it rings; « Ignorer la prochaine » keeps
 * its next morning quiet, « Annuler » bringing it back; a copy is a new alarm; the evening check's
 * « Sonner à 6:30 » keeps a repeating alarm quiet that morning and sets a one-time one for it; the
 * erase tombstones every alarm. Clock syncs its own records and Agenda's.
 */
import { createId } from '@unlease/core/services/ids';
import { switchedFields } from '@unlease/clock/services/schedule';
import { alarmFields } from '@unlease/clock/sync/entities';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { syncedTypes } from '@shared/app/store/library';
import { useUiStore } from '@shared/app/store/uiStore';

import { createAlarm, deleteAlarm, duplicateAlarm, eraseAlarms, ringEarlier, skipNext, switchAlarm, unskip } from '../store/actions';
import { getRecord, loadLibrary, resetLibrary, useLibraryStore, writeLocal } from '../store/libraryStore';

jest.useFakeTimers();

const DRAFT = { time: '07:30', days: [1, 2, 3, 4, 5], label: '', sound: 'melody', vibrate: true, weather: true, agenda: true, offDays: false, link: null };
const clocks = (id: string): string[] => Object.values(getRecord('alarm', id)?.clocks ?? {}) as string[];
const alarm = (id: string) => useLibraryStore.getState().alarms[id]!;

describe('Clock, its actions', () => {
  beforeEach(() => {
    closeDatabase();
    resetLibrary();
    openDatabase({ name: 'actions.sqlite' });
    loadLibrary();
    // Monday 16 November 2026, 21:00 on this phone.
    jest.setSystemTime(new Date(2026, 10, 16, 21, 0, 0));
  });

  it('syncs its alarms and Agenda’s records', () => {
    expect(syncedTypes('clock')).toEqual(expect.arrayContaining(['alarm', 'calendarEvent', 'calendarFeed', 'calendarLabel']));
    expect(syncedTypes('clock')).not.toContain('contact');
  });

  it('switches a one-time alarm gone by back on, on the next day its time comes, in one batch', () => {
    const id = createId();
    // Set for last Friday morning: gone by, it reads as off.
    writeLocal([{ type: 'alarm', id, patch: alarmFields({ ...DRAFT, days: [], date: '2026-11-13', enabled: true, skipDay: null, offDays: false, eventId: null, eventStart: '', before: 0, createdAt: 1, deletedAt: null }) }]);
    const before = alarm(id);
    switchAlarm(id, true);
    expect(alarm(id)).toMatchObject({ enabled: true, ...switchedFields(before, true, Date.now()) });
    expect(alarm(id).date).toBe('2026-11-17');
    expect(useUiStore.getState().snack?.message).toBe('Alarme réglée dans 10 h 30');
    const written = getRecord('alarm', id)!.clocks;
    expect(written.enabled).toBe(written.date);

    switchAlarm(id, false);
    expect(alarm(id).enabled).toBe(false);
  });

  it('skips the next ring and brings it back', () => {
    const id = createAlarm(DRAFT);
    skipNext(id);
    expect(alarm(id).skipDay).toBe('2026-11-17');
    expect(useUiStore.getState().snack?.message).toBe('Elle ne sonnera pas le mar. 17\u00a0nov.');
    useUiStore.getState().snack?.action?.run();
    expect(alarm(id).skipDay).toBeNull();
    skipNext(id);
    unskip(id);
    expect(alarm(id).skipDay).toBeNull();
  });

  it('copies, deletes with a way back, and rings earlier one morning', () => {
    const id = createAlarm({ ...DRAFT, label: 'Piscine' });
    expect(new Set(clocks(id)).size).toBe(1);
    const copy = duplicateAlarm(id)!;
    expect(alarm(copy)).toMatchObject({ time: '07:30', days: [1, 2, 3, 4, 5], label: 'Piscine', enabled: true });

    deleteAlarm(copy);
    expect(alarm(copy).deletedAt).not.toBeNull();
    useUiStore.getState().snack?.action?.run();
    expect(alarm(copy).deletedAt).toBeNull();

    ringEarlier(id, '2026-11-17', '06:30');
    expect(alarm(id).skipDay).toBe('2026-11-17');
    const earlier = Object.values(useLibraryStore.getState().alarms).find(each => each.time === '06:30')!;
    expect(earlier).toMatchObject({ days: [], date: '2026-11-17', enabled: true, label: 'Piscine' });
    // One batch: the skip and the new alarm share one clock.
    expect(getRecord('alarm', id)!.clocks.skipDay).toBe(getRecord('alarm', earlier.id)!.clocks.time);
  });

  it('erases every alarm', () => {
    createAlarm(DRAFT);
    createAlarm({ ...DRAFT, time: '08:00' });
    expect(eraseAlarms(new Set(['alarms']))).toBe(2);
    expect(useLibraryStore.getState().alarmOrder).toEqual([]);
  });
});
