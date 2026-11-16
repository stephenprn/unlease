/**
 * What the spotlight searches of Clock (`core/services/searchIndex`): every live alarm as a
 * document, its label the title, its time as typed every way (« 07:30 », « 7h30 », « 7:30 AM »,
 * « 730 ») and its days as meta, so « 7h30 », « train » or « week-end » find it. Rebuilt in the
 * interface's language (its days are words).
 */
import { spotKey, type SpotMeta } from '@unlease/core/services/spotlight';
import type { SearchDoc, SearchPart } from '@unlease/core/services/searchIndex';
import type { Alarm } from '../models/alarm';
import { daysWords } from './words';

export const CLOCK_SPOT_TYPES = ['alarm'] as const;

/** A time as people type it: `07:30`, `7:30`, `7h30`, `730`, `0730`, `7:30 am`. */
export function timeSpellings(time: string): string {
  const hour = Number(time.slice(0, 2));
  const minute = time.slice(3, 5);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  const half = hour < 12 ? 'am' : 'pm';
  return [time, `${hour}:${minute}`, `${hour}h${minute}`, `${hour}${minute}`, time.replace(':', ''), `${twelve}:${minute}${half}`, `${twelve}${half}`].join(' ');
}

export function clockSpotlightDocs(alarms: Iterable<Alarm>, now: number, weekStart: number): SearchDoc<SpotMeta>[] {
  const docs: SearchDoc<SpotMeta>[] = [];
  for (const alarm of alarms) {
    if (alarm.deletedAt !== null) continue;
    const parts: SearchPart[] = [
      { text: timeSpellings(alarm.time), role: 'heading' },
      { text: daysWords(alarm, now, weekStart), role: 'meta' },
    ];
    docs.push({
      key: spotKey('alarm', alarm.id),
      title: alarm.label.trim(),
      parts,
      editedAt: alarm.editedAt,
      meta: { type: 'alarm', id: alarm.id, labelIds: [], archived: false, within: null },
    });
  }
  return docs;
}
