/**
 * Clock's timers. A saved timer (`timer`) is a sync record like an alarm: a length and a label
 * (« Pâtes », « Thé vert »), kept for next time, backed up, on every phone and the web. A timer that
 * runs is never a record: it lives on the device that runs it (`TimerRun`), the phone's engine
 * counting it down with the app closed, the web's tab counting it while it is open. An instant timer
 * is a run with no saved timer behind it (`timerId` null): it is gone once it has rung.
 */

export interface Timer {
  readonly id: string;
  /** What it is for (« Pâtes »); '' none, shown as its length alone. */
  readonly label: string;
  /** Its length, in seconds (1 to 99:59:59). */
  readonly seconds: number;
  /** One of `SOUNDS` (`bell`), `silent`, or a sound of the phone (`phone:<uri>`). */
  readonly sound: string;
  readonly vibrate: boolean;
  readonly createdAt: number;
  readonly deletedAt: number | null;
  readonly editedAt: number;
}

export const TIMER_LIMITS = {
  label: 60,
  /** 99:59:59, the most the keypad types. */
  seconds: 99 * 3600 + 59 * 60 + 59,
  sound: 600,
} as const;

/** A timer's sound unless it names one: a bell, short and clear over a kitchen's noise. */
export const TIMER_SOUND = 'bell';

/** What a field missing from an older record reads as, and what a rollback writes back. */
export const TIMER_FIELD_DEFAULTS = {
  label: '',
  sound: TIMER_SOUND,
  vibrate: true,
} as const;

export const isLiveTimer = (timer: Pick<Timer, 'deletedAt'>): boolean => timer.deletedAt === null;

/** Saved timers in the list's order: shortest first (a ladder of lengths reads at a glance), then by label, then the oldest. */
export function byLength(a: Timer, b: Timer): number {
  return a.seconds - b.seconds || a.label.localeCompare(b.label) || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

// ── a timer that runs ───────────────────────────────────────────────────────

export type RunState = 'running' | 'paused' | 'ringing';

/**
 * A timer counting down on this device (never synced). Running, it ends at `endsAt`; paused, it has
 * `left` to go; ringing, it ended at `endsAt` and counts the time since. `total` is its length with
 * every minute added (« +1 min »), so its progress reads against what it was asked for.
 */
export interface TimerRun {
  readonly id: string;
  /** The saved timer it runs, or null for an instant one. */
  readonly timerId: string | null;
  readonly label: string;
  /** Milliseconds, the length it was started with (« Réinitialiser » goes back to it). */
  readonly length: number;
  /** Milliseconds, its length plus what was added. */
  readonly total: number;
  readonly state: RunState;
  /** Running or ringing: when it ends (ended). */
  readonly endsAt: number;
  /** Paused: what is left. */
  readonly left: number;
  readonly sound: string;
  readonly vibrate: boolean;
  /** When it was started, for its order on the screen (the newest last). */
  readonly startedAt: number;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** A run starting now. */
export function startRun(input: { readonly id: string; readonly timerId: string | null; readonly label: string; readonly seconds: number; readonly sound: string; readonly vibrate: boolean }, now: number): TimerRun {
  const total = Math.max(1, Math.min(TIMER_LIMITS.seconds, Math.round(input.seconds))) * SECOND;
  return { id: input.id, timerId: input.timerId, label: input.label, length: total, total, state: 'running', endsAt: now + total, left: total, sound: input.sound, vibrate: input.vibrate, startedAt: now };
}

/** Milliseconds left (0 once it has ended). */
export function remaining(run: TimerRun, now: number): number {
  if (run.state === 'paused') return run.left;
  return Math.max(0, run.endsAt - now);
}

/** Milliseconds since it ended (ringing), 0 otherwise. */
export function overtime(run: TimerRun, now: number): number {
  return run.state === 'ringing' ? Math.max(0, now - run.endsAt) : 0;
}

/** How far it has gone, 0 to 1. */
export function progress(run: TimerRun, now: number): number {
  if (run.total <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - remaining(run, now) / run.total));
}

export function pauseRun(run: TimerRun, now: number): TimerRun {
  if (run.state !== 'running') return run;
  return { ...run, state: 'paused', left: Math.max(0, run.endsAt - now) };
}

export function resumeRun(run: TimerRun, now: number): TimerRun {
  if (run.state !== 'paused') return run;
  return { ...run, state: 'running', endsAt: now + run.left };
}

/** « +1 min »: running or paused, a minute more; ringing, it starts again for a minute. */
export function addMinute(run: TimerRun, now: number): TimerRun {
  if (run.state === 'ringing') return { ...run, state: 'running', endsAt: now + MINUTE, left: MINUTE, total: MINUTE };
  if (run.state === 'paused') return { ...run, left: run.left + MINUTE, total: run.total + MINUTE };
  return { ...run, endsAt: run.endsAt + MINUTE, total: run.total + MINUTE };
}

/** « Réinitialiser »: back to the length it was started with, paused. */
export function resetRun(run: TimerRun): TimerRun {
  return { ...run, state: 'paused', left: run.length, total: run.length };
}

/** Running and its moment has come: it rings. */
export function endRun(run: TimerRun): TimerRun {
  return run.state === 'running' ? { ...run, state: 'ringing' } : run;
}
