/**
 * What the phone's alarm engine is handed (Clock's Android app, `AlarmEngine` in Kotlin): the alarms
 * that may ring, whole, and how this phone rings them. The engine keeps them in storage readable
 * before the phone is first unlocked after a restart, counts each next ring itself (`AlarmPlan.kt`,
 * as `schedule.ts` does) and arms it with `setAlarmClock`, so an alarm rings whether or not the app
 * ever runs again. JavaScript hands it everything again whenever an alarm or a setting changes.
 */
import type { Alarm } from '../models/alarm';
import type { ClockPrefs } from '../models/prefs';
import { alarmName } from './words';
import { playableSound } from './sounds';

export interface EngineAlarm {
  readonly id: string;
  /** `07:30`. */
  readonly time: string;
  /** 0 Sunday … 6 Saturday; empty: once, on `date`. */
  readonly days: readonly number[];
  readonly date: string | null;
  readonly skipDay: string | null;
  /** The days this repeating alarm keeps quiet because of Agenda (public holidays, days off; `ringingAlarms`), sorted. */
  readonly quiet: readonly string[];
  /** As the ringing notification names it (its label, else « Alarme »). */
  readonly title: string;
  readonly label: string;
  readonly sound: string;
  readonly vibrate: boolean;
}

export interface EngineSettings {
  readonly ringsHere: boolean;
  readonly snoozeMinutes: number;
  readonly silenceAfter: number;
  readonly rampSeconds: number;
  readonly volumeKeys: ClockPrefs['volumeKeys'];
  /** An instant timer's sound and vibration (a widget's start uses them too). */
  readonly timerSound: string;
  readonly timerVibrate: boolean;
  /** The words the native side shows on its own (notification actions, a missed alarm), in the app's language. */
  readonly words: EngineWords;
}

export interface EngineWords {
  readonly snooze: string;
  readonly stop: string;
  readonly ringing: string;
  readonly snoozedUntil: string;
  readonly missed: string;
  readonly channelRinging: string;
  readonly channelNotices: string;
  /** The timers' and the stopwatch's (their notifications, their window), in the app's language. */
  readonly timer: string;
  /** An unlabelled timer's name; `{length}` stays for the engine (« Minuteur de {length} »). */
  readonly timerOf: string;
  readonly timeUp: string;
  /** `{count}` stays for the engine. */
  readonly timersUp: string;
  readonly addMinute: string;
  readonly pause: string;
  readonly resume: string;
  readonly delete: string;
  /** `{time}` stays for the engine. */
  readonly paused: string;
  readonly stopwatch: string;
  readonly lap: string;
  /** `{number}` stays for the engine. */
  readonly lapNumber: string;
  readonly reset: string;
  readonly channelTimers: string;
  readonly channelTimersRinging: string;
  readonly channelStopwatch: string;
}

export interface EnginePlan {
  readonly alarms: readonly EngineAlarm[];
  readonly settings: EngineSettings;
}

/** The alarms the engine keeps: those switched on and not deleted (it decides itself whether a one-time one is still to come). */
export function engineAlarms(alarms: Iterable<Alarm>): EngineAlarm[] {
  const out: EngineAlarm[] = [];
  for (const alarm of alarms) {
    if (alarm.deletedAt !== null || !alarm.enabled) continue;
    out.push({
      id: alarm.id,
      time: alarm.time,
      days: [...alarm.days],
      date: alarm.date,
      skipDay: alarm.skipDay,
      quiet: alarm.quiet ? [...alarm.quiet].sort() : [],
      title: alarmName(alarm),
      label: alarm.label,
      sound: playableSound(alarm.sound),
      vibrate: alarm.vibrate,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export function enginePlan(alarms: Iterable<Alarm>, prefs: ClockPrefs, words: EngineWords): EnginePlan {
  return {
    alarms: engineAlarms(alarms),
    settings: {
      ringsHere: prefs.ringsHere,
      snoozeMinutes: prefs.snoozeMinutes,
      silenceAfter: prefs.silenceAfter,
      rampSeconds: prefs.rampSeconds,
      volumeKeys: prefs.volumeKeys,
      timerSound: playableSound(prefs.timerSound),
      timerVibrate: prefs.timerVibrate,
      words,
    },
  };
}
