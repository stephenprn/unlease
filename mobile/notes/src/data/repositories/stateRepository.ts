/** Key/value state: sync bookkeeping (strings) and device preferences (JSON values). */
import { run, selectAll, selectOne } from '../db/database';

export function readSyncState(key: string): string | null {
  return selectOne<{ value: string }>('SELECT value FROM sync_state WHERE key = ?', [key])?.value ?? null;
}

export function writeSyncState(key: string, value: string): void {
  run(
    'INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

export function readPreferences(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of selectAll<{ key: string; value: string }>('SELECT key, value FROM preferences')) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      // A value this version cannot read is skipped, never fatal.
    }
  }
  return out;
}

export function writePreference(key: string, value: unknown): void {
  run(
    'INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    [key, JSON.stringify(value)],
  );
}
