/**
 * Carnet: notes, checklists and lists of links that read themselves.
 * One SQLite file on the phone, synced with the owner's server; see docs/ARCHITECTURE.md.
 *
 * @format
 */
import React from 'react';

import { AppProviders } from '@app/providers/AppProviders';

export default function App(): React.ReactElement {
  return <AppProviders />;
}
