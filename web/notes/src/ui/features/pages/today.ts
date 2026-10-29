/**
 * Today on this device (`2026-10-28`), for the dates a page reads relative to it: it turns at
 * midnight, and again when the tab comes back (a laptop asleep through midnight wakes on the old day).
 */
import { useSyncExternalStore } from 'react';

import { isoDayOf } from '@unlease/core/services/dates';

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

const today = (): string => isoDayOf(Date.now());

function tell(): void {
  for (const listener of listeners) listener();
}

function onVisible(): void {
  if (document.visibilityState === 'visible') tell();
}

/** A tick a second past the coming midnight. */
function schedule(): void {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  timer = setTimeout(() => {
    tell();
    schedule();
  }, midnight.getTime() - now.getTime());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    schedule();
    document.addEventListener('visibilitychange', onVisible);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    if (timer) clearTimeout(timer);
    timer = null;
    document.removeEventListener('visibilitychange', onVisible);
  };
}

export function useToday(): string {
  return useSyncExternalStore(subscribe, today, today);
}
