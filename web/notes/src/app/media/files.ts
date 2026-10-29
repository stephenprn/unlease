/**
 * Photos added in this browser, kept in IndexedDB until the server has them.
 *
 * The sync loop uploads them after each exchange and forgets each one once the
 * server holds it; until then a note shows its photos from here, offline too.
 * Without IndexedDB (a blocked profile) they live in memory for the visit.
 */
import { deleteFile, listFileIds, readFile, saveFile, type StoredFile } from '../db/database';

let db: IDBDatabase | null = null;
const memory = new Map<string, StoredFile>();

export function setFilesDatabase(database: IDBDatabase | null): void {
  db = database;
  memory.clear();
}

export async function storeFile(id: string, blob: Blob, mime: string, now: number = Date.now()): Promise<void> {
  const file: StoredFile = { id, bytes: await blob.arrayBuffer(), mime, createdAt: now };
  if (db) await saveFile(db, file);
  else memory.set(id, file);
}

export async function readStoredFile(id: string): Promise<Blob | null> {
  const file = db ? await readFile(db, id) : (memory.get(id) ?? null);
  return file ? new Blob([file.bytes], { type: file.mime }) : null;
}

export async function removeStoredFile(id: string): Promise<void> {
  if (db) await deleteFile(db, id);
  else memory.delete(id);
}

export async function storedFileIds(): Promise<string[]> {
  return db ? listFileIds(db) : [...memory.keys()];
}
