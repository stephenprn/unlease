/**
 * A timer that runs in this browser, on its paper panel (the phone's `RunCard`): its name and when it
 * ends (« Fin à 14:32 », « En pause »), the time left large in tabular figures (the second ink while
 * paused), a track filling in the primary as it goes, then its actions at the end of the row:
 * « Réinitialiser » (paused, once it has gone), « +1 min » (tonal), « Pause » or « Reprendre »
 * (filled). Ringing, its edge turns to the accent, it says « Temps écoulé » and counts the time since
 * its end (« −0:12 ») in the accent, with « +1 min » and « Arrêter ». × at its head deletes it.
 */
import { memo } from 'react';

import { t } from '@unlease/core/i18n';
import { clockWords } from '@unlease/calendar/services/eventText';
import { instantToWall } from '@unlease/calendar/services/time';
import { overtime, progress, remaining, type TimerRun } from '@unlease/clock/models/timer';
import { countdownClock, lengthSentence, lengthWords, overtimeClock } from '@unlease/clock/services/timers';

import { Button } from '@shared/ui/components/Button';
import { IconButton } from '@shared/ui/components/IconButton';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { actOnTimer } from '../../../app/store/tools';
import tools from '../tools.module.css';

function RunCardComponent({ run, now, twelveHours }: { run: TimerRun; now: number; twelveHours: boolean }) {
  const ringing = run.state === 'ringing';
  const paused = run.state === 'paused';
  const left = remaining(run, now);
  // Its label, else what it was set for (« 5 min »): never « Minuteur de 5 min » under the timers' own name.
  const name = run.label.trim() || lengthWords(run.length / 1000);
  const time = ringing ? overtimeClock(overtime(run, now)) : countdownClock(left);
  const ends = clockWords(instantToWall(run.endsAt, '').slice(11, 16), twelveHours);
  const meta = ringing ? t('Time’s up') : paused ? t('Paused') : t('Ends at {time}', { time: ends });
  return (
    <OutlinedBox kind="panel" lift="card" className={`${tools.run} paper`} data-state={run.state} role="group" aria-label={name}>
      <div className={tools.runHead}>
        <div className={tools.runWords}>
          <p className={`${tools.ellipsis} t-body-strong`}>{name}</p>
          <p className={`${tools.runMeta} ${tools.ellipsis} t-meta`}>{meta}</p>
        </div>
        {ringing ? null : <IconButton icon="close" label={t('Delete the timer')} onClick={() => actOnTimer(run.id, 'delete')} />}
      </div>
      {/* The time read whole, not each second: a screen reader hears it when asked, and the ring at once. */}
      <p className={tools.runTime} aria-hidden="true">
        {time}
      </p>
      <p className="sr-only" aria-live={ringing ? 'assertive' : 'off'}>
        {ringing ? t('{name}: time’s up', { name }) : t('{name}: {left} left', { name, left: lengthSentence(Math.ceil(left / 1000)) })}
      </p>
      <div className={tools.track} aria-hidden="true">
        <div className={tools.fill} style={{ transform: `scaleX(${ringing ? 1 : progress(run, now)})` }} />
      </div>
      <div className={tools.runActions}>
        {ringing ? (
          <>
            <Button kind="tonal" onClick={() => actOnTimer(run.id, 'add')} title={t('One more minute')}>
              {t('+1 min')}
            </Button>
            <Button icon="stop" onClick={() => actOnTimer(run.id, 'stop')}>
              {t('Stop')}
            </Button>
          </>
        ) : (
          <>
            {paused && left < run.total ? (
              <Button kind="text" icon="restore" className={tools.resetAction} onClick={() => actOnTimer(run.id, 'reset')}>
                {t('Reset')}
              </Button>
            ) : null}
            <Button kind="tonal" onClick={() => actOnTimer(run.id, 'add')} title={t('One more minute')}>
              {t('+1 min')}
            </Button>
            <Button icon={paused ? 'go' : 'pause'} onClick={() => actOnTimer(run.id, paused ? 'resume' : 'pause')}>
              {paused ? t('Resume') : t('Pause')}
            </Button>
          </>
        )}
      </div>
    </OutlinedBox>
  );
}

export const RunCard = memo(RunCardComponent);
