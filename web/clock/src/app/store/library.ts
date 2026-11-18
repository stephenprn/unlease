/**
 * Clock's library: every alarm, saved timer and world clock, in memory, folded from the shell's
 * records (`@shared/app/store/records`, which writes them through to IndexedDB and syncs them). A
 * leaf: it pulls in none of Clock's screens. A timer that runs and the stopwatch are never records:
 * they are this browser's (`./tools`).
 *
 * Re-render discipline (load-bearing): each map is copied on write and an entry is replaced only when
 * its own record changed, so a selector on one alarm re-renders for that alarm alone.
 */
import { create } from 'zustand';

import type { Alarm } from '@unlease/clock/models/alarm';
import type { Timer } from '@unlease/clock/models/timer';
import type { WorldClock } from '@unlease/clock/models/worldClock';
import { alarmFromRecord, timerFromRecord, worldClockFromRecord } from '@unlease/clock/sync/entities';
import { CLOCK_TYPES } from '@unlease/clock/sync/types';

import type { Projection } from '@shared/app/store/records';

export interface ClockState {
  /** Every alarm, live or a tombstone (`deletedAt`). */
  readonly alarms: Readonly<Record<string, Alarm>>;
  /** Every saved timer, live or a tombstone. */
  readonly timers: Readonly<Record<string, Timer>>;
  /** Every world clock, live or a tombstone. */
  readonly worldClocks: Readonly<Record<string, WorldClock>>;
  /** Bumped by every change: cheap invalidation for derived caches (the spotlight). */
  readonly revision: number;
}

const EMPTY: ClockState = { alarms: {}, timers: {}, worldClocks: {}, revision: 0 };

export const useClockStore = create<ClockState>(() => EMPTY);

/** What the shell feeds: Clock's records, and only those. */
export const clockProjection: Projection = {
  types: CLOCK_TYPES,
  apply(changed, fresh) {
    useClockStore.setState(state => {
      const base = fresh ? EMPTY : state;
      let alarms = base.alarms as Record<string, Alarm>;
      let timers = base.timers as Record<string, Timer>;
      let worldClocks = base.worldClocks as Record<string, WorldClock>;
      for (const record of changed) {
        if (record.type === 'alarm') {
          if (alarms === base.alarms) alarms = { ...base.alarms };
          alarms[record.id] = alarmFromRecord(record);
        } else if (record.type === 'timer') {
          if (timers === base.timers) timers = { ...base.timers };
          timers[record.id] = timerFromRecord(record);
        } else if (record.type === 'worldClock') {
          if (worldClocks === base.worldClocks) worldClocks = { ...base.worldClocks };
          worldClocks[record.id] = worldClockFromRecord(record);
        }
      }
      return { alarms, timers, worldClocks, revision: base.revision + 1 };
    }, true);
  },
  clear() {
    useClockStore.setState(EMPTY, true);
  },
};
