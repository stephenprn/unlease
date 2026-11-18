/**
 * The timers this phone runs and its stopwatch, as the engine keeps them (`@platform/tools`): read
 * at start, followed on every change the engine says, wherever it was made (the app, a notification,
 * a widget). Never synced. What a screen asks goes to the engine, and the screen follows its answer;
 * meanwhile the change shows at once (optimistic), the engine's word replacing it.
 *
 * Also what this phone remembers of them: the lengths started lately (the new timer's quick lengths).
 */
import { create } from 'zustand';

import { createId } from '@unlease/core/services/ids';
import { addMinute, endRun, pauseRun, resetRun, resumeRun, startRun, type TimerRun } from '@unlease/clock/models/timer';
import { lapWatch, pauseWatch, readStopwatch, startWatch, STOPWATCH_RESET, type Stopwatch } from '@unlease/clock/models/stopwatch';
import type { Timer } from '@unlease/clock/models/timer';
import { readLengths, rememberLength } from '@unlease/clock/services/timers';
import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';
import { haptic } from '@shared/platform/haptics';
import { onTools, readTools, startTimerRun, stopRingingTimers, stopwatchAction, timerAction, type TimerAction, type ToolsState } from '@platform/tools';

import { useClockUiStore } from './clockUi';

const RECENT_KEY = 'clock.recentLengths';

interface ToolsStore {
  /** The runs, oldest first. */
  readonly runs: readonly TimerRun[];
  readonly stopwatch: Stopwatch;
  /** The lengths started lately, newest first (seconds). */
  readonly recent: readonly number[];
}

export const useToolsStore = create<ToolsStore>(() => ({ runs: [], stopwatch: STOPWATCH_RESET, recent: [] }));

function readRuns(text: string): TimerRun[] {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((run): run is TimerRun => typeof run === 'object' && run !== null && typeof (run as TimerRun).id === 'string').sort((a, b) => a.startedAt - b.startedAt);
  } catch {
    return [];
  }
}

function take(state: ToolsState): void {
  let stopwatch = STOPWATCH_RESET;
  try {
    stopwatch = state.stopwatch ? readStopwatch(JSON.parse(state.stopwatch)) : STOPWATCH_RESET;
  } catch {
    stopwatch = STOPWATCH_RESET;
  }
  useToolsStore.setState({ runs: readRuns(state.timers), stopwatch });
}

let started = false;

/** Once, at start: the engine's state, then every change it says. */
export function startTools(): void {
  if (started) return;
  started = true;
  useToolsStore.setState({ recent: readLengths(readPreferences()[RECENT_KEY]) });
  readTools().then(take, () => undefined);
  onTools(take);
}

/** Asks the engine for its state again (the app comes back to the front). */
export function refreshTools(): void {
  readTools().then(take, () => undefined);
}

function setRuns(update: (runs: readonly TimerRun[]) => readonly TimerRun[]): void {
  useToolsStore.setState(state => ({ runs: update(state.runs) }));
}

/**
 * Starts a timer now: a saved one, or an instant one of `seconds` (remembered among the lengths
 * started lately), with what its form chose (a label, a sound), else this phone's timer sound.
 */
export function startTimer(input: { readonly seconds: number; readonly timer?: Timer; readonly label?: string; readonly sound?: string; readonly vibrate?: boolean }, now: number = Date.now()): string {
  const prefs = useClockUiStore.getState().prefs;
  const saved = input.timer;
  const run = startRun(
    {
      id: createId(now),
      timerId: saved?.id ?? null,
      label: saved?.label ?? input.label ?? '',
      seconds: saved?.seconds ?? input.seconds,
      sound: saved?.sound ?? input.sound ?? prefs.timerSound,
      vibrate: saved?.vibrate ?? input.vibrate ?? prefs.timerVibrate,
    },
    now,
  );
  setRuns(runs => [...runs, run]);
  if (!saved) {
    const recent = rememberLength(useToolsStore.getState().recent, run.length / 1000);
    useToolsStore.setState({ recent });
    writePreference(RECENT_KEY, recent);
  }
  startTimerRun(JSON.stringify(run));
  haptic('confirm');
  return run.id;
}

const LOCAL: Partial<Record<TimerAction, (run: TimerRun, now: number) => TimerRun | null>> = {
  pause: pauseRun,
  resume: resumeRun,
  add: addMinute,
  reset: run => resetRun(run),
  delete: () => null,
  stop: () => null,
};

/** Pause, resume, +1 min, reset, delete, or stop a ring. */
export function actOnTimer(id: string, action: TimerAction, now: number = Date.now()): void {
  const local = LOCAL[action];
  if (local) setRuns(runs => runs.flatMap(run => (run.id === id ? [local(run, now)].filter((next): next is TimerRun => next !== null) : [run])));
  timerAction(id, action);
}

/** « Tout arrêter ». */
export function stopAllTimers(): void {
  setRuns(runs => runs.filter(run => run.state !== 'ringing'));
  stopRingingTimers();
}

/** A run whose end has come, as the screen sees it, until the engine says it rings. */
export const shownRun = (run: TimerRun, now: number): TimerRun => (run.state === 'running' && run.endsAt <= now ? endRun(run) : run);

export function startStopwatch(now: number = Date.now()): void {
  useToolsStore.setState(state => ({ stopwatch: startWatch(state.stopwatch, now) }));
  stopwatchAction('start');
}

export function pauseStopwatch(now: number = Date.now()): void {
  useToolsStore.setState(state => ({ stopwatch: pauseWatch(state.stopwatch, now) }));
  stopwatchAction('pause');
}

export function lapStopwatch(now: number = Date.now()): void {
  useToolsStore.setState(state => ({ stopwatch: lapWatch(state.stopwatch, now) }));
  stopwatchAction('lap');
  haptic('tick');
}

export function resetStopwatch(): void {
  useToolsStore.setState({ stopwatch: STOPWATCH_RESET });
  stopwatchAction('reset');
}

/** Test seam. */
export function resetTools(): void {
  started = false;
  useToolsStore.setState({ runs: [], stopwatch: STOPWATCH_RESET, recent: [] });
}
