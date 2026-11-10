/**
 * A calendar file to import: read (`parseIcs`) and planned against the events already here
 * (`planImport`: an event once, its exceptions with it), shown on the import screen to confirm,
 * written as one batch.
 */
import { t } from '@unlease/core/i18n';
import { parseIcs, type IcsCalendar } from '@unlease/calendar/services/ics';
import { readText } from '@shared/platform/media';

export type ReadOutcome = { readonly status: 'ok'; readonly calendar: IcsCalendar } | { readonly status: 'error'; readonly message: string } | { readonly status: 'empty' };

/** The events of the files shared or opened, as one calendar. */
export async function readCalendarFiles(paths: readonly string[]): Promise<ReadOutcome> {
  const calendars: IcsCalendar[] = [];
  for (const path of paths) {
    try {
      calendars.push(parseIcs(await readText(path)));
    } catch {
      return { status: 'error', message: t('Fichier illisible') };
    }
  }
  const events = calendars.flatMap(calendar => calendar.events);
  if (events.length === 0) return calendars.length > 0 ? { status: 'empty' } : { status: 'error', message: t('Fichier illisible') };
  return { status: 'ok', calendar: { name: calendars.find(calendar => calendar.name)?.name ?? '', events } };
}
