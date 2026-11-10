/**
 * Pages' web app: the shell (`@shared`) with Pages' module, at `/pages/`, Carnet's data (Pages
 * shows its notes, collections and links: it syncs their records and keeps them as Carnet does) and
 * Contacts' (its pages mention people) and Agenda's events (its pages mention them, and a calendar
 * block lists the next ones: `@notes/app/events/store`).
 * Its English, Carnet's, the shell's and the design system's, before anything is shown.
 */
import { addPagesEnglish } from '@unlease/pages/i18n';
import { contactsData } from '@contacts/data';
import { eventsData } from '@notes/app/events/store';
import { notesData } from '@notes/data';
import { startApp } from '@shared/start';

import { pagesModule } from './module';

addPagesEnglish();
void startApp(pagesModule, {
  reads: [notesData, contactsData, eventsData],
  // Dead code outside the dev server and the demo build: the demo is never in the server's build.
  demo: import.meta.env.MODE === 'demo' || import.meta.env.DEV ? async scene => (await import('@demo/demo')).startDemo(scene) : undefined,
});
