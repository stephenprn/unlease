/** Device-local, never synced: this phone's attachment photos and the reminders it has armed. */
import { run, selectAll } from '../db/database';

export interface LocalFile {
  readonly id: string;
  readonly path: string;
  readonly mime: string;
  readonly uploaded: boolean;
}

export function loadLocalFiles(): LocalFile[] {
  return selectAll<{ id: string; path: string; mime: string; uploaded: number }>(
    'SELECT id, path, mime, uploaded FROM local_files',
  ).map(row => ({ id: row.id, path: row.path, mime: row.mime, uploaded: row.uploaded === 1 }));
}

export function saveLocalFile(file: { id: string; path: string; mime: string }, now: number): void {
  run(
    `INSERT INTO local_files (id, path, mime, uploaded, created_at) VALUES (?, ?, ?, 0, ?)
     ON CONFLICT (id) DO UPDATE SET path = excluded.path, mime = excluded.mime`,
    [file.id, file.path, file.mime, now],
  );
}

export function markFileUploaded(id: string): void {
  run('UPDATE local_files SET uploaded = 1 WHERE id = ?', [id]);
}

/** The server lost data or is another one: every photo kept here goes up again (one it has is answered at once). */
export function markAllFilesPending(): void {
  run('UPDATE local_files SET uploaded = 0');
}

export function removeLocalFile(id: string): void {
  run('DELETE FROM local_files WHERE id = ?', [id]);
}

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
