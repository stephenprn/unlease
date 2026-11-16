/**
 * Clock's places as the shell draws them, and its frame: the navigation (the alarms; Réglages and
 * the Administration are the shell's), « Créer une alarme » beside the search and as the pebble at
 * the foot of a phone-sized list, an alarm's form over the page it was opened from, the tab's title.
 */
import { useRef, useState, type AnimationEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { spotKey } from '@unlease/core/services/spotlight';
import { alarmName } from '@unlease/clock/services/words';

import { useClockStore, type ClockState } from '../app/store/library';
import { Icon } from '@shared/ui/components/Icon';
import { useLeaving, usePresence } from '@shared/ui/components/presence';
import { NavGlyph, NavRow } from '@shared/ui/navigation/NavParts';
import shell from '@shared/ui/navigation/shell.module.css';
import { goBack, parseRoute, type Arrival, type Route } from '@shared/ui/router';
import { AlarmEditor } from './features/AlarmEditor';
import { openNewAlarm } from './features/open';
import { HOME, paths } from './routes';
import { AlarmsScreen } from './screens/AlarmsScreen';

export function ClockScreen({ route }: { route: Route }) {
  return route.name === 'clock' ? <AlarmsScreen /> : null;
}

/** An alarm's form lies over the page it was opened from, else over the alarms. */
export function clockPageUnder(route: Route, background: string | undefined): Route | null {
  if (route.name !== 'clockAlarm' && route.name !== 'clockNew') return null;
  return background ? parseRoute(new URL(background, location.origin).pathname) : { name: 'clock' };
}

export function clockPathOf(route: Route): string {
  switch (route.name) {
    case 'clockAlarm':
      return paths.alarm(route.id);
    case 'clockNew':
      return paths.newAlarm;
    default:
      return HOME;
  }
}

function titleFor(state: ClockState, overlay: Route): string | null {
  if (overlay.name === 'clockNew') return t('New alarm');
  if (overlay.name !== 'clockAlarm') return null;
  const alarm = state.alarms[overlay.id];
  return alarm && alarm.deletedAt === null ? alarmName(alarm) : null;
}

/** The tab names the form open (« Train pour Lyon · Clock »), else the app alone. */
export const useClockTitle = (overlay: Route): string | null => useClockStore(state => titleFor(state, overlay));

/** An alarm is still there to go back to (not deleted). */
export function clockStillThere(route: Route): boolean {
  if (route.name !== 'clockAlarm') return true;
  const alarm = useClockStore.getState().alarms[route.id];
  return !!alarm && alarm.deletedAt === null;
}

export const clockOpened = (route: Route): string | null => (route.name === 'clockAlarm' ? spotKey('alarm', route.id) : null);

export function ClockNav({ route, onNavigate }: { route: Route; onNavigate: () => void }) {
  return <NavRow to={HOME} label={t('Alarms')} leading={<NavGlyph name="clock" />} current={route.name === 'clock'} onNavigate={onNavigate} />;
}

/** « Créer une alarme » beside the search, wide. */
export function ClockHeaderActions({ route }: { route: Route }) {
  if (route.name !== 'clock') return null;
  return (
    <button type="button" className={`${shell.classify} paper`} onClick={() => openNewAlarm()} aria-label={t('New alarm')} data-tip={t('New alarm (C)')}>
      <Icon name="plus" size={20} />
      <span className={shell.classifyLabel}>{t('New alarm')}</span>
    </button>
  );
}

/** Its slide away (`--duration-short`), and a little longer for the fallback that lets it go. */
const BAR_EXIT_MS = 200;

/** A phone-sized window's bar on the alarms: its pebble makes one. Mounted with its page: `enter` is how that page came. */
export function ClockBottomBar({ route, enter }: { route: Route; enter: Arrival | null }) {
  const { present, closing, done } = usePresence(route.name === 'clock', BAR_EXIT_MS);
  const [arrival] = useState(enter);
  const fab = useRef<HTMLButtonElement>(null);
  if (!present) return null;
  const gone = (event: AnimationEvent<HTMLDivElement>): void => {
    if (closing && event.target === event.currentTarget) done();
  };
  return (
    <div className={`${shell.bottomBar} paper`} data-enter={(!closing && arrival) || undefined} data-closing={closing || undefined} inert={closing} onAnimationEnd={gone}>
      <div className={shell.bottomActions} />
      <button ref={fab} type="button" className={shell.fab} data-pebble-under={0} aria-label={t('New alarm')} onClick={() => openNewAlarm()}>
        <Icon name="plus" size={26} />
      </button>
    </div>
  );
}

/** A dialog's exit (`Layer`'s), with room to spare. */
const EDITOR_EXIT_MS = 340;

/** A new alarm's form, told apart from an alarm's id. */
const NEW = '\u0000new';

/** An alarm's form over the page under it, kept while it leaves. */
export function ClockOverlays({ route, pagePath }: { route: Route; pagePath: string }) {
  const editing = useLeaving(route.name === 'clockAlarm' ? route.id : route.name === 'clockNew' ? NEW : null, EDITOR_EXIT_MS);
  if (editing.value === null) return null;
  return <AlarmEditor key={editing.value} id={editing.value === NEW ? null : editing.value} closing={editing.leaving} under={pagePath} onClose={() => goBack(pagePath)} />;
}
