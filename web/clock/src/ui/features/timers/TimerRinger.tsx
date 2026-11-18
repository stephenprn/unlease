/**
 * The timers of this browser, kept on time and rung in the tab while Clock is open on any of its
 * pages: the moment the next one ends, it rings (`ringDueTimers`), everywhere it is shown. A timer
 * ringing plays its sound over and over (`ringTimer`), shakes a phone that can, and, when the tab is
 * not in front, shows a notification if the browser allows it (a click brings the timers forward);
 * the tab's title says it too (`useClockTitle`). The sound stops after `RING_MS`, as a phone's would,
 * and a timer that ended long ago (the page was closed) says so quietly. Draws nothing.
 */
import { useEffect, useRef } from 'react';

import { t } from '@unlease/core/i18n';
import { type TimerRun } from '@unlease/clock/models/timer';
import { SILENT } from '@unlease/clock/services/sounds';
import { runName } from '@unlease/clock/services/timers';

import { navigate } from '@shared/ui/router';
import { useTick } from '../../../app/hooks/useTick';
import { ringTimer, stopRinging } from '../../../app/sounds';
import { followTools, ringDueTimers, useToolsStore } from '../../../app/store/tools';
import { paths } from '../../routes';

/** How long a timer rings out loud once it has ended. */
export const RING_MS = 5 * 60_000;

/** Its shaking, where the device can: three pulses. */
const VIBRATION = [400, 200, 400, 200, 400];

/** Whether it still rings out loud at `now`. */
const loud = (run: TimerRun, now: number): boolean => run.state === 'ringing' && now - run.endsAt < RING_MS;

function notify(run: TimerRun): Notification | null {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;
  try {
    const icon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href;
    const notice = new Notification(runName(run), { body: t('Time’s up'), tag: `timer-${run.id}`, requireInteraction: true, ...(icon ? { icon } : {}) });
    notice.onclick = () => {
      window.focus();
      navigate(paths.timers);
      notice.close();
    };
    return notice;
  } catch {
    // A browser that shows notifications only from a service worker (Chrome on Android): the tab says it.
    return null;
  }
}

export function TimerRinger() {
  const runs = useToolsStore(s => s.runs);
  const ringing = runs.filter(run => run.state === 'ringing');
  // Each second while one rings: its sound stops when its time is up.
  const now = useTick(1000, ringing.length > 0);
  const notices = useRef(new Map<string, Notification | null>());

  useEffect(() => followTools(), []);

  // The next end, to the moment: one timeout (a hidden tab keeps it nearly on time), again whenever the runs change.
  const next = Math.min(...runs.filter(run => run.state === 'running').map(run => run.endsAt));
  useEffect(() => {
    if (!Number.isFinite(next)) return undefined;
    const timer = setTimeout(() => ringDueTimers(), Math.min(Math.max(0, next - Date.now()) + 10, 2_147_483_647));
    const onVisible = (): void => {
      ringDueTimers();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [next]);

  // The first that rings out loud with a sound plays it; none, silence.
  const sound = ringing.find(run => loud(run, now) && run.sound !== SILENT)?.sound ?? null;
  useEffect(() => {
    if (sound === null) stopRinging();
    else void ringTimer(sound);
  }, [sound]);
  useEffect(() => stopRinging, []);

  // Each new ring once: a notification away from the tab, a shake where the device can.
  const ringingIds = ringing.map(run => run.id).join(' ');
  useEffect(() => {
    const at = Date.now();
    const shown = notices.current;
    for (const run of useToolsStore.getState().runs) {
      if (run.state !== 'ringing' || shown.has(run.id)) continue;
      const fresh = loud(run, at);
      shown.set(run.id, fresh && (document.visibilityState !== 'visible' || !document.hasFocus()) ? notify(run) : null);
      if (fresh && run.vibrate) {
        try {
          navigator.vibrate?.(VIBRATION);
        } catch {
          // No vibration here.
        }
      }
    }
    // Stopped, given a minute more or deleted (here or in another tab): its notification goes.
    for (const [id, notice] of shown) {
      if (ringingIds.split(' ').includes(id)) continue;
      notice?.close();
      shown.delete(id);
    }
  }, [ringingIds]);
  useEffect(
    () => () => {
      for (const notice of notices.current.values()) notice?.close();
    },
    [],
  );

  return null;
}
