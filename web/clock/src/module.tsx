/**
 * Clock's web app: everything it brings to the shell (`shared/modules`). The alarms, seen and set
 * from a computer (they ring on the phones with Clock for Android, never in the browser), each one's
 * form over the list; the timers (saved ones synced, those started here running and ringing in this
 * browser while it is open), the stopwatch (this browser's), the world clocks (synced); the Réglages
 * a browser can set (a new alarm's sound and what it shows as it rings, the clock's format, the
 * week's first day); an alarm in the spotlight, « Créer une alarme » (C), the other places' commands,
 * the stopwatch's keys (Space, L). No import, no Administration of its own.
 */
import { t, tx } from '@unlease/core/i18n';
import { isRunning } from '@unlease/clock/models/stopwatch';
import { readClock } from '@unlease/calendar/services/time';
import { eraseParts } from '@unlease/clock/services/erase';
import { CLOCK_SETTINGS_PLACES } from '@unlease/clock/services/settingsPlaces';
import { alarmClock } from '@unlease/clock/services/words';

import type { AppModule, ShortcutGroup } from '@shared/modules';
import { navigate } from '@shared/ui/router';
import { eraseClock } from './app/store/actions';
import { useClockStore } from './app/store/library';
import { usePrefsStore } from './app/store/prefs';
import { startStopwatch, useToolsStore } from './app/store/tools';
import { clockData } from './data';
import { ClockBottomBar, ClockHeaderActions, ClockNav, clockOpened, ClockOverlays, clockPageUnder, clockPathOf, ClockScreen, clockStillThere, isClockPlace, useClockTitle } from './ui/ClockShell';
import { openCitySearch, openNewAlarm, openNewTimer } from './ui/features/open';
import { CLOCK_SETTINGS } from './ui/features/settings/ClockSettings';
import { CLOCK_SPOT_KINDS } from './ui/features/spotlight/kinds';
import { CLOCK_ROUTES, HOME, parseClockRoute, paths } from './ui/routes';
import { stopwatchKey } from './ui/screens/StopwatchScreen';

/** The stopwatch's keys in the shortcuts dialog (`onKey`). */
const CLOCK_SHORTCUTS: readonly ShortcutGroup[] = [
  {
    title: tx('On the stopwatch'),
    rows: [
      [[tx('Space')], tx('Start or pause')],
      [['L'], tx('Lap')],
    ],
  },
];

export const clockModule: AppModule = {
  id: 'clock',
  home: HOME,
  data: clockData,

  routes: { names: CLOCK_ROUTES, parse: parseClockRoute },
  Screen: ClockScreen,
  pageUnder: clockPageUnder,
  pathOf: clockPathOf,
  // The four places are each a home: the navigation's rows, the search header on a phone-sized window.
  isHome: isClockPlace,
  backTo: () => HOME,
  useTitle: (page, overlay) => useClockTitle(page, overlay),
  stillThere: clockStillThere,
  opened: clockOpened,
  Overlays: ClockOverlays,

  Nav: ClockNav,
  HeaderActions: ClockHeaderActions,
  BottomBar: ClockBottomBar,
  searchHome: HOME,

  spotKinds: CLOCK_SPOT_KINDS,
  commands: [
    { title: tx('New alarm'), icon: 'plus', key: 'c', run: () => openNewAlarm() },
    { title: tx('New timer'), icon: 'timer', run: openNewTimer },
    {
      title: tx('Start the stopwatch'),
      icon: 'stopwatch',
      run: () => {
        if (!isRunning(useToolsStore.getState().stopwatch)) startStopwatch();
        navigate(paths.stopwatch);
      },
    },
    { title: tx('Add a city'), icon: 'globe', run: openCitySearch },
  ],
  onKey: (event, route) => route.name === 'clockStopwatch' && stopwatchKey(event),
  shortcuts: CLOCK_SHORTCUTS,
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
    parts: () => eraseParts(useClockStore.getState()),
    run: chosen => eraseClock(chosen),
  },
  settingsPlaces: CLOCK_SETTINGS_PLACES,
};
