/**
 * Every change the person makes to their alarms, as the phone makes it (`@unlease/clock/services`
 * says what each writes): each action is one `writeLocal` batch (one clock tick, pending, synced),
 * and those that can be taken back return their undo, which writes the old values with a newer
 * clock. Never mutate alarms another way. The web rings nothing: a phone with Clock rings what is
 * written here once it has synced.
 */
import { createId } from '@unlease/core/services/ids';
import { erasedCount } from '@unlease/core/services/erase';
import type { Fields } from '@unlease/core/sync/record';
import type { Day } from '@unlease/calendar/models/events';
import type { Alarm } from '@unlease/clock/models/alarm';
import { editFields, newAlarmFields, ringEarlierWrites, type AlarmDraft } from '@unlease/clock/services/editing';
import { eraseChanges } from '@unlease/clock/services/erase';
import { onceDate, skipFields, skippedDay, switchedFields } from '@unlease/clock/services/schedule';
import { alarmFields } from '@unlease/clock/sync/entities';

import { getRecord, writeLocal, type LocalChange } from '@shared/app/store/records';
import { useClockStore } from './library';
import { ringingAlarmNow } from '../hooks/useAlarms';

export type Undo = () => void;

const alarmOf = (id: string): Alarm | undefined => {
  const alarm = useClockStore.getState().alarms[id];
  return alarm && alarm.deletedAt === null ? alarm : undefined;
};

/** Exactly these fields of these records back to what they were. */
function undoFor(changes: readonly LocalChange[]): Undo {
  const previous: LocalChange[] = changes.map(change => {
    const record = getRecord(change.type, change.id);
    const patch: Fields = {};
    for (const field of Object.keys(change.patch)) patch[field] = record?.fields[field] ?? null;
    return { type: change.type, id: change.id, patch };
  });
  return () => writeLocal(previous);
}

/** Writes one alarm's patch, and hands back the way to take it back. */
function writeWithUndo(id: string, patch: Fields, now: number): Undo {
  const changes: LocalChange[] = [{ type: 'alarm', id, patch }];
  const undo = undoFor(changes);
  writeLocal(changes, now);
  return undo;
}

const nothing: Undo = () => {};

/** A new alarm from the editor, switched on (a one-time one on the next day its time comes). Returns its id. */
export function createAlarm(draft: AlarmDraft, now: number = Date.now()): string {
  const id = createId(now);
  writeLocal([{ type: 'alarm', id, patch: newAlarmFields(draft, now) }], now);
  return id;
}

/**
 * The editor's « Enregistrer » on an alarm already here, in one batch: only what changed, and it is
 * switched on (`editFields`); with `skip`, « Ignorer la prochaine » as the editor left it (the next
 * ring of the alarm as saved kept quiet, or a skip still to come forgotten).
 */
export function saveAlarm(id: string, draft: AlarmDraft, { skip }: { readonly skip?: boolean } = {}, now: number = Date.now()): void {
  const alarm = alarmOf(id);
  if (!alarm) return;
  const patch = editFields(alarm, draft, now);
  if (skip !== undefined) {
    const after = { ...alarm, ...patch } as Alarm;
    const standing = skippedDay(after, now);
    if (skip && standing === null) {
      const quiet = skipFields(after, now);
      if (quiet) patch.skipDay = quiet.skipDay;
    } else if (!skip && standing !== null) {
      patch.skipDay = null;
    }
  }
  if (Object.keys(patch).length > 0) writeLocal([{ type: 'alarm', id, patch }], now);
}

/** Its switch: on (a one-time alarm takes the next day its time comes, a skip gone by is forgotten) or off. */
export function switchAlarm(id: string, on: boolean, now: number = Date.now()): Undo {
  const alarm = alarmOf(id);
  if (!alarm) return nothing;
  return writeWithUndo(id, switchedFields(alarm, on, now), now);
}

/** « Ignorer la prochaine »: a repeating alarm's next ring kept quiet; null when it has none to skip. */
export function skipNext(id: string, now: number = Date.now()): Undo | null {
  const alarm = alarmOf(id);
  const patch = alarm ? skipFields(alarm, now) : null;
  return patch ? writeWithUndo(id, patch, now) : null;
}

/** « Ne plus ignorer »: the skipped ring rings again. */
export function stopSkipping(id: string, now: number = Date.now()): Undo {
  const alarm = alarmOf(id);
  if (!alarm || alarm.skipDay === null) return nothing;
  return writeWithUndo(id, { skipDay: null }, now);
}

/** « Supprimer »: its tombstone, taken back by the slip's « Annuler ». */
export function deleteAlarm(id: string, now: number = Date.now()): Undo {
  if (!alarmOf(id)) return nothing;
  return writeWithUndo(id, { deletedAt: now }, now);
}

/** « Dupliquer »: a copy beside it, new from now (a one-time alarm on the next day its time comes). Returns its id, or null. */
export function duplicateAlarm(id: string, now: number = Date.now()): string | null {
  const alarm = alarmOf(id);
  if (!alarm) return null;
  const copy = createId(now);
  const date = alarm.days.length === 0 ? onceDate(alarm.time, now) : null;
  writeLocal([{ type: 'alarm', id: copy, patch: alarmFields({ ...alarm, date, skipDay: null, createdAt: now, deletedAt: null }) }], now);
  return copy;
}

/**
 * « Sonner à 6:30 » for one morning (`ringEarlierWrites`), in one batch: a one-time alarm moved
 * there; a repeating one kept quiet that morning and a one-time alarm like it set for the earlier
 * time. Its undo puts the alarm back and deletes the one made.
 */
export function ringEarlier(id: string, day: Day, time: string, now: number = Date.now()): Undo {
  // As it rings: an alarm for an event moves by how much earlier it rings, still for that event.
  const alarm = ringingAlarmNow(id, now);
  if (!alarm || alarm.deletedAt !== null) return nothing;
  const writes = ringEarlierWrites(alarm, day, time, now, createId(now));
  const changes: LocalChange[] = writes.map(write => ({ type: 'alarm', id: write.id, patch: write.fields }));
  const back = undoFor(changes.filter((_, index) => !writes[index]!.created));
  const made = writes.filter(write => write.created).map(write => write.id);
  writeLocal(changes, now);
  return () => {
    back();
    if (made.length > 0) writeLocal(made.map(each => ({ type: 'alarm', id: each, patch: { deletedAt: Date.now() } })));
  };
}

/** « Effacer des données »: the tombstones of the parts chosen, as one batch; how many records went. */
export function eraseClock(chosen: ReadonlySet<string>, now: number = Date.now()): number {
  const changes = eraseChanges(useClockStore.getState().alarms, chosen, now);
  if (changes.length > 0) writeLocal(changes, now);
  return erasedCount(changes);
}
