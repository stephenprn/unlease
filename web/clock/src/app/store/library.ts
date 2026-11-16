/**
 * Clock's library: every alarm, in memory, folded from the shell's records (`@shared/app/store/records`,
 * which writes them through to IndexedDB and syncs them). A leaf: it pulls in none of Clock's screens.
 *
 * Re-render discipline (load-bearing): the map is copied on write and an alarm is replaced only when
 * its own record changed, so a selector on one alarm re-renders for that alarm alone.
 */
import { create } from 'zustand';

import type { Alarm } from '@unlease/clock/models/alarm';
import { alarmFromRecord } from '@unlease/clock/sync/entities';
import { CLOCK_TYPES } from '@unlease/clock/sync/types';

import type { Projection } from '@shared/app/store/records';

export interface ClockState {
  /** Every alarm, live or a tombstone (`deletedAt`). */
  readonly alarms: Readonly<Record<string, Alarm>>;
  /** Bumped by every change: cheap invalidation for derived caches (the spotlight). */
  readonly revision: number;
}

const EMPTY: ClockState = { alarms: {}, revision: 0 };

export const useClockStore = create<ClockState>(() => EMPTY);

/** What the shell feeds: Clock's records, and only those. */
export const clockProjection: Projection = {
  types: CLOCK_TYPES,
  apply(changed, fresh) {
    useClockStore.setState(state => {
      const base = fresh ? EMPTY : state;
      let alarms = base.alarms;
      for (const record of changed) {
        if (record.type !== 'alarm') continue;
        if (alarms === base.alarms) alarms = { ...base.alarms };
        (alarms as Record<string, Alarm>)[record.id] = alarmFromRecord(record);
      }
      return { alarms, revision: base.revision + 1 };
    }, true);
  },
  clear() {
    useClockStore.setState(EMPTY, true);
  },
};
