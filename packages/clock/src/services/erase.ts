/**
 * « Effacer des données » in Clock (`core/services/erase`): three parts, the alarms (switched on or
 * off), the saved timers and the world clocks. A timer that runs and the stopwatch are the device's,
 * never records: nothing here touches them.
 */
import { t } from '@unlease/core/i18n';
import { tombstones, type EraseChange, type ErasePart } from '@unlease/core/services/erase';
import { plural } from '@unlease/core/services/format';
import type { Alarm } from '../models/alarm';
import type { Timer } from '../models/timer';
import type { WorldClock } from '../models/worldClock';

export const CLOCK_ERASE_PARTS = ['alarms', 'timers', 'worldClocks'] as const;

/** What Clock holds, as each client's library has it. */
export interface ClockRecords {
  readonly alarms: Readonly<Record<string, Alarm>>;
  readonly timers: Readonly<Record<string, Timer>>;
  readonly worldClocks: Readonly<Record<string, WorldClock>>;
}

const live = <T extends { readonly deletedAt: number | null }>(items: Readonly<Record<string, T>>): T[] => Object.values(items).filter(item => item.deletedAt === null);

export function eraseParts(records: ClockRecords): ErasePart[] {
  const alarms = live(records.alarms).length;
  const timers = live(records.timers).length;
  const clocks = live(records.worldClocks).length;
  return [
    { id: 'alarms', title: t('Alarms'), detail: alarms === 0 ? t('No alarms') : plural(alarms, 'alarm'), count: alarms, glyph: 'alarm' },
    { id: 'timers', title: t('Saved timers'), detail: timers === 0 ? t('No saved timers') : plural(timers, 'saved timer'), count: timers, glyph: 'timer' },
    { id: 'worldClocks', title: t('World clocks'), detail: clocks === 0 ? t('No cities') : plural(clocks, 'city', 'cities'), count: clocks, glyph: 'globe' },
  ];
}

export function eraseChanges(records: ClockRecords, chosen: ReadonlySet<string>, now: number): EraseChange[] {
  return [
    ...(chosen.has('alarms') ? tombstones('alarm', live(records.alarms).map(alarm => alarm.id), now) : []),
    ...(chosen.has('timers') ? tombstones('timer', live(records.timers).map(timer => timer.id), now) : []),
    ...(chosen.has('worldClocks') ? tombstones('worldClock', live(records.worldClocks).map(clock => clock.id), now) : []),
  ];
}
