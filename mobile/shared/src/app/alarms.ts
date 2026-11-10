/**
 * How an app that rings keeps its notifications armed (Carnet's reminders, Contacts' birthdays,
 * Agenda's events): it compares those wanted now with those this phone armed, by id. One to come is
 * armed when it is not armed yet, or armed for another moment or other words, or when every alarm must
 * be armed again (`mustArmAgain`); an alarm that failed to arm is not remembered, so it is tried again.
 * One whose moment went by unarmed (the event synced after it, the phone off, an alarm that failed)
 * rings now, if the app still wants it: each app passes only the late ones still worth ringing. One
 * that rang never rings twice; one no longer wanted goes (each app says what that takes).
 */
import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';
import { stoppedBefore } from '@shared/platform/reminders';

/** What a notification is armed with: its moment, and what it says (`key`: its words, as one string). */
export interface AlarmEntry {
  readonly at: number;
  readonly key: string;
}

export interface AlarmPlan {
  /** To arm for their moment, still to come. */
  readonly arm: readonly string[];
  /** To ring at once: their moment went by unarmed (or was moved into the past before it came). */
  readonly ringNow: readonly string[];
  /** Armed, and no longer wanted. */
  readonly gone: readonly string[];
}

export interface PlanOptions {
  /** Every alarm to come armed again, whatever this phone remembers (`mustArmAgain`). */
  readonly armAll?: boolean;
  /** Whether a late one rings now; off the first time a phone keeps this book (it does not know what rang). */
  readonly ringLate?: boolean;
}

export function planAlarms(wanted: ReadonlyMap<string, AlarmEntry>, armed: ReadonlyMap<string, AlarmEntry>, now: number, options: PlanOptions = {}): AlarmPlan {
  const arm: string[] = [];
  const ringNow: string[] = [];
  const gone: string[] = [];
  for (const [id, alarm] of wanted) {
    const before = armed.get(id);
    if (alarm.at > now) {
      if (options.armAll || !before || before.at !== alarm.at || before.key !== alarm.key) arm.push(id);
    } else if (options.ringLate !== false && (!before || (before.at !== alarm.at && before.at > now))) {
      // Never armed, or armed for later and moved into the past: it never rang. Armed for a moment gone, it rang.
      ringNow.push(id);
    }
  }
  for (const id of armed.keys()) if (!wanted.has(id)) gone.push(id);
  return { arm, ringNow, gone };
}

/** Exact alarms ring on the minute; inexact ones (Android 12 without the grant) when Android likes. */
export type AlarmMode = 'exact' | 'inexact';

/**
 * How this build arms an alarm, beyond its mode: a build that arms them another way counts it up, and
 * every alarm to come is armed again once after the update. 2: a notification's tap names MainActivity
 * by its class (`launchActivity`), the launcher's activity being now one of the icon's entries; one
 * armed before would open nothing once tapped.
 */
const ARMED_BY = 2;

/** The mode as the book keeps it (a build before `ARMED_BY` kept the mode alone). */
const armedWith = (mode: AlarmMode): string => `${mode}/${ARMED_BY}`;

/**
 * Whether every alarm to come must be armed again: a force stop took them all away (asked once per
 * process), or they were armed another way (inexact, before exact alarms were allowed, or by an older
 * build). `first`: this book was never kept on this phone (the first run, or the first since an update).
 */
export async function mustArmAgain(book: string, mode: AlarmMode): Promise<{ armAll: boolean; first: boolean }> {
  const stored = readPreferences()[modeKey(book)];
  const stopped = await stoppedBefore();
  return { armAll: stopped || stored !== armedWith(mode), first: stored === undefined };
}

/** What the book was armed with, once all its alarms were. */
export function rememberMode(book: string, mode: AlarmMode): void {
  writePreference(modeKey(book), armedWith(mode));
}

const modeKey = (book: string): string => `${book}.alarmMode`;

/** A book kept as `{ id: JSON [at, ...words] }` (Contacts', Agenda's), read whatever its older shape. */
export function readBook(stored: unknown): Map<string, AlarmEntry> {
  const out = new Map<string, AlarmEntry>();
  if (typeof stored !== 'object' || stored === null) return out;
  for (const [id, value] of Object.entries(stored as Record<string, unknown>)) {
    if (typeof value !== 'string') continue;
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed) && typeof parsed[0] === 'number') out.set(id, { at: parsed[0], key: value });
    } catch {
      // Unreadable: armed again.
    }
  }
  return out;
}
