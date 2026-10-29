/**
 * The kitchen on this device: how much of each recipe it cooks ("Pour N personnes", a factor of
 * the recipe as written: 6 people from a recipe for 4 is 1.5), by which the shopping list and the
 * cook mode scale their ingredients, and the cook mode's timers. Kept for the visit only: a recipe
 * opens again as written.
 */
import { create } from 'zustand';

import { createId } from '@unlease/core/services/ids';

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

export function startTimer(linkId: string, label: string, seconds: number, now: number = Date.now()): KitchenTimer {
  const timer: KitchenTimer = { id: createId(now), linkId, label, seconds, endsAt: now + seconds * 1000 };
  useKitchenStore.setState(s => ({ timers: [...s.timers, timer].sort((a, b) => a.endsAt - b.endsAt) }));
  return timer;
}

/** Stopped before it rings, or dismissed once it has. */
export function stopTimer(id: string): void {
  useKitchenStore.setState(s => ({ timers: s.timers.filter(timer => timer.id !== id) }));
}
