/**
 * The timers this browser runs and its stopwatch: never records, never synced (a timer started here
 * counts here). Kept in localStorage beside Clock's Réglages, so a reload, or another tab of Clock,
 * finds them as they were: each tab follows the others' changes (the `storage` event), and every tab
 * of Clock open rings a timer whose end has come (`TimerRinger`). Also what this browser remembers of
 * them: the lengths started lately (the quick lengths). Every access to the storage is guarded:
 * blocked storage only means nothing outlives the page.
 */
import { create } from 'zustand';

import { createId } from '@unlease/core/services/ids';
import { lapWatch, pauseWatch, readStopwatch, startWatch, STOPWATCH_RESET, type Stopwatch } from '@unlease/clock/models/stopwatch';
import { addMinute, endRun, pauseRun, resetRun, resumeRun, startRun, TIMER_LIMITS, type RunState, type Timer, type TimerRun } from '@unlease/clock/models/timer';
import { readLengths, rememberLength } from '@unlease/clock/services/timers';

import { getStorageName } from '@shared/app/env';
import { usePrefsStore } from './prefs';

interface ToolsState {
  /** The runs, oldest first. */
  readonly runs: readonly TimerRun[];
  readonly stopwatch: Stopwatch;
  /** The lengths started lately, newest first (seconds). */
  readonly recent: readonly number[];
}

const EMPTY: ToolsState = { runs: [], stopwatch: STOPWATCH_RESET, recent: [] };

export const useToolsStore = create<ToolsState>(() => EMPTY);

const key = (part: 'timers' | 'stopwatch' | 'recentLengths' | 'askedNotifications'): string => `${getStorageName()}.clock.${part}`;

function read(part: Parameters<typeof key>[0]): unknown {
  try {
    const text = localStorage.getItem(key(part));
    return text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

function write(part: Parameters<typeof key>[0], value: unknown): void {
  try {
    localStorage.setItem(key(part), JSON.stringify(value));
  } catch {
    // Blocked storage: it holds for this visit only.
  }
}

const STATES: readonly RunState[] = ['running', 'paused', 'ringing'];
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Runs as stored, read whole: what is not one is left out. */
function readRuns(value: unknown): TimerRun[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is TimerRun => {
      if (typeof item !== 'object' || item === null) return false;
      const run = item as Record<string, unknown>;
      return (
        typeof run.id === 'string' &&
        (run.timerId === null || typeof run.timerId === 'string') &&
        typeof run.label === 'string' &&
        typeof run.sound === 'string' &&
        typeof run.vibrate === 'boolean' &&
        STATES.includes(run.state as RunState) &&
        [run.length, run.total, run.endsAt, run.left, run.startedAt].every(finite)
      );
    })
    .sort((a, b) => a.startedAt - b.startedAt);
}

/** What this browser kept, before anything is shown. */
export function loadTools(): void {
  useToolsStore.setState({ runs: readRuns(read('timers')), stopwatch: readStopwatch(read('stopwatch')), recent: readLengths(read('recentLengths')) }, true);
}

/** Another tab of Clock changed them: this one follows. Returns how to stop following. */
export function followTools(): () => void {
  const onStorage = (event: StorageEvent): void => {
    if (event.key === key('timers')) useToolsStore.setState({ runs: readRuns(read('timers')) });
    else if (event.key === key('stopwatch')) useToolsStore.setState({ stopwatch: readStopwatch(read('stopwatch')) });
    else if (event.key === key('recentLengths')) useToolsStore.setState({ recent: readLengths(read('recentLengths')) });
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

/** Test seam. */
export function resetTools(): void {
  useToolsStore.setState(EMPTY, true);
}

function setRuns(update: (runs: readonly TimerRun[]) => readonly TimerRun[]): void {
  const runs = update(useToolsStore.getState().runs);
  useToolsStore.setState({ runs });
  write('timers', runs);
}

function setStopwatch(stopwatch: Stopwatch): void {
  useToolsStore.setState({ stopwatch });
  write('stopwatch', stopwatch);
}

/**
 * The browser's leave to show a notification as a timer ends, asked once: as the first timer
 * starts here (a press, which the browser asks for), never on arrival.
 */
function askNotificationsOnce(): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'default' || read('askedNotifications') === true) return;
  write('askedNotifications', true);
  try {
    void Notification.requestPermission().catch(() => undefined);
  } catch {
    // An older browser's callback form, or none: the tab's sound and title are enough.
  }
}

/**
 * Starts a timer now: a saved one, or an instant one of `seconds` (remembered among the lengths
 * started lately), with what its form chose (a label, a sound), else this browser's timer sound.
 */
export function startTimer(input: { readonly seconds: number; readonly timer?: Timer; readonly label?: string; readonly sound?: string; readonly vibrate?: boolean }, now: number = Date.now()): string {
  const prefs = usePrefsStore.getState();
  const saved = input.timer;
  const run = startRun(
    {
      id: createId(now),
      timerId: saved?.id ?? null,
      label: saved?.label ?? input.label ?? '',
      seconds: Math.min(TIMER_LIMITS.seconds, saved?.seconds ?? input.seconds),
      sound: saved?.sound ?? input.sound ?? prefs.timerSound,
      vibrate: saved?.vibrate ?? input.vibrate ?? prefs.timerVibrate,
    },
    now,
  );
  setRuns(runs => [...runs, run]);
  if (!saved) {
    const recent = rememberLength(useToolsStore.getState().recent, run.length / 1000);
    useToolsStore.setState({ recent });
    write('recentLengths', recent);
  }
  askNotificationsOnce();
  return run.id;
}

export type TimerAction = 'pause' | 'resume' | 'add' | 'reset' | 'delete' | 'stop';

const ACTIONS: Readonly<Record<TimerAction, (run: TimerRun, now: number) => TimerRun | null>> = {
  pause: pauseRun,
  resume: resumeRun,
  add: addMinute,
  reset: run => resetRun(run),
  delete: () => null,
  // A ring stopped: the run is done.
  stop: () => null,
};

/** Pause, resume, +1 min, reset, delete, or stop a ring. */
export function actOnTimer(id: string, action: TimerAction, now: number = Date.now()): void {
  const act = ACTIONS[action];
  setRuns(runs => runs.flatMap(run => (run.id === id ? [act(run, now)].filter((next): next is TimerRun => next !== null) : [run])));
}

/** Every run whose end has come rings; whether one did. */
export function ringDueTimers(now: number = Date.now()): boolean {
  const due = useToolsStore.getState().runs.some(run => run.state === 'running' && run.endsAt <= now);
  if (due) setRuns(runs => runs.map(run => (run.state === 'running' && run.endsAt <= now ? endRun(run) : run)));
  return due;
}

/** A run as the screen shows it: one whose end has come rings, though the ringer has not said so yet. */
export const shownRun = (run: TimerRun, now: number): TimerRun => (run.state === 'running' && run.endsAt <= now ? endRun(run) : run);

// ── the stopwatch ───────────────────────────────────────────────────────────

export const startStopwatch = (now: number = Date.now()): void => setStopwatch(startWatch(useToolsStore.getState().stopwatch, now));
export const pauseStopwatch = (now: number = Date.now()): void => setStopwatch(pauseWatch(useToolsStore.getState().stopwatch, now));
export const lapStopwatch = (now: number = Date.now()): void => setStopwatch(lapWatch(useToolsStore.getState().stopwatch, now));
export const resetStopwatch = (): void => setStopwatch(STOPWATCH_RESET);
