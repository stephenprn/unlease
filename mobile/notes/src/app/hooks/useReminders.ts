/**
 * Keeps armed notifications in step with the notes' reminders, comparing with what this phone
 * last armed (`scheduled_reminders`), and answers the notification buttons.
 */
import { useEffect, useRef } from 'react';

import { APP_NAME } from '@unlease/notes/brand';
import { t } from '@unlease/core/i18n';
import { shownTitle, type Note } from '@unlease/notes/models/entities';
import { bodyText } from '@unlease/notes/services/noteBody';
import { loadScheduledReminders, removeScheduledReminder, saveScheduledReminder } from '@data/repositories/fileRepository';
import { arm, disarm, ensurePermission, initialEvent, onForegroundEvent, type ReminderEvent } from '@platform/notifications';

import { setReminder } from '../store/actions';
import { useLibraryStore } from '../store/libraryStore';
import { showSnack } from '../store/uiStore';

const SNOOZE_MS = 60 * 60 * 1000;

function preview(note: Note): { title: string; body: string } {
  const text = bodyText(note);
  const firstLine = text.split('\n').find(line => line.trim()) ?? '';
  return {
    title: shownTitle(note).trim() || firstLine.slice(0, 80) || t('Rappel'),
    body: note.title.trim() ? text.slice(0, 200) : '',
  };
}

let permissionAsked = false;

export async function reconcileReminders(notes: Readonly<Record<string, Note>>, now: number = Date.now()): Promise<void> {
  const armed = loadScheduledReminders();
  const wanted = new Map<string, Note>();
  for (const note of Object.values(notes)) {
    if (note.reminderAt !== null && note.reminderAt > now && note.deletedAt === null && note.trashedAt === null) {
      wanted.set(note.id, note);
    }
  }
  for (const [id, note] of wanted) {
    if (armed.get(id) === note.reminderAt) continue;
    if (!permissionAsked) {
      permissionAsked = true;
      // Refused, a reminder would be set and never ring: say so once, where the person sees it.
      const allowed = await ensurePermission().catch(() => false);
      if (!allowed) showSnack(t('Les notifications de {app} sont désactivées : les rappels ne sonneront pas.', { app: APP_NAME }), undefined, { tone: 'warning' });
    }
    await arm({ noteId: id, at: note.reminderAt!, ...preview(note) }).catch(() => undefined);
    saveScheduledReminder(id, note.reminderAt!);
  }
  for (const id of armed.keys()) {
    if (wanted.has(id)) continue;
    await disarm(id).catch(() => undefined);
    removeScheduledReminder(id);
  }
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
