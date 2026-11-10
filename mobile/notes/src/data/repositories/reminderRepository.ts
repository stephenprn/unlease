/** Device-local, never synced: the reminders this phone has armed, to compare with those synced from elsewhere. */
import { run, selectAll } from '@shared/data/db/database';

export function loadScheduledReminders(): Map<string, number> {
  return new Map(
    selectAll<{ note_id: string; at: number }>('SELECT note_id, at FROM scheduled_reminders').map(row => [
      row.note_id,
      Number(row.at),
    ]),
  );
}

export function saveScheduledReminder(noteId: string, at: number): void {
  run(
    'INSERT INTO scheduled_reminders (note_id, at) VALUES (?, ?) ON CONFLICT (note_id) DO UPDATE SET at = excluded.at',
    [noteId, at],
  );
}

export function removeScheduledReminder(noteId: string): void {
  run('DELETE FROM scheduled_reminders WHERE note_id = ?', [noteId]);
}
