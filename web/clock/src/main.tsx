/**
 * Clock's web app: the shell (`@shared`) with Clock's module, at `/clock/`, and Agenda's records
 * (an alarm says the day's events as it rings: Clock folds them itself, `app/store/agenda`). Its
 * English, Agenda's, the shell's and the design system's, before anything is shown.
 */
import { addClockFrench } from '@unlease/clock/i18n';
import { startApp } from '@shared/start';

import { agendaData } from './app/store/agenda';
import { clockModule } from './module';

addClockFrench();
void startApp(clockModule, {
  reads: [agendaData],
  // Dead code outside the dev server and the demo build: the demo is never in the server's build.
  demo: import.meta.env.MODE === 'demo' || import.meta.env.DEV ? async scene => (await import('@demo/demo')).startDemo(scene) : undefined,
});
