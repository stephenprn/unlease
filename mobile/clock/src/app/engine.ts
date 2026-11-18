/**
 * Hands the alarm engine (`@platform/alarmEngine`, Kotlin `alarm/`) every alarm and how this phone
 * rings them (`enginePlan`), at start and whenever an alarm, a ringing setting or the language
 * changes (its notifications speak the app's language). The engine keeps the plan where it can read it
 * before the phone is first unlocked, counts each next ring itself and arms it; this side never arms
 * anything, so an alarm rings whether or not JavaScript ever runs again. A plan unchanged is not handed
 * twice; the headless tasks hand it again after a pull (`syncEngine`). While the server says Clock is
 * off (its Administration turned it off), the plan holds no alarm: the app's screens are covered and
 * nothing could be changed or switched off, so nothing rings (the off screen says so).
 */
import { onLocale, t } from '@unlease/core/i18n';
import { enginePlan, type EngineWords } from '@unlease/clock/services/engine';
import type { ArmResult } from '@platform/alarmEngine';
import { setPlan } from '@platform/alarmEngine';

import { useSettingsStore, type SettingsState } from '@shared/app/store/settingsStore';

import { ringingAlarmsNow } from './hooks/useRingingAlarms';
import { useClockUiStore } from './store/clockUi';
import { useLibraryStore } from './store/libraryStore';

/** What the engine says on its own (its notifications' words and its channels' names), in the app's language. */
export function engineWords(): EngineWords {
  return {
    snooze: t('Snooze'),
    stop: t('Stop'),
    ringing: t('Alarm'),
    // `{time}` stays for the engine to fill with the snooze's end, in the phone's own format.
    snoozedUntil: t('Snoozed until {time}', { time: '{time}' }),
    missed: t('Missed alarm'),
    channelRinging: t('Alarms ringing'),
    channelNotices: t('Snoozed and missed alarms'),
    timer: t('Timer'),
    timerOf: t('{length} timer', { length: '{length}' }),
    timeUp: t('Time’s up'),
    timersUp: t('{count} timers done', { count: '{count}' }),
    addMinute: t('+1 min'),
    pause: t('Pause'),
    resume: t('Resume'),
    delete: t('Delete'),
    paused: t('Paused · {time}', { time: '{time}' }),
    stopwatch: t('Stopwatch'),
    lap: t('Lap'),
    lapNumber: t('Lap {number}', { number: '{number}' }),
    reset: t('Reset'),
    channelTimers: t('Timers'),
    channelTimersRinging: t('Timers ringing'),
    channelStopwatch: t('Stopwatch'),
  };
}

/** Whether the server this phone connects to said it does not run Clock (as `useAppOff`). */
const clockOff = (state: Pick<SettingsState, 'onboarded' | 'server' | 'apps'>): boolean => state.onboarded && state.server !== null && state.apps !== null && !state.apps.includes('clock');

/** The plan as the engine takes it, as JSON. */
export function currentPlan(): string {
  // As they ring: an alarm for an event at its time, holidays and days off kept quiet (Agenda's).
  const alarms = clockOff(useSettingsStore.getState()) ? [] : ringingAlarmsNow();
  return JSON.stringify(enginePlan(alarms, useClockUiStore.getState().prefs, engineWords()));
}

let handed = '';
let pending: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<ArmResult> = Promise.resolve({ armed: 0, next: 0, inexact: false });

/** Hands the plan now, even unchanged (after a pull, at a headless start, the engine's own state unknown). */
export function syncEngine(): Promise<ArmResult> {
  const plan = currentPlan();
  chain = chain
    .catch(() => ({ armed: 0, next: 0, inexact: false }))
    .then(async () => {
      const result = await setPlan(plan);
      handed = plan;
      return result;
    });
  return chain;
}

/** Hands the plan once changes settle (a batch writes several records at once), only when it changed. */
function soon(): void {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    if (currentPlan() !== handed) syncEngine().catch(() => undefined);
  }, 120);
}

/** Starts following the alarms, the settings and the language; returns what stops it. */
export function startEngine(): () => void {
  syncEngine().catch(() => undefined);
  const stopAlarms = useLibraryStore.subscribe((state, before) => {
    // Agenda's records too: an event an alarm is for moved, a holiday or a day off added.
    if (state.alarms !== before.alarms || state.events !== before.events || state.feeds !== before.feeds) soon();
  });
  const stopPrefs = useClockUiStore.subscribe((state, before) => {
    if (state.prefs !== before.prefs) soon();
  });
  const stopLocale = onLocale(() => soon());
  const stopServer = useSettingsStore.subscribe((state, before) => {
    if (clockOff(state) !== clockOff(before)) soon();
  });
  return () => {
    stopAlarms();
    stopPrefs();
    stopLocale();
    stopServer();
    if (pending) clearTimeout(pending);
  };
}

/** Test seam. */
export function resetEngine(): void {
  handed = '';
  if (pending) clearTimeout(pending);
  pending = null;
}
