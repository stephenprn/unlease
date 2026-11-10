/**
 * Agenda: your events, their repeats and reminders, labels, the calendars you subscribe to, the
 * public holidays, your contacts' birthdays and your notes' reminders. One SQLite file on the phone,
 * synced with the owner's server; see docs/ARCHITECTURE.md.
 *
 * @format
 */
import React from 'react';

import { AppProviders } from '@app/providers/AppProviders';

export default function App(): React.ReactElement {
  return <AppProviders />;
}
