/**
 * The files given to the import (picked, dropped on its zone or anywhere on Agenda), read: each
 * `.ics` a calendar; a `.zip` (Google Agenda's export, or Takeout's) opened for the `.ics` it holds,
 * one per calendar. What is no calendar is named, with why, and set aside.
 */
import { unzipSync } from 'fflate';

import { t } from '@unlease/core/i18n';
import { parseIcs } from '@unlease/calendar/services/ics';
import type { ImportFile } from '@unlease/calendar/services/importing';

export interface ReadFiles {
  readonly files: readonly ImportFile[];
  /** Those set aside: their names and why. */
  readonly refused: readonly { readonly name: string; readonly why: string }[];
}

const isZip = (file: File): boolean => /\.zip$/i.test(file.name) || /zip/i.test(file.type);

/** Whether a file given anywhere is one the import reads. */
export const isCalendarFile = (file: File): boolean => /\.(ics|ical|icalendar|ifb)$/i.test(file.name) || /calendar/i.test(file.type) || isZip(file);

const baseName = (path: string): string => path.split('/').pop() ?? path;

/** One text: a calendar, or why not. */
function readText(name: string, text: string): ImportFile | string {
  if (!/BEGIN:VCALENDAR/i.test(text)) return t('Ce fichier ne se lit pas comme un agenda.');
  const calendar = parseIcs(text);
  if (calendar.events.length === 0 && (calendar.unreadable ?? []).length === 0) return t('Aucun événement dans ce fichier.');
  return { fileName: name, calendar };
}

/** The files read, in the order given (an archive's calendars in its order). */
export async function readImportFiles(given: readonly File[]): Promise<ReadFiles> {
  const files: ImportFile[] = [];
  const refused: { name: string; why: string }[] = [];
  const decoder = new TextDecoder();
  for (const file of given) {
    try {
      if (isZip(file)) {
        const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: entry => /\.ics$/i.test(entry.name) && !baseName(entry.name).startsWith('.') });
        const names = Object.keys(entries).sort();
        if (names.length === 0) refused.push({ name: file.name, why: t('Cette archive ne contient aucun fichier .ics.') });
        for (const name of names) {
          const read = readText(baseName(name), decoder.decode(entries[name]));
          if (typeof read === 'string') refused.push({ name: baseName(name), why: read });
          else files.push(read);
        }
        continue;
      }
      const read = readText(file.name, await file.text());
      if (typeof read === 'string') refused.push({ name: file.name, why: read });
      else files.push(read);
    } catch {
      refused.push({ name: file.name, why: isZip(file) ? t('Cette archive ne s’ouvre pas.') : t('Ce fichier ne se lit pas comme un agenda.') });
    }
  }
  return { files, refused };
}
