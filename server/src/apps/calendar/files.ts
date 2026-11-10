/**
 * Where Agenda's files go in a readable tree, the same in the drive (Seafile) and in a backup
 * archive, under a folder named after the app and the event that holds them:
 * `Agenda/2026-11-02 Concert/billet.pdf`. Names come from the events' days and titles (`blobs/names`),
 * oldest first, so a name never moves to another event.
 */
import { APP_NAME } from '@unlease/calendar/brand';
import type { CalendarEvent } from '@unlease/calendar/models/events';
import { eventFromRecord } from '@unlease/calendar/sync/entities';
import { extensionFor, safeName, uniqueName } from '../../blobs/names';
import type { StoredRecord } from '../../sync/records';
import type { FilesOptions } from '../types';

/** The app's own folder in the drive and in an archive. */
export const FOLDER = APP_NAME;

/** Agenda's live events (the bin's too: they come back), from every record the server holds. */
export function readEvents(all: readonly StoredRecord[]): CalendarEvent[] {
  return all
    .filter(record => record.type === 'calendarEvent')
    .map(eventFromRecord)
    .filter(event => event.deletedAt === null)
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Blob id -> its path in the tree, for the files live events hold. */
export function layoutEvents(events: readonly CalendarEvent[], options: FilesOptions): Map<string, string> {
  const files = new Map<string, string>();
  const folders = new Set<string>();
  const taken = new Map<string, Set<string>>();
  for (const event of events) {
    if (event.files.length === 0) continue;
    const folder = `${FOLDER}/${uniqueName(safeName(`${event.start.slice(0, 10)} ${event.title.trim()}`.trim(), event.start.slice(0, 10)), folders)}`;
    const names = new Set<string>();
    taken.set(folder, names);
    for (const file of event.files) {
      if (files.has(file.id)) continue;
      const mime = options.mimeOf?.(file.id) ?? file.mime;
      const dot = file.name.lastIndexOf('.');
      const hasExtension = dot > 0 && dot >= file.name.length - 6;
      const stem = hasExtension ? file.name.slice(0, dot) : file.name;
      const extension = hasExtension ? file.name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') || extensionFor(mime) : extensionFor(mime);
      files.set(file.id, `${folder}/${uniqueName(safeName(stem, 'fichier'), names, extension)}`);
    }
  }
  return files;
}

/** Every file an event holds, live or kept (`keep`: a tombstone the purge just wrote). */
export function calendarFilesInUse(records: readonly StoredRecord[], keep: (record: StoredRecord) => boolean): Set<string> {
  const ids = new Set<string>();
  for (const record of records) {
    if (record.type !== 'calendarEvent' || !Array.isArray(record.fields.files)) continue;
    const live = record.fields.deletedAt === null || record.fields.deletedAt === undefined;
    if (!live && !keep(record)) continue;
    for (const file of record.fields.files) {
      const id = (file as { id?: unknown } | null)?.id;
      if (typeof id === 'string') ids.add(id);
    }
  }
  return ids;
}
