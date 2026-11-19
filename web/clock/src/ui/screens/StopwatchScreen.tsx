/**
 * « Chronomètre » on the web (the phone's `StopwatchTab`): the time large (minutes and seconds, the
 * hundredths at half that in the second ink, all in tabular figures so nothing shifts as they turn),
 * the lap under way under it; two large buttons, « Tour » (running) or « Réinitialiser » (paused),
 * and « Démarrer », « Pause » or « Reprendre »; then the laps, newest first, each its own time and the
 * whole time at its end, the fastest and the slowest named once there are three. Space starts and
 * pauses it, L takes a lap (`stopwatchKey`). This browser keeps it: it counts on across a reload.
 */
import { useMemo, useState } from 'react';

import { getLocale, t, tc } from '@unlease/core/i18n';
import { currentLap, elapsed, isReset, isRunning, lapRows, type LapRow } from '@unlease/clock/models/stopwatch';
import { stopwatchClock, stopwatchParts, stopwatchSentence } from '@unlease/clock/services/timers';

import { Button } from '@shared/ui/components/Button';
import { isEditable } from '@shared/ui/dom';
import { useFrameTime } from '../../app/hooks/useTick';
import { lapStopwatch, pauseStopwatch, resetStopwatch, startStopwatch, useToolsStore } from '../../app/store/tools';
import styles from '../clock.module.css';
import { StopwatchDial } from '../features/stopwatch/StopwatchDial';
import tools from '../features/tools.module.css';

/** The stopwatch's keys, on its page with no field or control in hand: Space starts or pauses it, L takes a lap. True when taken. */
export function stopwatchKey(event: KeyboardEvent): boolean {
  const target = event.target;
  // A control in hand answers Space itself (a button presses).
  if (isEditable(target) || (target instanceof HTMLElement && target.closest('button, a, [role="button"], [role="switch"], [role="slider"]'))) return false;
  const watch = useToolsStore.getState().stopwatch;
  if (event.key === ' ') {
    if (isRunning(watch)) pauseStopwatch();
    else startStopwatch();
    return true;
  }
  if (event.key.toLowerCase() === 'l' && isRunning(watch)) {
    lapStopwatch();
    return true;
  }
  return false;
}

function LapLine({ row, fresh, longest }: { row: LapRow; fresh: boolean; longest: number }) {
  const tag = row.fastest ? t('Fastest') : row.slowest ? t('Slowest') : '';
  return (
    <li className={tools.lap} data-fresh={fresh || undefined}>
      <span className={tools.lapName}>
        <span className="t-label">{t('Lap {number}', { number: row.number })}</span>
        {/* Its length against the longest lap: the laps compared at a glance. */}
        <span className={tools.lapBar} data-tag={row.fastest ? 'fastest' : row.slowest ? 'slowest' : undefined} style={{ ['--share' as string]: `${Math.max(4, Math.round((row.lap / Math.max(1, longest)) * 100))}%` }} aria-hidden="true" />
        {tag ? (
          <span className={`${tools.lapTag} t-meta-strong`} data-tag={row.fastest ? 'fastest' : 'slowest'}>
            {tag}
          </span>
        ) : null}
      </span>
      <span className={tools.lapTime}>{stopwatchClock(row.lap)}</span>
      <span className={`${tools.lapSplit} t-meta`}>{stopwatchClock(row.split)}</span>
    </li>
  );
}

export function StopwatchScreen() {
  const watch = useToolsStore(s => s.stopwatch);
  const running = isRunning(watch);
  const reset = isReset(watch);
  const now = useFrameTime(running);
  const total = elapsed(watch, now);
  const [main, hundredths] = stopwatchParts(total);
  const rows = useMemo(() => lapRows(watch), [watch]);
  const lap = currentLap(watch, now);
  const longest = useMemo(() => rows.reduce((most, row) => Math.max(most, row.lap), 0), [rows]);
  // The laps there as the page opened stay still; one taken here slides in.
  const [seen] = useState(watch.laps.length);

  return (
    <div className={`${styles.screen} ${tools.watchScreen}`}>
      <h1 className="sr-only">{t('Stopwatch')}</h1>
      <div className={tools.face} role="timer" aria-label={reset ? t('Stopwatch at zero') : stopwatchSentence(total)}>
        <StopwatchDial watch={watch} now={now}>
        <p className={tools.figure} aria-hidden="true" data-held={(!running && !reset) || undefined}>
          <span className={tools.figureMain}>{main}</span>
          <span className={tools.figureHundredths}>{`${getLocale() === 'fr' ? ',' : '.'}${hundredths}`}</span>
        </p>
        <p className={`${tools.lapNow} t-body-strong`} aria-hidden="true">
          {watch.laps.length > 0 ? `${t('Lap {number}', { number: watch.laps.length + 1 })} · ${stopwatchClock(lap)}` : '\u00A0'}
        </p>
        </StopwatchDial>
      </div>

      <div className={tools.watchActions}>
        {running ? (
          <Button kind="tonal" icon="flag" stretch onClick={() => lapStopwatch()}>
            {t('Lap')}
          </Button>
        ) : reset ? null : (
          <Button kind="tonal" icon="restore" stretch onClick={resetStopwatch}>
            {t('Reset')}
          </Button>
        )}
        {running ? (
          <Button icon="pause" stretch onClick={() => pauseStopwatch()}>
            {t('Pause')}
          </Button>
        ) : (
          <Button icon="go" stretch onClick={() => startStopwatch()}>
            {reset ? tc('timer', 'Start') : t('Resume')}
          </Button>
        )}
      </div>

      {rows.length > 0 ? (
        <ol className={tools.laps} aria-label={t('Laps')}>
          {rows.map(row => (
            <LapLine key={row.number} row={row} fresh={row.number > seen} longest={longest} />
          ))}
        </ol>
      ) : null}
    </div>
  );
}
