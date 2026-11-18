/**
 * Wallet's web app: the shell (`@shared`) with Wallet's module, at `/wallet/`, and Contacts' records
 * (a paper may concern someone else: a child's passport). Its English, Agenda's (whose days it
 * writes), the shell's and the design system's, before anything is shown.
 */
import { addContactsFrench } from '@unlease/contacts/i18n';
import { addWalletFrench } from '@unlease/wallet/i18n';
import { startApp } from '@shared/start';

import { contactsData } from '@contacts/data';
import { walletModule } from './module';

addContactsFrench();
addWalletFrench();
void startApp(walletModule, {
  reads: [contactsData],
  demo: import.meta.env.MODE === 'demo' || import.meta.env.DEV ? async scene => (await import('@demo/demo')).startDemo(scene) : undefined,
});
