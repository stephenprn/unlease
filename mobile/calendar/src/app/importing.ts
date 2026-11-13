/**
 * Calendar files to import (one picked, or those shared or opened with Agenda): each read on its own
 * (`parseIcs`), a calendar of the import wizard (`ui/features/importing`), which plans them against
 * the events here and writes them as one batch once the person says so. The copies in the app's cache
 * go once read.
 */
import { t } from '@unlease/core/i18n';
import { parseIcs } from '@unlease/calendar/services/ics';
import type { ImportFile } from '@unlease/calendar/services/importing';
import { readText, removePath } from '@shared/platform/media';

export type ReadOutcome = { readonly status: 'ok'; readonly files: readonly ImportFile[] } | { readonly status: 'error'; readonly message: string } | { readonly status: 'empty' };

const baseName = (path: string): string => decodeURIComponent(path.split('/').pop() ?? '');

/** The files at `paths` (their names as the picker showed them, when it did), each a calendar; the cache's copies removed. */
export async function readCalendarFiles(paths: readonly string[], names: readonly string[] = []): Promise<ReadOutcome> {
  const files: ImportFile[] = [];
  let unreadable = false;
  for (const [index, path] of paths.entries()) {
    try {
      const text = await readText(path);
      if (/BEGIN:VCALENDAR/i.test(text)) files.push({ fileName: names[index] || baseName(path), calendar: parseIcs(text) });
      else unreadable = true;
    } catch {
      unreadable = true;
    } finally {
      void removePath(path);
    }
  }
  const held = files.filter(file => file.calendar.events.length > 0 || (file.calendar.unreadable ?? []).length > 0);
  if (held.length > 0) return { status: 'ok', files: held };
  return files.length > 0 && !unreadable ? { status: 'empty' } : { status: 'error', message: t('This file does not read as a calendar.') };
}
