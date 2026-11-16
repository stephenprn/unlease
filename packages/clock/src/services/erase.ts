/**
 * « Effacer des données » in Clock (`core/services/erase`): one part, the alarms (switched on or off).
 */
import { t } from '@unlease/core/i18n';
import { tombstones, type EraseChange, type ErasePart } from '@unlease/core/services/erase';
import { plural } from '@unlease/core/services/format';
import type { Alarm } from '../models/alarm';

export const CLOCK_ERASE_PARTS = ['alarms'] as const;

const live = (alarms: Readonly<Record<string, Alarm>>): Alarm[] => Object.values(alarms).filter(alarm => alarm.deletedAt === null);

export function eraseParts(alarms: Readonly<Record<string, Alarm>>): ErasePart[] {
  const all = live(alarms);
  return [{ id: 'alarms', title: t('Alarms'), detail: all.length === 0 ? t('No alarms') : plural(all.length, 'alarm'), count: all.length, glyph: 'clock' }];
}

export function eraseChanges(alarms: Readonly<Record<string, Alarm>>, chosen: ReadonlySet<string>, now: number): EraseChange[] {
  if (!chosen.has('alarms')) return [];
  return tombstones('alarm', live(alarms).map(alarm => alarm.id), now);
}
