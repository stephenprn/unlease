/**
 * The kitchen on this device: how much of each recipe it cooks ("Pour N personnes", a factor of
 * the recipe as written: 6 people from a recipe for 4 is 1.5), by which the shopping list and the
 * cook mode scale their ingredients, and the cook mode's timers. Kept for the visit only: a recipe
 * opens again as written. A timer also rings through a notification, heard with the phone locked.
 */
import { create } from 'zustand';

import { createId } from '@unlease/core/services/ids';
import { cancelTimerAlarm, ensurePermission, ringTimerNow, scheduleTimerAlarm } from '@platform/notifications';

export interface KitchenTimer {
  readonly id: string;
  readonly linkId: string;
  /** What it times: « Étape 3 », or the recipe's words around the duration. */
  readonly label: string;
  readonly seconds: number;
  readonly endsAt: number;
}

interface KitchenState {
  readonly factors: Readonly<Record<string, number>>;
  /** Running and rung, the soonest first: a rung timer stays until it is dismissed. */
  readonly timers: readonly KitchenTimer[];
}

export const useKitchenStore = create<KitchenState>(() => ({ factors: {}, timers: [] }));

export const selectFactor =
  (linkId: string) =>
  (s: KitchenState): number =>
    s.factors[linkId] ?? 1;
export const selectTimers = (s: KitchenState): readonly KitchenTimer[] => s.timers;

export function setFactor(linkId: string, factor: number): void {
  useKitchenStore.setState(s => ({ factors: { ...s.factors, [linkId]: factor } }));
}

let permissionAsked = false;

/** Its ring, asking once for the right to notify; refused, the timer still runs and rings in the app. */
async function armAlarm(timer: KitchenTimer): Promise<void> {
  if (!permissionAsked) {
    permissionAsked = true;
    await ensurePermission().catch(() => false);
  }
  await scheduleTimerAlarm({ id: timer.id, label: timer.label, endsAt: timer.endsAt });
  // Stopped while its ring was being set: the ring goes too.
  if (!useKitchenStore.getState().timers.some(each => each.id === timer.id)) await cancelTimerAlarm(timer.id);
}

export function startTimer(linkId: string, label: string, seconds: number, now: number = Date.now()): KitchenTimer {
  const timer: KitchenTimer = { id: createId(now), linkId, label, seconds, endsAt: now + seconds * 1000 };
  useKitchenStore.setState(s => ({ timers: [...s.timers, timer].sort((a, b) => a.endsAt - b.endsAt) }));
  armAlarm(timer).catch(() => undefined);
  return timer;
}

/** The app saw it end: its notification rings now, unless its alarm already has (an inexact one can come minutes late). */
export function ringTimer(timer: KitchenTimer): void {
  ringTimerNow({ id: timer.id, label: timer.label, endsAt: timer.endsAt }).catch(() => undefined);
}

/** Stopped before it rings, or dismissed once it has. */
export function stopTimer(id: string): void {
  useKitchenStore.setState(s => ({ timers: s.timers.filter(timer => timer.id !== id) }));
  cancelTimerAlarm(id).catch(() => undefined);
}
