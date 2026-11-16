/**
 * Clock's alarm engine (`mobile/shared/specs/NativeAlarmEngine.ts`, Kotlin in
 * `android/app/src/main/java/com/stephenprn/clock/alarm`), as the app reaches it. Without the native
 * module (a test, another platform) everything answers « nothing », so the app still draws.
 */
import type { EventSubscription } from 'react-native';

import NativeAlarmEngine, { type AlarmHealth, type ArmResult, type PhoneSound, type RingState, type Whereabouts } from '../../../shared/specs/NativeAlarmEngine';

export type { AlarmHealth, ArmResult, PhoneSound, RingState, Whereabouts };

export const NO_RING: RingState = { state: 'none', id: '', at: 0, since: 0, until: 0, snoozes: 0, title: '', label: '' };

/** Hands the engine every alarm and how this phone rings them; it arms them again. */
export async function setPlan(plan: string): Promise<ArmResult> {
  if (!NativeAlarmEngine) return { armed: 0, next: 0, inexact: false };
  return NativeAlarmEngine.setPlan(plan);
}

export async function ringing(): Promise<RingState> {
  if (!NativeAlarmEngine) return NO_RING;
  try {
    return await NativeAlarmEngine.ringing();
  } catch {
    return NO_RING;
  }
}

export const snooze = (): void => NativeAlarmEngine?.snooze();
export const stop = (): void => NativeAlarmEngine?.stop();
/** Réglages' « Essayer » : an alarm ringing in a few seconds, as this phone rings them. */
export const ringIn = (seconds: number, title: string, sound: string): void => NativeAlarmEngine?.ringIn(seconds, title, sound);

export async function health(): Promise<AlarmHealth> {
  if (!NativeAlarmEngine) return { notifications: true, exactAlarms: true, fullScreen: true, volume: 1, maxVolume: 1, backgroundRestricted: false, ringingChannel: true, alarmsMuted: false };
  return NativeAlarmEngine.health();
}

/** Opens what fixes it: `fullScreen`, `exactAlarms`, `notifications`, `ringingChannel`, `doNotDisturb`, `battery`, or `volume`. */
export const openFix = (what: 'fullScreen' | 'exactAlarms' | 'notifications' | 'ringingChannel' | 'doNotDisturb' | 'battery' | 'volume'): Promise<boolean> => NativeAlarmEngine?.open(what) ?? Promise.resolve(false);

export const preview = (sound: string): void => NativeAlarmEngine?.preview(sound);
export const stopPreview = (): void => NativeAlarmEngine?.stopPreview();

/** Android's picker of the phone's own alarm sounds; null when nothing was picked. */
export async function pickPhoneSound(current: string): Promise<PhoneSound | null> {
  if (!NativeAlarmEngine) return null;
  const picked = await NativeAlarmEngine.pickSound(current);
  return picked.uri ? picked : null;
}

/** Where the phone last was (the coarse location granted), or null. */
export async function whereabouts(): Promise<Whereabouts | null> {
  if (!NativeAlarmEngine) return null;
  try {
    const spot = await NativeAlarmEngine.whereabouts();
    return spot.found ? spot : null;
  } catch {
    return null;
  }
}

/** Over the lock screen: asks to unlock, so what opens next shows. */
export const unlock = (): Promise<boolean> => NativeAlarmEngine?.unlock() ?? Promise.resolve(true);

/** Every change of what rings (it rings, it is snoozed, it stops). */
export function onRing(listener: (ring: RingState) => void): EventSubscription | null {
  return NativeAlarmEngine?.onRing(listener) ?? null;
}
