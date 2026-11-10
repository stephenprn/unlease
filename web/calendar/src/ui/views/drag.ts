/**
 * Moving an occurrence by hand: dragged on the hours' grid (another day, another time), its end
 * dragged (longer, shorter), or dragged to another day of the month. The change is the package's
 * (`moveOccurrence`): a series asks which of its events first, and the slip offers to take it back.
 */
import { t } from '@unlease/core/i18n';
import { isOwn } from '@unlease/calendar/models/events';
import { asksScope } from '@unlease/calendar/services/editing';
import type { Occurrence } from '@unlease/calendar/services/occurrences';
import { addDays, addMinutes, instantToWall, isDay, wallToInstant } from '@unlease/calendar/services/time';

import { showUndo } from '@shared/app/store/ui';
import { kindOf } from '../../app/hooks/useItems';
import { moveEvent } from '../../app/store/actions';
import { askScope } from '../../app/store/calendarUi';

/** Whether an occurrence can be moved by hand: one's own event's (not a layer's, not a subscription's). */
export const movable = (item: Occurrence): boolean => kindOf(item.key) === 'event' && isOwn(item.event);

/** A time of day on this device moved into the event's own zone. */
const intoZone = (localWall: string, zone: string): string => (zone ? instantToWall(wallToInstant(localWall, ''), zone) : localWall);

/** The occurrence moved `days` and `minutes` (its length kept), as the event's own times. */
export function shiftedTimes(item: Occurrence, days: number, minutes: number): { start: string } {
  if (isDay(item.start)) return { start: addDays(item.start, days) };
  const local = addMinutes(instantToWall(item.startAt, ''), days * 1440 + minutes);
  return { start: intoZone(local, item.event.timeZone) };
}

/** Its end moved `minutes` (never before its start's quarter of an hour after). */
export function resizedTimes(item: Occurrence, minutes: number): { start: string; end: string } {
  const length = Math.max(15, Math.round((item.endAt - item.startAt) / 60_000) + minutes);
  const end = intoZone(addMinutes(instantToWall(item.startAt, ''), length), item.event.timeZone);
  return { start: item.start, end };
}

/** Writes a move, asking which events of a series first; the slip offers to take it back. */
export async function commitMove(item: Occurrence, times: { readonly start: string; readonly end?: string }): Promise<void> {
  if (times.start === item.start && (times.end === undefined || times.end === item.end)) return;
  const scope = asksScope(item) ? await askScope(t('Déplacer un événement périodique')) : 'all';
  if (!scope) return;
  const undo = moveEvent(item, times, scope);
  showUndo(t('Événement déplacé'), undo);
}

/** How far a pointer must go before a press becomes a drag. */
export const DRAG_SLOP = 5;
