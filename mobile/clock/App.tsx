/**
 * Clock: the alarms that wake you, rung on time by the phone itself, with the weather and the day's
 * first event as they ring, and a word the evening before when an event comes too soon after the
 * alarm. One SQLite file on the phone, synced with the owner's server; see docs/ARCHITECTURE.md.
 *
 * @format
 */
import React from 'react';

import { AppProviders } from '@app/providers/AppProviders';

export default function App(): React.ReactElement {
  return <AppProviders />;
}
