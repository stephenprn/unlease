/**
 * What Clock's programs add to the dictionary at start, before anything is shown: Agenda's French
 * (whose days, times and events it shows, with what Agenda counts on) and its own.
 */
import { addFrench } from '@unlease/core/i18n';
import { addCalendarFrench } from '@unlease/calendar/i18n';
import { CLOCK_FRENCH } from './fr';

export function addClockFrench(): void {
  addCalendarFrench();
  addFrench(CLOCK_FRENCH);
}
