/**
 * What a person does in Clock. Each gesture is one `writeLocal` batch (one clock, synced), built by
 * the package's editing (`@unlease/clock/services/editing`, the web's too). Setting an alarm, or
 * switching one on, says when it will ring on a slip (« Alarme réglée dans 9 h 12 »), as Google's
 * Clock does; deleting one offers to take it back. Saved timers and world clocks the same way.
 */
import { t } from '@unlease/core/i18n';
import { erasedCount } from '@unlease/core/services/erase';
import { createId } from '@unlease/core/services/ids';
import type { Fields } from '@unlease/core/sync/record';
import { weekdayDay } from '@unlease/calendar/services/eventText';
import type { Day } from '@unlease/calendar/models/events';
import type { Alarm } from '@unlease/clock/models/alarm';
import { editFields, newAlarmFields, ringEarlierWrites, type AlarmDraft } from '@unlease/clock/services/editing';
import { eraseChanges } from '@unlease/clock/services/erase';
import { skipFields, switchedFields } from '@unlease/clock/services/schedule';
import { setWords } from '@unlease/clock/services/words';
import { TIMER_LIMITS, type Timer } from '@unlease/clock/models/timer';
import { WORLD_CLOCK_LIMITS } from '@unlease/clock/models/worldClock';
import type { City } from '@unlease/clock/data/cities';
import { cityFields, zoneCityName } from '@unlease/clock/services/worldClocks';
import { alarmFields, timerFields, worldClockFields } from '@unlease/clock/sync/entities';
import { showSnack } from '@shared/app/store/uiStore';

import { getRecord, useLibraryStore, writeLocal, type LocalChange } from './libraryStore';
import { ringingAlarmNow } from '../hooks/useRingingAlarms';

const TYPE = 'alarm';

/** A saved timer as its form holds it. */
export interface TimerDraft {
  readonly label: string;
  readonly seconds: number;
  readonly sound: string;
  readonly vibrate: boolean;
}

const cleanTimer = (draft: TimerDraft): TimerDraft => ({
  label: draft.label.trim().slice(0, TIMER_LIMITS.label),
  seconds: Math.max(1, Math.min(TIMER_LIMITS.seconds, Math.round(draft.seconds))),
  sound: draft.sound,
  vibrate: draft.vibrate,
});

const alarmOf = (id: string): Alarm | undefined => {
  const alarm = useLibraryStore.getState().alarms[id];
  return alarm && alarm.deletedAt === null ? alarm : undefined;
};

/** Writes the old values back with a newer clock. */
function undoFor(changes: readonly LocalChange[]): () => void {
  const previous: LocalChange[] = changes.map(change => {
    const record = getRecord(change.type, change.id);
    const patch: Fields = {};
    for (const field of Object.keys(change.patch)) patch[field] = record?.fields[field] ?? null;
    return { type: change.type, id: change.id, patch };
  });
  return () => writeLocal(previous);
}

/** « Alarme réglée dans 9 h 12 », once an alarm is set or switched on. */
function sayWhen(id: string, now: number): void {
  const alarm = useLibraryStore.getState().alarms[id];
  const words = alarm ? setWords(alarm, now) : null;
  if (words) showSnack(words, undefined, { tone: 'success' });
}

/** « Enregistrer » on a new alarm: switched on, its day if it rings once. Returns its id. */
export function createAlarm(draft: AlarmDraft, now: number = Date.now()): string {
  const id = createId(now);
  writeLocal([{ type: TYPE, id, patch: newAlarmFields(draft, now) }], now);
  sayWhen(id, now);
  return id;
}

/** « Enregistrer » on an alarm: only what changed, switched on (a saved alarm is meant to ring). */
export function saveAlarm(id: string, draft: AlarmDraft, now: number = Date.now()): void {
  const alarm = alarmOf(id);
  if (!alarm) return;
  const patch = editFields(alarm, draft, now);
  if (Object.keys(patch).length > 0) writeLocal([{ type: TYPE, id, patch }], now);
  sayWhen(id, now);
}

/** Its switch: on, a one-time alarm takes the next day its time comes (`switchedFields`). */
export function switchAlarm(id: string, on: boolean, now: number = Date.now()): void {
  const alarm = alarmOf(id);
  if (!alarm) return;
  writeLocal([{ type: TYPE, id, patch: switchedFields(alarm, on, now) }], now);
  if (on) sayWhen(id, now);
}

/** « Ignorer la prochaine »: its next ring kept quiet, which « Annuler » brings back. */
export function skipNext(id: string, now: number = Date.now()): void {
  const alarm = alarmOf(id);
  const patch = alarm ? skipFields(alarm, now) : null;
  if (!patch?.skipDay) return;
  const changes: LocalChange[] = [{ type: TYPE, id, patch }];
  const undo = undoFor(changes);
  writeLocal(changes, now);
  showSnack(t('It won’t ring on {day}', { day: weekdayDay(patch.skipDay) }), { label: t('Undo'), run: undo }, { tone: 'success' });
}

/** « Ne plus ignorer ». */
export function unskip(id: string, now: number = Date.now()): void {
  if (!alarmOf(id)) return;
  writeLocal([{ type: TYPE, id, patch: { skipDay: null } }], now);
  sayWhen(id, now);
}

/** « Supprimer »: gone from every device, « Annuler » on its slip bringing it back. */
export function deleteAlarm(id: string, now: number = Date.now()): void {
  if (!alarmOf(id)) return;
  const changes: LocalChange[] = [{ type: TYPE, id, patch: { deletedAt: now } }];
  const undo = undoFor(changes);
  writeLocal(changes, now);
  showSnack(t('Alarm deleted'), { label: t('Undo'), run: undo });
}

/** « Dupliquer »: a copy of it, as it is (its skip aside). Returns the copy's id. */
export function duplicateAlarm(id: string, now: number = Date.now()): string | null {
  const alarm = alarmOf(id);
  if (!alarm) return null;
  const copy = createId(now);
  writeLocal([{ type: TYPE, id: copy, patch: alarmFields({ ...alarm, skipDay: null, createdAt: now, deletedAt: null }) }], now);
  return copy;
}

/** The evening check's « Sonner à 6:30 » for one morning (`ringEarlierWrites`): one batch. */
export function ringEarlier(alarmId: string, day: Day, time: string, now: number = Date.now()): void {
  // As it rings: an alarm for an event moves by how much earlier it rings, still for that event.
  const alarm = ringingAlarmNow(alarmId, now);
  if (!alarm || alarm.deletedAt !== null) return;
  const writes = ringEarlierWrites(alarm, day, time, now, createId(now));
  writeLocal(
    writes.map(write => ({ type: TYPE, id: write.id, patch: write.fields })),
    now,
  );
}

/** « Effacer des données »: the parts ticked, in one batch; how many records went. */
export function eraseAlarms(chosen: ReadonlySet<string>, now: number = Date.now()): number {
  const writes = eraseChanges(useLibraryStore.getState(), chosen, now);
  if (writes.length > 0) writeLocal(writes as LocalChange[], now);
  return erasedCount(writes);
}

// ── saved timers ────────────────────────────────────────────────────────────

const timerOf = (id: string): Timer | undefined => {
  const timer = useLibraryStore.getState().timers[id];
  return timer && timer.deletedAt === null ? timer : undefined;
};

/** « Enregistrer » on a new timer: kept for next time. Returns its id. */
export function createTimer(draft: TimerDraft, now: number = Date.now()): string {
  const id = createId(now);
  writeLocal([{ type: 'timer', id, patch: timerFields({ ...cleanTimer(draft), createdAt: now, deletedAt: null }) }], now);
  showSnack(t('Timer saved'), undefined, { tone: 'success' });
  return id;
}

/** « Enregistrer » on a saved timer: only what changed. */
export function saveTimer(id: string, draft: TimerDraft, now: number = Date.now()): void {
  const timer = timerOf(id);
  if (!timer) return;
  const clean = cleanTimer(draft);
  const patch: Fields = {};
  if (clean.label !== timer.label) patch.label = clean.label;
  if (clean.seconds !== timer.seconds) patch.seconds = clean.seconds;
  if (clean.sound !== timer.sound) patch.sound = clean.sound;
  if (clean.vibrate !== timer.vibrate) patch.vibrate = clean.vibrate;
  if (Object.keys(patch).length > 0) writeLocal([{ type: 'timer', id, patch }], now);
}

/** « Supprimer »: gone from every device, « Annuler » on its slip bringing it back. A run of it goes on. */
export function deleteTimer(id: string, now: number = Date.now()): void {
  if (!timerOf(id)) return;
  const changes: LocalChange[] = [{ type: 'timer', id, patch: { deletedAt: now } }];
  const undo = undoFor(changes);
  writeLocal(changes, now);
  showSnack(t('Timer deleted'), { label: t('Undo'), run: undo });
}

// ── world clocks ────────────────────────────────────────────────────────────

/** A city picked: its clock added (once: a city already there is not added twice). Returns its id. */
export function addCity(city: City, now: number = Date.now()): string {
  const state = useLibraryStore.getState();
  const live = Object.values(state.worldClocks).filter(clock => clock.deletedAt === null);
  const there = live.find(clock => clock.zone === city.zone && (clock.name === city.name || clock.name === city.nameFr));
  if (there) return there.id;
  const id = createId(now);
  const fields = cityFields(city, now);
  writeLocal([{ type: 'worldClock', id, patch: worldClockFields(fields) }], now);
  return id;
}

/** « Renommer »: « Maman » rather than « Montréal ». An empty name takes the city's back. */
export function renameCity(id: string, name: string, now: number = Date.now()): void {
  const clock = useLibraryStore.getState().worldClocks[id];
  if (!clock || clock.deletedAt !== null) return;
  const next = name.trim().slice(0, WORLD_CLOCK_LIMITS.name) || zoneCityName(clock.zone);
  if (next !== clock.name) writeLocal([{ type: 'worldClock', id, patch: { name: next } }], now);
}

/** « Retirer »: gone from every device, « Annuler » bringing it back. */
export function removeCity(id: string, now: number = Date.now()): void {
  const clock = useLibraryStore.getState().worldClocks[id];
  if (!clock || clock.deletedAt !== null) return;
  const changes: LocalChange[] = [{ type: 'worldClock', id, patch: { deletedAt: now } }];
  const undo = undoFor(changes);
  writeLocal(changes, now);
  showSnack(t('{city} removed', { city: clock.name }), { label: t('Undo'), run: undo });
}
