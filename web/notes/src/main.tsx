/**
 * Carnet's web app: the shell (`@shared`) with Carnet's module, at `/notes/`, Contacts' data (its
 * notes mention people: it syncs their records to name them) and Agenda's events (its notes mention
 * them too). Its English, the shell's and the
 * design system's, before anything is shown.
 */
import { addNotesEnglish } from '@unlease/notes/i18n';
import { contactsData } from '@contacts/data';
import { startApp } from '@shared/start';

import { eventsData } from './app/events/store';

import { notesModule } from './module';

addNotesEnglish();
void startApp(notesModule, {
  reads: [contactsData, eventsData],
  // Dead code outside the dev server and the demo build: the demo is never in the server's build.
  demo: import.meta.env.MODE === 'demo' || import.meta.env.DEV ? async scene => (await import('@demo/demo')).startDemo(scene) : undefined,
});
