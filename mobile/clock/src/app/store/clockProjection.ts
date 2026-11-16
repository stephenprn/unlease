/**
 * Clock's records as screens read them: every alarm (`@unlease/clock/models/alarm`), deleted ones
 * too, and the live ones in the list's order (by time of day, then the oldest first: `byTime`). A
 * projection of the shared library (`@shared/app/store/library`): only the touched maps are replaced,
 * and an entry keeps its identity unless its own record changed.
 *
 * A leaf: it imports only the shared code and the packages.
 */
import type { SyncRecord } from '@unlease/core/sync/record';
import type { Alarm } from '@unlease/clock/models/alarm';
import { byTime } from '@unlease/clock/services/schedule';
import { alarmFromRecord } from '@unlease/clock/sync/entities';
import type { LibraryBase, LibraryProjection } from '@shared/app/store/library';

export interface ClockState extends LibraryBase {
  /** Every alarm this device holds, deleted ones too. */
  readonly alarms: Readonly<Record<string, Alarm>>;
  /** The live alarms, by time of day (`byTime`). */
  readonly alarmOrder: readonly string[];
}

const EMPTY: ClockState = { alarms: {}, alarmOrder: [], revision: 0 };

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function clockProjection(): LibraryProjection<ClockState> {
  function decode(base: ClockState, changed: readonly SyncRecord[]): ClockState {
    let alarms: Record<string, Alarm> | null = null;
    for (const record of changed) {
      if (record.type !== 'alarm') continue;
      alarms ??= { ...base.alarms };
      alarms[record.id] = alarmFromRecord(record);
    }
    if (!alarms) return base;
    const next = Object.values(alarms)
      .filter(alarm => alarm.deletedAt === null)
      .sort(byTime)
      .map(alarm => alarm.id);
    return { ...base, alarms, alarmOrder: sameIds(next, base.alarmOrder) ? base.alarmOrder : next };
  }
  return { empty: EMPTY, decode, clear: () => undefined };
}
