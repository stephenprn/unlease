/**
 * Agenda's web app: the shell (`@shared`) with Agenda's module, at `/agenda/`, and the data of the
 * apps it shows: Contacts' (the birthdays, the guests, the people mentioned), Carnet's (its notes'
 * reminders, the notes and links mentioned, the gift ideas) and Pages' blocks (the days written in
 * pages, the pages mentioned). Its English, theirs, the shell's and the design system's, first.
 */
import { addCalendarFrench } from '@unlease/calendar/i18n';
import { contactsData } from '@contacts/data';
import { notesData } from '@notes/data';
import { startApp } from '@shared/start';

import { calendarModule } from './module';
import { pageBlocksData } from './app/store/pageBlocks';

addCalendarFrench();
void startApp(calendarModule, {
  reads: [contactsData, notesData, pageBlocksData],
  // Dead code outside the dev server and the demo build: the demo is never in the server's build.
  demo: import.meta.env.MODE === 'demo' || import.meta.env.DEV ? async scene => (await import('@demo/demo')).startDemo(scene) : undefined,
});
