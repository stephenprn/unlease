/**
 * Clock's places as the shell draws them, and its frame: the navigation (the alarms, the timers, the
 * stopwatch, the world clocks; Réglages and the Administration are the shell's), what the place on
 * screen makes beside the search and as the pebble at the foot of a phone-sized window (« Nouvelle
 * alarme », « Nouveau minuteur », « Ajouter une ville »; nothing on the stopwatch), a form over the
 * page it was opened from, the tab's title (« Temps écoulé » while a timer rings), and the ringer that
 * rings this browser's timers on every page.
 */
import { useRef, useState, type AnimationEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { spotKey } from '@unlease/core/services/spotlight';
import { runName, timerName } from '@unlease/clock/services/timers';
import { alarmName } from '@unlease/clock/services/words';
import type { GlyphName } from '@unlease/design/glyphs';

import { useClockStore, type ClockState } from '../app/store/library';
import { useToolsStore } from '../app/store/tools';
import { Icon } from '@shared/ui/components/Icon';
import { useLeaving, usePresence } from '@shared/ui/components/presence';
import { NavGlyph, NavRow } from '@shared/ui/navigation/NavParts';
import shell from '@shared/ui/navigation/shell.module.css';
import { goBack, parseRoute, type Arrival, type Route } from '@shared/ui/router';
import { AlarmEditor } from './features/AlarmEditor';
import { openCitySearch, openNewAlarm, openNewTimer } from './features/open';
import { TimerEditor } from './features/timers/TimerEditor';
import { TimerRinger } from './features/timers/TimerRinger';
import { CitySearch } from './features/world/CitySearch';
import { HOME, paths, placeUnder } from './routes';
import { AlarmsScreen } from './screens/AlarmsScreen';
import { StopwatchScreen } from './screens/StopwatchScreen';
import { TimersScreen } from './screens/TimersScreen';
import { WorldScreen } from './screens/WorldScreen';

export function ClockScreen({ route }: { route: Route }) {
  switch (route.name) {
    case 'clock':
      return <AlarmsScreen />;
    case 'clockTimers':
      return <TimersScreen />;
    case 'clockStopwatch':
      return <StopwatchScreen />;
    case 'clockWorld':
      return <WorldScreen />;
    default:
      return null;
  }
}

/** A form lies over the page it was opened from, else over its own place. */
export function clockPageUnder(route: Route, background: string | undefined): Route | null {
  const own = placeUnder(route);
  if (!own) return null;
  return background ? parseRoute(new URL(background, location.origin).pathname) : own;
}

export function clockPathOf(route: Route): string {
  switch (route.name) {
    case 'clockAlarm':
      return paths.alarm(route.id);
    case 'clockNew':
      return paths.newAlarm;
    case 'clockTimers':
      return paths.timers;
    case 'clockTimer':
      return paths.timer(route.id);
    case 'clockTimerNew':
      return paths.newTimer;
    case 'clockStopwatch':
      return paths.stopwatch;
    case 'clockWorld':
      return paths.world;
    case 'clockCityNew':
      return paths.newCity;
    default:
      return HOME;
  }
}

/** Clock's own places, each a home of its own (the navigation's four rows). */
export const isClockPlace = (route: Route): boolean => route.name === 'clock' || route.name === 'clockTimers' || route.name === 'clockStopwatch' || route.name === 'clockWorld';

function titleFor(state: ClockState, page: Route, overlay: Route): string | null {
  switch (overlay.name) {
    case 'clockNew':
      return t('New alarm');
    case 'clockAlarm': {
      const alarm = state.alarms[overlay.id];
      return alarm && alarm.deletedAt === null ? alarmName(alarm) : null;
    }
    case 'clockTimerNew':
      return t('New timer');
    case 'clockTimer': {
      const timer = state.timers[overlay.id];
      return timer && timer.deletedAt === null ? timerName(timer) : null;
    }
    case 'clockCityNew':
      return t('Add a city');
    default:
      break;
  }
  switch (page.name) {
    case 'clockTimers':
      return t('Timers');
    case 'clockStopwatch':
      return t('Stopwatch');
    case 'clockWorld':
      return t('World clocks');
    default:
      return null;
  }
}

/** The tab names the timer that rings (« Pâtes : temps écoulé »), else the form open, else the place (« Minuteurs · Clock »); the alarms, the app alone. */
export function useClockTitle(page: Route, overlay: Route): string | null {
  const title = useClockStore(state => titleFor(state, page, overlay));
  const ringing = useToolsStore(state => {
    const rung = state.runs.filter(run => run.state === 'ringing');
    return rung.length === 1 ? t('{name}: time’s up', { name: runName(rung[0]!) }) : rung.length > 1 ? t('Time’s up') : null;
  });
  return ringing ?? title;
}

/** An alarm or a saved timer is still there to go back to (not deleted). */
export function clockStillThere(route: Route): boolean {
  const state = useClockStore.getState();
  if (route.name === 'clockAlarm') return state.alarms[route.id]?.deletedAt === null;
  if (route.name === 'clockTimer') return state.timers[route.id]?.deletedAt === null;
  return true;
}

export const clockOpened = (route: Route): string | null => (route.name === 'clockAlarm' ? spotKey('alarm', route.id) : null);

const PLACES: readonly { readonly name: Route['name']; readonly to: string; readonly label: () => string; readonly glyph: GlyphName }[] = [
  { name: 'clock', to: HOME, label: () => t('Alarms'), glyph: 'alarm' },
  { name: 'clockTimers', to: paths.timers, label: () => t('Timers'), glyph: 'timer' },
  { name: 'clockStopwatch', to: paths.stopwatch, label: () => t('Stopwatch'), glyph: 'stopwatch' },
  { name: 'clockWorld', to: paths.world, label: () => t('World clocks'), glyph: 'globe' },
];

export function ClockNav({ route, onNavigate }: { route: Route; onNavigate: () => void }) {
  return (
    <>
      {PLACES.map(place => (
        <NavRow key={place.name} to={place.to} label={place.label()} leading={<NavGlyph name={place.glyph} />} current={route.name === place.name} onNavigate={onNavigate} />
      ))}
    </>
  );
}

/** What the place on screen makes: an alarm, a timer, a city; nothing on the stopwatch. */
function makerOf(route: Route): { readonly label: string; readonly tip: string; readonly run: () => void } | null {
  switch (route.name) {
    case 'clock':
      return { label: t('New alarm'), tip: t('New alarm (C)'), run: () => openNewAlarm() };
    case 'clockTimers':
      return { label: t('New timer'), tip: t('New timer'), run: openNewTimer };
    case 'clockWorld':
      return { label: t('Add a city'), tip: t('Add a city'), run: openCitySearch };
    default:
      return null;
  }
}

/** What the place makes, beside the search, wide. */
export function ClockHeaderActions({ route }: { route: Route }) {
  const maker = makerOf(route);
  if (!maker) return null;
  return (
    <button type="button" className={`${shell.classify} paper`} onClick={maker.run} aria-label={maker.label} data-tip={maker.tip}>
      <Icon name="plus" size={20} />
      <span className={shell.classifyLabel}>{maker.label}</span>
    </button>
  );
}

/** Its slide away (`--duration-short`), and a little longer for the fallback that lets it go. */
const BAR_EXIT_MS = 200;

/** A phone-sized window's bar on a place that makes something: its pebble makes it. Mounted with its page: `enter` is how that page came. */
export function ClockBottomBar({ route, enter }: { route: Route; enter: Arrival | null }) {
  const maker = makerOf(route);
  const { present, closing, done } = usePresence(maker !== null, BAR_EXIT_MS);
  const [arrival] = useState(enter);
  // The last place that made something: its pebble stays while the bar leaves.
  const [kept, setKept] = useState(maker);
  if (maker && maker.label !== kept?.label) setKept(maker);
  const fab = useRef<HTMLButtonElement>(null);
  const shown = maker ?? kept;
  if (!present || !shown) return null;
  const gone = (event: AnimationEvent<HTMLDivElement>): void => {
    if (closing && event.target === event.currentTarget) done();
  };
  return (
    <div className={`${shell.bottomBar} paper`} data-enter={(!closing && arrival) || undefined} data-closing={closing || undefined} inert={closing} onAnimationEnd={gone}>
      <div className={shell.bottomActions} />
      <button ref={fab} type="button" className={shell.fab} data-pebble-under={0} aria-label={shown.label} onClick={shown.run}>
        <Icon name="plus" size={26} />
      </button>
    </div>
  );
}

/** A dialog's exit (`Layer`'s), with room to spare. */
const EDITOR_EXIT_MS = 340;

/** A new alarm's or timer's form, told apart from an id. */
const NEW = '\u0000new';

/** The form open over the page under it (an alarm's, a timer's, the city search), kept while it leaves; and the timers' ringer, always. */
export function ClockOverlays({ route, pagePath }: { route: Route; pagePath: string }) {
  const alarm = useLeaving(route.name === 'clockAlarm' ? route.id : route.name === 'clockNew' ? NEW : null, EDITOR_EXIT_MS);
  const timer = useLeaving(route.name === 'clockTimer' ? route.id : route.name === 'clockTimerNew' ? NEW : null, EDITOR_EXIT_MS);
  const city = useLeaving(route.name === 'clockCityNew' ? NEW : null, EDITOR_EXIT_MS);
  const close = (): void => goBack(pagePath);
  return (
    <>
      <TimerRinger />
      {alarm.value !== null ? <AlarmEditor key={alarm.value} id={alarm.value === NEW ? null : alarm.value} closing={alarm.leaving} under={pagePath} onClose={close} /> : null}
      {timer.value !== null ? <TimerEditor key={timer.value} id={timer.value === NEW ? null : timer.value} closing={timer.leaving} under={pagePath} onClose={close} /> : null}
      {city.value !== null ? <CitySearch closing={city.leaving} onClose={close} /> : null}
    </>
  );
}
