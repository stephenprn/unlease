/**
 * Clock's records as screens read them: every alarm (`@unlease/clock/models/alarm`), deleted ones
 * too, and the live ones in the list's order (by time of day, then the oldest first: `byTime`); the
 * saved timers the same (shortest first); the world clocks. A
 * projection of the shared library (`@shared/app/store/library`): only the touched maps are replaced,
 * and an entry keeps its identity unless its own record changed.
 *
 * A leaf: it imports only the shared code and the packages.
 */
import type { SyncRecord } from '@unlease/core/sync/record';
import type { Alarm } from '@unlease/clock/models/alarm';
import { byLength, type Timer } from '@unlease/clock/models/timer';
import type { WorldClock } from '@unlease/clock/models/worldClock';
import { byTime } from '@unlease/clock/services/schedule';
import { alarmFromRecord, timerFromRecord, worldClockFromRecord } from '@unlease/clock/sync/entities';
import type { LibraryBase, LibraryProjection } from '@shared/app/store/library';

export interface ClockState extends LibraryBase {
  /** Every alarm this device holds, deleted ones too. */
  readonly alarms: Readonly<Record<string, Alarm>>;
  /** The live alarms, by time of day (`byTime`). */
  readonly alarmOrder: readonly string[];
  /** Every saved timer, deleted ones too. */
  readonly timers: Readonly<Record<string, Timer>>;
  /** The live saved timers, shortest first (`byLength`). */
  readonly timerOrder: readonly string[];
  /** Every world clock, deleted ones too (the list orders itself by the hour: `liveWorldClocks`). */
  readonly worldClocks: Readonly<Record<string, WorldClock>>;
}

const EMPTY: ClockState = { alarms: {}, alarmOrder: [], timers: {}, timerOrder: [], worldClocks: {}, revision: 0 };

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function clockProjection(): LibraryProjection<ClockState> {
  function decode(base: ClockState, changed: readonly SyncRecord[]): ClockState {
    let alarms: Record<string, Alarm> | null = null;
    let timers: Record<string, Timer> | null = null;
    let worldClocks: Record<string, WorldClock> | null = null;
    for (const record of changed) {
      if (record.type === 'alarm') {
        alarms ??= { ...base.alarms };
        alarms[record.id] = alarmFromRecord(record);
      } else if (record.type === 'timer') {
        timers ??= { ...base.timers };
        timers[record.id] = timerFromRecord(record);
      } else if (record.type === 'worldClock') {
        worldClocks ??= { ...base.worldClocks };
        worldClocks[record.id] = worldClockFromRecord(record);
      }
    }
    if (!alarms && !timers && !worldClocks) return base;
    let next: ClockState = base;
    if (alarms) {
      const order = Object.values(alarms)
        .filter(alarm => alarm.deletedAt === null)
        .sort(byTime)
        .map(alarm => alarm.id);
      next = { ...next, alarms, alarmOrder: sameIds(order, base.alarmOrder) ? base.alarmOrder : order };
    }
    if (timers) {
      const order = Object.values(timers)
        .filter(timer => timer.deletedAt === null)
        .sort(byLength)
        .map(timer => timer.id);
      next = { ...next, timers, timerOrder: sameIds(order, base.timerOrder) ? base.timerOrder : order };
    }
    if (worldClocks) next = { ...next, worldClocks };
    return next;
  }
  return { empty: EMPTY, decode, clear: () => undefined };
}
