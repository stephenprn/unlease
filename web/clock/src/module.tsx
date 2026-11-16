/**
 * Clock's web app: everything it brings to the shell (`shared/modules`). The alarms, seen and set
 * from a computer (they ring on the phones with Clock for Android, never in the browser), each one's
 * form over the list, the Réglages a browser can set (a new alarm's sound and what it shows as it
 * rings, the clock's format, the week's first day); an alarm in the spotlight, « Créer une alarme »
 * (C). No import, no Administration of its own.
 */
import { t, tx } from '@unlease/core/i18n';
import { readClock } from '@unlease/calendar/services/time';
import { eraseParts } from '@unlease/clock/services/erase';
import { CLOCK_SETTINGS_PLACES } from '@unlease/clock/services/settingsPlaces';
import { alarmClock } from '@unlease/clock/services/words';

import type { AppModule } from '@shared/modules';
import { eraseClock } from './app/store/actions';
import { useClockStore } from './app/store/library';
import { usePrefsStore } from './app/store/prefs';
import { clockData } from './data';
import { ClockBottomBar, ClockHeaderActions, ClockNav, clockOpened, ClockOverlays, clockPageUnder, clockPathOf, ClockScreen, clockStillThere, useClockTitle } from './ui/ClockShell';
import { openNewAlarm } from './ui/features/open';
import { CLOCK_SETTINGS } from './ui/features/settings/ClockSettings';
import { CLOCK_SPOT_KINDS } from './ui/features/spotlight/kinds';
import { CLOCK_ROUTES, HOME, parseClockRoute } from './ui/routes';

export const clockModule: AppModule = {
  id: 'clock',
  home: HOME,
  data: clockData,

  routes: { names: CLOCK_ROUTES, parse: parseClockRoute },
  Screen: ClockScreen,
  pageUnder: clockPageUnder,
  pathOf: clockPathOf,
  isHome: route => route.name === 'clock',
  backTo: () => HOME,
  useTitle: (_page, overlay) => useClockTitle(overlay),
  stillThere: clockStillThere,
  opened: clockOpened,
  Overlays: ClockOverlays,

  Nav: ClockNav,
  HeaderActions: ClockHeaderActions,
  BottomBar: ClockBottomBar,
  searchHome: HOME,

  spotKinds: CLOCK_SPOT_KINDS,
  commands: [{ title: tx('New alarm'), icon: 'plus', key: 'c', run: () => openNewAlarm() }],
  // What was typed is a time (« 6h15 »): an alarm then; else its label.
  spotCreates: [
    {
      type: 'alarm',
      title: typed => {
        const time = readClock(typed);
        return time ? t('New alarm at {time}', { time: alarmClock(time, usePrefsStore.getState().twelveHours) }) : t('New alarm “{label}”', { label: typed.trim() });
      },
      icon: 'plus',
      run: typed => {
        const time = readClock(typed);
        openNewAlarm(time ? { time } : { label: typed });
      },
    },
  ],

  settingsSections: CLOCK_SETTINGS,
  erase: {
    parts: () => eraseParts(useClockStore.getState().alarms),
    run: chosen => eraseClock(chosen),
  },
  settingsPlaces: CLOCK_SETTINGS_PLACES,
};
