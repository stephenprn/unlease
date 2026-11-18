/**
 * The chosen morning (the phone's twin, `mobile/clock/src/ui/features/home/MorningPanel.tsx`): its
 * day and how long until it rings, the time large, the alarm's name and « Ignorer cette fois » (its next
 * ring), the alarms kept quiet that day and « Sonner quand même »; then the day's first event from
 * Agenda, how far it stands from the alarm and « Voir la journée »; and when it comes too soon (or
 * before the alarm), a row in Safran with « Sonner à 7:00 ». A morning chosen slides in from the side
 * of its day (250, decelerate); with less motion asked, it fades.
 */
import { memo, useRef } from 'react';

import { t } from '@unlease/core/i18n';
import { clockWords } from '@unlease/calendar/services/eventText';
import { spanWords } from '@unlease/calendar/services/today';
import { instantToDay, instantToWall } from '@unlease/calendar/services/time';
import { earlierTime } from '@unlease/clock/services/morning';
import { nextRing } from '@unlease/clock/services/schedule';
import { stillToRing, type Morning } from '@unlease/clock/services/week';
import { alarmClock, alarmName, offDayWords, ringDayWords, untilWords } from '@unlease/clock/services/words';

import { useServerRuns } from '@shared/app/apps';
import { dayPlace } from '@shared/app/suitePlaces';
import { navigate } from '@shared/ui/router';
import { Button } from '@shared/ui/components/Button';
import { Icon } from '@shared/ui/components/Icon';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { ringEarlier, skipNext, stopSkipping } from '../../../app/store/actions';
import { openAlarm, openNewAlarm } from '../open';
import styles from './home.module.css';

interface Props {
  readonly morning: Morning;
  readonly now: number;
  /** -1 when the morning chosen lies before the last one, 1 after: the side it comes in from. */
  readonly from: -1 | 0 | 1;
  readonly margin: number;
  readonly twelveHours: boolean;
}

/** « 15 min après le réveil », « À l’heure du réveil », « 30 min avant le réveil ». */
function distanceWords(minutes: number): string {
  if (minutes === 0) return t('As the alarm rings');
  return minutes > 0 ? t('{span} after the alarm', { span: spanWords(minutes) }) : t('{span} before the alarm', { span: spanWords(-minutes) });
}

/**
 * The button pressed leaves as the morning changes (« Ignorer cette fois » becomes « Sonner quand
 * même », « Sonner à 07:20 » goes once the alarm moves): the keyboard's focus goes to what took its
 * place (`selector`), else the time, never back to the window's start.
 */
function refocus(panel: HTMLElement | null, selector: string): void {
  requestAnimationFrame(() => {
    const focused = document.activeElement;
    if (!panel || (focused && focused !== document.body && focused.isConnected)) return;
    (panel.querySelector<HTMLElement>(selector) ?? panel.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true });
  });
}

export const MorningPanel = memo(function MorningPanel({ morning, now, from, margin, twelveHours }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const today = instantToDay(now);
  const waking = morning.waking;
  const toCome = stillToRing(morning, now);
  const skippable = waking !== null && toCome && waking.alarm.days.length > 0 && nextRing(waking.alarm, now)?.day === morning.day;
  const first = morning.first;
  // « Voir la journée » only where the server runs Agenda.
  const agendaRuns = useServerRuns('calendar');
  const clockOf = (at: number): string => clockWords(instantToWall(at, '').slice(11, 16), twelveHours);
  const fix = morning.clash ? earlierTime(morning.clash, margin) : null;
  const canFix = fix !== null && morning.wakeup !== null && fix.at > now && fix.at < morning.wakeup.at;
  const head = [ringDayWords(morning.day, today), waking && toCome ? untilWords(waking.at, now).toLocaleLowerCase() : waking ? t('rang at {time}', { time: alarmClock(waking.alarm.time, twelveHours) }) : ''].filter(Boolean).join(' · ');

  return (
    <OutlinedBox kind="panel" lift="card" className={`${styles.panel} paper`}>
      <div ref={box} key={morning.day} className={styles.morning} data-from={from > 0 ? 'after' : from < 0 ? 'before' : undefined} aria-live="polite">
        <p className={`${styles.head} t-meta`}>{head}</p>
        {waking ? (
          <>
            <button type="button" className={styles.bigTime} data-past={toCome ? undefined : ''} onClick={() => openAlarm(waking.alarm.id)} aria-label={t('Edit the alarm at {time}', { time: alarmClock(waking.alarm.time, twelveHours) })}>
              {alarmClock(waking.alarm.time, twelveHours)}
            </button>
            <div className={styles.nameRow} data-skip-row="">
              <span className={`${styles.grow} t-body-strong`}>{waking.alarm.label.trim() ? alarmName(waking.alarm) : ''}</span>
              {skippable ? (
                <Button
                  kind="text"
                  small
                  onClick={() => {
                    skipNext(waking.alarm.id);
                    refocus(box.current, `[data-skipped="${waking.alarm.id}"] button`);
                  }}
                >
                  {t('Skip this time')}
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          // A morning with an alarm's anatomy: the time's place blank (as the strip's dash says it), then « Pas
          // d'alarme » and the way to set one, so switching an alarm on moves nothing.
          <>
            <span className={styles.blankTime} aria-hidden="true">
              --:--
            </span>
            <div className={styles.nameRow}>
              <span className={`${styles.grow} ${styles.none} t-body-strong`}>{t('No alarm')}</span>
              <Button kind="text" small icon="plus" onClick={() => openNewAlarm({ date: morning.day })}>
                {t('Set an alarm')}
              </Button>
            </div>
          </>
        )}
        {morning.skipped.map(alarm => (
          <div key={alarm.id} className={styles.nameRow} data-skipped={alarm.id}>
            <span className={`${styles.grow} ${styles.skipped} t-meta`}>{t('{alarm} at {time} skipped this morning', { alarm: alarmName(alarm), time: alarmClock(alarm.time, twelveHours) })}</span>
            <Button
              kind="text"
              small
              onClick={() => {
                stopSkipping(alarm.id);
                refocus(box.current, '[data-skip-row] button');
              }}
            >
              {t('Ring after all')}
            </Button>
          </div>
        ))}
        {/* A public holiday or a day off (Agenda's) keeps the alarms that ask for it quiet: said, never hidden. */}
        {morning.offDay?.alarms.map(alarm => (
          <div key={`off:${alarm.id}`} className={styles.nameRow}>
            <span className={`${styles.grow} ${styles.skipped} t-meta`}>{offDayWords(alarm, morning.offDay!.reason, twelveHours)}</span>
          </div>
        ))}

        <hr className={styles.rule} />

        <div className={styles.event}>
          <Icon name="today" size={24} />
          <div className={styles.grow}>
            {first ? (
              <>
                <p className="t-body-strong">{`${clockOf(first.startAt)} · ${first.event.title.trim() || t('Untitled')}`}</p>
                <p className="t-meta">{waking && toCome ? distanceWords(Math.round((first.startAt - waking.at) / 60_000)) : morning.day === today ? t('Next in your calendar today') : t('The day’s first event')}</p>
              </>
            ) : morning.allDay.length > 0 ? (
              <>
                <p className={`${styles.line} t-body-strong`}>{morning.allDay.map(item => item.event.title.trim() || t('Untitled')).join(', ')}</p>
                <p className="t-meta">{t('All day')}</p>
              </>
            ) : (
              <p className={`${styles.quiet} t-body`}>{morning.later ? t('Nothing in your calendar after this alarm.') : morning.day === today && morning.events > 0 ? t('Nothing left in your calendar today.') : t('Nothing in your calendar that day.')}</p>
            )}
          </div>
          {agendaRuns ? (
            <Button kind="text" small onClick={() => navigate(dayPlace(morning.day))}>
              {t('View the day')}
            </Button>
          ) : null}
        </div>

        {morning.clash && morning.wakeup ? (
          <div className={styles.clash}>
            <Icon name="alert" size={20} />
            <p className={`${styles.grow} t-meta`}>{morning.clash.minutes < 0 ? t('It starts before your alarm.') : t('Less than {span} to get ready.', { span: spanWords(margin) })}</p>
            {canFix ? (
              <Button
                kind="tonal"
                onClick={() => {
                  ringEarlier(morning.wakeup!.alarm.id, fix!.day, fix!.time);
                  refocus(box.current, 'button');
                }}
              >
                {t('Ring at {time}', { time: clockWords(fix!.time, twelveHours) })}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </OutlinedBox>
  );
});
