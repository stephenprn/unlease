/**
 * « Minuteurs » on the web (the phone's `TimersTab`): what runs first, each timer on its card
 * (`RunCard`), a ringing one leading; then the quickest way to start one, the lengths started lately
 * (or the usual ones) as chips, one click each, an instant timer that is gone once it has rung; then
 * the saved timers (`SavedTimerCard`), shortest first, each started from its pebble, opened from its
 * card. « Nouveau minuteur » (the header, the pebble) opens a new timer's form. Under them, honestly:
 * a timer started here rings only while this page is open. The time left ticks while one runs.
 */
import { useMemo } from 'react';

import { t } from '@unlease/core/i18n';
import { byLength, type Timer } from '@unlease/clock/models/timer';
import { lengthSentence, quickLengths } from '@unlease/clock/services/timers';

import { EmptyLine } from '@shared/ui/components/EmptyLine';
import { Icon } from '@shared/ui/components/Icon';
import { useTick } from '../../app/hooks/useTick';
import { useClockStore } from '../../app/store/library';
import { usePrefsStore } from '../../app/store/prefs';
import { shownRun, startTimer, useToolsStore } from '../../app/store/tools';
import styles from '../clock.module.css';
import home from '../features/home/home.module.css';
import { openNewTimer, openTimer } from '../features/open';
import { RunCard } from '../features/timers/RunCard';
import { SavedTimerCard } from '../features/timers/SavedTimerCard';
import tools from '../features/tools.module.css';
import { LengthFigure } from '../features/timers/LengthFigure';

const start = (timer: Timer): void => {
  startTimer({ seconds: timer.seconds, timer });
};

export function TimersScreen() {
  const twelveHours = usePrefsStore(s => s.twelveHours);
  const stored = useToolsStore(s => s.runs);
  const recent = useToolsStore(s => s.recent);
  const timers = useClockStore(s => s.timers);
  const counting = stored.some(run => run.state !== 'paused');
  // A few times a second: each second turns when it has gone, whenever the timer started.
  const now = useTick(250, counting);
  // Ringing first (it asks for an answer), then by when each started.
  const runs = useMemo(() => stored.map(run => shownRun(run, now)).sort((a, b) => Number(b.state === 'ringing') - Number(a.state === 'ringing') || a.startedAt - b.startedAt), [stored, now]);
  const saved = useMemo(() => Object.values(timers).filter(timer => timer.deletedAt === null).sort(byLength), [timers]);
  const quick = useMemo(() => quickLengths(recent), [recent]);
  const runningOf = (id: string): number => stored.filter(run => run.timerId === id).length;

  return (
    <div className={styles.screen}>
      <h1 className="sr-only">{t('Timers')}</h1>
      {runs.length > 0 ? (
        <section className={tools.runs} aria-label={t('Under way')}>
          {runs.map(run => (
            <RunCard key={run.id} run={run} now={now} twelveHours={twelveHours} />
          ))}
        </section>
      ) : null}

      {/* The lengths to start in a click need no title: they say what they are. */}
      <div className={tools.chips} role="group" aria-label={t('Quick start')}>
        {quick.map(length => (
          <button key={length} type="button" className={`${tools.chip} paper`} aria-label={t('Start a {length} timer', { length: lengthSentence(length) })} onClick={() => startTimer({ seconds: length })}>
            <LengthFigure seconds={length} size={22} />
          </button>
        ))}
      </div>

      {saved.length > 0 ? <h2 className={`${home.section} t-section`}>{t('Saved timers')}</h2> : null}
      {saved.length > 0 ? (
        <ul className={styles.list} aria-label={t('Saved timers')}>
          {saved.map(timer => (
            <SavedTimerCard key={timer.id} timer={timer} running={runningOf(timer.id)} onOpen={openTimer} onStart={start} />
          ))}
        </ul>
      ) : (
        <EmptyLine glyph="timer" text={t('Save the ones you start again and again from “New timer”: pasta, tea, eggs… each with its label.')} action={{ label: t('New timer'), onClick: openNewTimer }} />
      )}

      <p className={`${styles.where} t-meta`}>
        <Icon name="info" size={16} />
        <span>{t('A timer started here rings only while this page is open. Saved timers are on your phones too.')}</span>
      </p>
    </div>
  );
}
