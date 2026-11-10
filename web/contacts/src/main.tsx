/**
 * Contacts' web app: the shell (`@shared`) with Contacts' module, at `/contacts/`. Its English and
 * the design system's, before anything is shown.
 */
import { addContactsEnglish } from '@unlease/contacts/i18n';
import { startApp } from '@shared/start';

import { contactsModule } from './module';

addContactsEnglish();
void startApp(contactsModule, {
  // Dead code outside the dev server and the demo build: the demo is never in the server's build.
  demo: import.meta.env.MODE === 'demo' || import.meta.env.DEV ? async scene => (await import('@demo/demo')).startDemo(scene) : undefined,
});
