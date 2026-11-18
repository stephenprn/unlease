/**
 * Clock's alarm engine (Clock's Android app, `com.stephenprn.clock.alarm`): it keeps the alarms
 * JavaScript hands it in storage readable before the phone is first unlocked after a restart, counts
 * each one's next ring itself (as `@unlease/clock/services/schedule` does) and arms it with
 * `setAlarmClock`, the one alarm Android never holds back (Doze, the battery's « Restreinte »), with
 * the alarm's icon in the status bar. As it rings, a foreground service plays the sound on the alarm
 * stream (looping, its volume rising), vibrates, wakes the screen with the ringing window over the
 * lock screen, and stops on « Arrêter », snoozes on « Répéter », or gives up after a while and says
 * the alarm was missed: all without JavaScript, which only draws the ringing window
 * (`ringWindow`) and hands the engine its alarms again whenever they change. It runs the timers and
 * the stopwatch the same way (`tools/` in Kotlin): their notifications and widgets count by themselves,
 * a timer rings at its end, and JavaScript is told of every change (`onTools`).
 */
import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/** What rings now, or was snoozed. */
export interface RingState {
  /** `ringing`, `snoozed`, or `none`. */
  state: string;
  /** The alarm's id ('' for a test ring). */
  id: string;
  /** The moment it was set to ring (its first ring, not a snooze's). */
  at: number;
  /** When it began to ring this time. */
  since: number;
  /** A snoozed alarm rings again then; 0 otherwise. */
  until: number;
  /** How many times it was snoozed. */
  snoozes: number;
  title: string;
  label: string;
}

export interface ArmResult {
  /** How many rings are armed (snoozes included). */
  armed: number;
  /** The next one, as an instant; 0 when none. */
  next: number;
  /** Exact alarms refused (Android 12 without the grant): armed inexact instead, maybe minutes late. */
  inexact: boolean;
}

export interface AlarmHealth {
  notifications: boolean;
  exactAlarms: boolean;
  /** Android 14 and later: the ringing window may show over the lock screen. */
  fullScreen: boolean;
  /** The alarm stream's volume, and its most. */
  volume: number;
  maxVolume: number;
  /** The battery's « Restreinte ». */
  backgroundRestricted: boolean;
  /** The « Alarms ringing » channel still pops up: lowered or blocked, no ringing window opens and no buttons show. */
  ringingChannel: boolean;
  /** « Ne pas déranger » on and letting no alarm through: alarms would ring unheard. */
  alarmsMuted: boolean;
}

/** A sound picked among the phone's own (Android's picker); an empty `uri` when nothing was picked. */
export interface PhoneSound {
  uri: string;
  name: string;
}

/** Where the phone last knew it was, coarse; `found` false when it says nothing (or may not). */
export interface Whereabouts {
  found: boolean;
  lat: number;
  lon: number;
  /** When it was there. */
  at: number;
}

/** The timers this phone runs and its stopwatch, as the engine keeps them (`TimerRun[]` and `Stopwatch` as JSON, `@unlease/clock/models`). */
export interface ToolsState {
  timers: string;
  stopwatch: string;
  /** The phone's clock as it read them. */
  now: number;
}

export interface Spec extends TurboModule {
  /** Hands the engine every alarm and how this phone rings them (`EnginePlan` as JSON); it arms them again. */
  setPlan(plan: string): Promise<ArmResult>;
  /** What rings now (or was snoozed). */
  ringing(): Promise<RingState>;
  /** Snoozes what rings now (the settings' length). */
  snooze(): void;
  /** Stops what rings now, or a snoozed alarm. */
  stop(): void;
  /** A test: an alarm ringing in `seconds` with `sound`, as the settings ring it, titled `title` (never synced). */
  ringIn(seconds: number, title: string, sound: string): void;
  health(): Promise<AlarmHealth>;
  /** Opens what fixes it: `fullScreen`, `exactAlarms`, `notifications`, `battery`, or `volume` (the system's volume panel on the alarm stream). */
  open(what: string): Promise<boolean>;
  /** Plays a sound as an alarm plays it (alarm stream, its volume), until `stopPreview` or 20 seconds. */
  preview(sound: string): void;
  stopPreview(): void;
  /** Android's picker of the phone's alarm sounds, `current` ticked. */
  pickSound(current: string): Promise<PhoneSound>;
  /** Where the phone last was (the location permission granted). */
  whereabouts(): Promise<Whereabouts>;
  /** From the ringing window over the lock screen: asks to unlock, so what opens next shows. */
  unlock(): Promise<boolean>;
  /** Fires on every change: it rings, it is snoozed, it stops. */
  readonly onRing: CodegenTypes.EventEmitter<RingState>;
  /** The timers and the stopwatch now. */
  tools(): Promise<ToolsState>;
  /** Starts a timer (`TimerRun` as JSON, its moments counted again from the phone's clock). */
  startTimer(run: string): void;
  /** `pause`, `resume`, `add` (+1 min), `reset`, `delete`, or `stop` (a ring answered). */
  timerAction(id: string, action: string): void;
  /** Every timer that rings, stopped. */
  stopRingingTimers(): void;
  /** `start`, `pause`, `lap`, `reset`. */
  stopwatchAction(action: string): void;
  /** Fires on every change of a timer or the stopwatch, wherever it was made (the app, a notification, a widget). */
  readonly onTools: CodegenTypes.EventEmitter<ToolsState>;
}

export default TurboModuleRegistry.get<Spec>('AlarmEngine');
