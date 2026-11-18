/**
 * What Wallet's programs add to the dictionary at start, before anything is shown: Agenda's French
 * (whose days it writes, with what Agenda counts on) and its own.
 */
import { addFrench } from '@unlease/core/i18n';
import { addCalendarFrench } from '@unlease/calendar/i18n';
import { WALLET_FRENCH } from './fr';

export function addWalletFrench(): void {
  addCalendarFrench();
  addFrench(WALLET_FRENCH);
}
