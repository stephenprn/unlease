/**
 * Wallet: loyalty cards at the till, identity papers and documents, sealed on this phone (the cards'
 * key kept by the Keystore, the papers' behind the fingerprint) and synced sealed with the owner's
 * server; see docs/ARCHITECTURE.md.
 *
 * @format
 */
import React from 'react';

import { AppProviders } from '@app/providers/AppProviders';

export default function App(): React.ReactElement {
  return <AppProviders />;
}
