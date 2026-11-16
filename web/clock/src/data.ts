/**
 * Clock's records as its web app holds them: its state, and what this browser remembers of it. A
 * leaf: it pulls in none of Clock's screens. No other app shows alarms, so no other app installs it.
 */
import type { AppData } from '@shared/modules';
import { clockProjection } from './app/store/library';
import { loadPrefs, resetPrefs } from './app/store/prefs';

export const clockData: AppData = {
  id: 'clock',
  projection: clockProjection,
  load: loadPrefs,
  reset: resetPrefs,
};
