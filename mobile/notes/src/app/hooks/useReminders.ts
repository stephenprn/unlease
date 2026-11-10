/**
 * Keeps armed notifications in step with the notes' reminders, comparing with what this phone
 * last armed (`scheduled_reminders`, `planAlarms`), and answers the notification buttons. A reminder
 * whose moment went by unarmed (set on another device and synced after it, the phone off) rings late,
 * within a day: a note's reminder stays to do until it is answered. A force stop, or exact alarms
 * newly allowed, arms every reminder again. With the app closed, `remindersTask` does the same every
 * hour while a note has a reminder, and after the system's changes (`keepRemindersFresh`), pulling
 * first what other devices wrote.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { APP_NAME } from '@unlease/notes/brand';
import { t } from '@unlease/core/i18n';
import { shownTitle, type Note } from '@unlease/notes/models/entities';
import { bodyText } from '@unlease/notes/services/noteBody';
import { loadScheduledReminders, removeScheduledReminder, saveScheduledReminder } from '@data/repositories/reminderRepository';
import { arm, canScheduleExact, disarm, ensurePermission, initialEvent, onForegroundEvent, ringNow, type ReminderEvent } from '@platform/notifications';
import { mustArmAgain, planAlarms, rememberMode, type AlarmEntry } from '@shared/app/alarms';
import { keepRemindersFresh } from '@shared/platform/reminders';

import { setReminder } from '../store/actions';
import { useLibraryStore } from '../store/libraryStore';
import { showSnack } from '@shared/app/store/uiStore';

const SNOOZE_MS = 60 * 60 * 1000;
/** How late a reminder that went by unarmed still rings. */
export const LATE_RING_MS = 24 * 60 * 60 * 1000;
const BOOK = 'notes';
/** How often the reminders are seen to with the app closed, once a note has one: one set on another device is armed within the hour. */
export const REFRESH_MINUTES = 60;

function preview(note: Note): { title: string; body: string } {
  const text = bodyText(note);
  const firstLine = text.split('\n').find(line => line.trim()) ?? '';
  return {
    title: shownTitle(note).trim() || firstLine.slice(0, 80) || t('Rappel'),
    body: note.title.trim() ? text.slice(0, 200) : '',
  };
}

let permissionAsked = false;

/**
 * Asks once per start to post notifications, while a reminder is ahead, and only with the app in
 * front: one arriving by sync in the background cannot show Android's question, and would ring
 * unseen; it is asked as the app comes back (`useReminders`).
 */
async function askOnce(): Promise<void> {
  if (permissionAsked || AppState.currentState !== 'active') return;
  permissionAsked = true;
  // Refused, a reminder would be set and never ring: say so once, where the person sees it.
  const allowed = await ensurePermission().catch(() => false);
  if (!allowed) showSnack(t('Les notifications de {app} sont désactivées : les rappels ne sonneront pas.', { app: APP_NAME }), undefined, { tone: 'warning' });
}

let running: Promise<void> = Promise.resolve();

/** Arms what is wanted and not armed (or armed otherwise), rings what went by unarmed, cancels what is no longer wanted. One run at a time. */
export function reconcileReminders(notes: Readonly<Record<string, Note>>, now: number = Date.now()): Promise<void> {
  running = running.then(() => reconcile(notes, now)).catch(() => undefined);
  return running;
}

async function reconcile(notes: Readonly<Record<string, Note>>, now: number): Promise<void> {
  const exact = await canScheduleExact().catch(() => false);
  const mode = exact ? 'exact' : 'inexact';
  const { armAll, first } = await mustArmAgain(BOOK, mode);
  const stored = loadScheduledReminders();
  const armed = new Map<string, AlarmEntry>([...stored].map(([id, at]) => [id, { at, key: '' }]));
  const wanted = new Map<string, Note>();
  for (const note of Object.values(notes)) {
    if (note.reminderAt !== null && note.reminderAt > now - LATE_RING_MS && note.deletedAt === null && note.trashedAt === null) {
      wanted.set(note.id, note);
    }
  }
  if ([...wanted.values()].some(note => note.reminderAt! > now)) await askOnce();
  const entries = new Map<string, AlarmEntry>([...wanted].map(([id, note]) => [id, { at: note.reminderAt!, key: '' }]));
  const plan = planAlarms(entries, armed, now, { armAll, ringLate: !first });
  let failed = false;
  for (const id of plan.arm) {
    const note = wanted.get(id)!;
    // Not kept when it failed (a moment that went by meanwhile, Android refusing): tried again next time.
    if (await arm({ noteId: id, at: note.reminderAt!, ...preview(note) }, exact).then(() => true, () => false)) saveScheduledReminder(id, note.reminderAt!);
    else {
      removeScheduledReminder(id);
      failed = true;
    }
  }
  for (const id of plan.ringNow) {
    const note = wanted.get(id)!;
    await ringNow({ noteId: id, at: note.reminderAt!, ...preview(note) }).catch(() => undefined);
    saveScheduledReminder(id, note.reminderAt!);
  }
  // A late one not rung (the first run keeps no record of what rang): kept, so it never rings later.
  for (const [id, note] of wanted) if (note.reminderAt! <= now && stored.get(id) !== note.reminderAt) saveScheduledReminder(id, note.reminderAt!);
  for (const id of plan.gone) {
    const at = stored.get(id)!;
    // One that rang stays in the shade until the person answers it: only a reminder taken off, moved
    // or binned takes its notification away (else the next change after the hour would hide it unseen).
    const note = notes[id];
    const rang = !!note && note.reminderAt === at && at <= now && note.deletedAt === null && note.trashedAt === null;
    if (!rang) await disarm(id).catch(() => undefined);
    removeScheduledReminder(id);
  }
  if (!failed) rememberMode(BOOK, mode);
  // Without a reminder on any note, nothing to see to with the app closed: no run every hour for nothing.
  keepRemindersFresh(Object.values(notes).some(note => note.reminderAt !== null && note.deletedAt === null && note.trashedAt === null) ? REFRESH_MINUTES : 0);
}

export function answerReminder(event: ReminderEvent, now: number = Date.now()): void {
  if (event.kind === 'done') setReminder(event.noteId, null);
  if (event.kind === 'snooze') setReminder(event.noteId, now + SNOOZE_MS);
}

export function useReminders(onOpen: (noteId: string) => void): void {
  const notes = useLibraryStore(s => s.notes);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);


  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      reconcileReminders(notes).catch(() => undefined);
    }, 600);
    return () => clearTimeout(timer.current);
  }, [notes]);

  // Back in front: a reminder that came while the app was away may still need the permission asked.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') reconcileReminders(useLibraryStore.getState().notes).catch(() => undefined);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const handle = (event: ReminderEvent) => {
      if (event.kind === 'open') onOpen(event.noteId);
      else answerReminder(event);
    };
    initialEvent()
      .then(event => event && setTimeout(() => handle(event), 400))
      .catch(() => undefined);
    return onForegroundEvent(handle);
  }, [onOpen]);
}
