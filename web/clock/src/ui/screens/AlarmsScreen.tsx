/**
 * Clock's home on the web: the week of mornings (the phone's twin). Seven days from today across the
 * top (`WeekStrip`), the chosen morning opened below (`MorningPanel`: the time, how long until then, the
 * day's first event from Agenda, a clash and its fix), then the alarms by time of day, each its time,
 * its days and its label, its switch at its end, a press opening its form. It opens on the next
 * alarm's morning. The header's search narrows the alarms by label or time (the week steps aside).
 * Under them, where they ring: on the phones with Clock for Android, never in the browser. With none,
 * the empty place says what goes here and how to make one (C).
 */
import { memo, useMemo, useState } from 'react';

import { APPS } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { foldText } from '@unlease/core/services/search';
import type { Alarm } from '@unlease/clock/models/alarm';
import { isOn } from '@unlease/clock/services/schedule';
import { timeSpellings } from '@unlease/clock/services/spotlight';
import { alarmClock, alarmName, daysWords, setWords } from '@unlease/clock/services/words';
import { chosenMorning, weekOfMornings } from '@unlease/clock/services/week';
import { instantToDay } from '@unlease/calendar/services/time';

import { useMinute } from '@shared/app/hooks/useMinute';
import { useQuery } from '@shared/app/store/search';
import { showSnack } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { Switch } from '@shared/ui/components/Checkbox';
import { EmptyLine } from '@shared/ui/components/EmptyLine';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { Icon } from '@shared/ui/components/Icon';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { useLiveAlarms } from '../../app/hooks/useAlarms';
import { switchAlarm } from '../../app/store/actions';
import { useAgendaStore } from '../../app/store/agenda';
import { useClockStore } from '../../app/store/library';
import { usePrefsStore } from '../../app/store/prefs';
import styles from '../clock.module.css';
import home from '../features/home/home.module.css';
import { MorningPanel } from '../features/home/MorningPanel';
import { WeekStrip } from '../features/home/WeekStrip';
import { openAlarm, openNewAlarm } from '../features/open';

const AlarmRow = memo(function AlarmRow({ alarm, now, twelveHours, weekStart }: { alarm: Alarm; now: number; twelveHours: boolean; weekStart: number }) {
  const on = isOn(alarm, now);
  const time = alarmClock(alarm.time, twelveHours);
  const name = alarm.label.trim() ? alarmName(alarm) : '';
  const days = daysWords(alarm, now, weekStart);
  // Switched on, the slip says when it rings, as the phone's does.
  const toggle = (next: boolean): void => {
    const at = Date.now();
    switchAlarm(alarm.id, next, at);
    const switched = next ? useClockStore.getState().alarms[alarm.id] : undefined;
    const set = switched ? setWords(switched, at) : null;
    if (set) showSnack(set, undefined, { tone: 'success' });
  };
  return (
    <li>
      {/* A card each, as the phone's: the time, its name over its days, its switch. */}
      <OutlinedBox kind="card" lift="card" className={`${styles.row} paper`} data-off={on ? undefined : ''}>
        <button type="button" className={styles.rowOpen} onClick={() => openAlarm(alarm.id)} aria-label={t('Edit the alarm at {time}', { time })}>
          <span className={`${styles.rowTime} t-display`}>{time}</span>
          <span className={styles.rowWords}>
            {name ? <span className={`${styles.rowName} t-body-strong`}>{name}</span> : null}
            <span className={`${styles.rowDays} t-meta`}>{days}</span>
          </span>
        </button>
        <Switch checked={on} onChange={toggle} label={t('Alarm at {time}', { time })} />
      </OutlinedBox>
    </li>
  );
});

/** Whether an alarm answers what the search holds: its label, or its time as typed. */
function answers(alarm: Alarm, query: string): boolean {
  const folded = foldText(query.trim());
  if (!folded) return true;
  return foldText(`${alarm.label} ${timeSpellings(alarm.time)}`).includes(folded);
}

export function AlarmsScreen() {
  const alarms = useLiveAlarms();
  const now = useMinute();
  const query = useQuery();
  const twelveHours = usePrefsStore(s => s.twelveHours);
  const weekStart = usePrefsStore(s => s.weekStart);
  const margin = usePrefsStore(s => s.marginMinutes);
  const events = useAgendaStore(s => s.events);
  const feeds = useAgendaStore(s => s.feeds);
  const shown = alarms.filter(alarm => answers(alarm, query));
  const searching = query.trim() !== '';

  const week = useMemo(() => weekOfMornings({ alarms, agenda: { events: Object.values(events), feeds: Object.values(feeds) }, now, margin }), [alarms, events, feeds, now, margin]);
  const opening = useMemo(() => chosenMorning(week, alarms, now), [week, alarms, now]);
  const [picked, setPicked] = useState<{ readonly day: string; readonly from: -1 | 0 | 1 } | null>(null);
  // A morning picked stays while it is in the week; else the next alarm's. It slides in from its side.
  const chosen = picked && week.some(morning => morning.day === picked.day) ? picked.day : opening;
  const from = picked && picked.day === chosen ? picked.from : 0;
  const choose = (day: string): void => setPicked({ day, from: day > chosen ? 1 : day < chosen ? -1 : 0 });
  const morning = week.find(item => item.day === chosen) ?? week[0]!;

  const where = (
    <p className={`${styles.where} t-meta`}>
      <Icon name="phone" size={16} />
      <span>{t('Your alarms ring on your phones with {app} for Android, never in this browser.', { app: APPS.clock.name })}</span>
    </p>
  );
  const week_ = searching ? null : (
    <>
      <WeekStrip week={week} chosen={chosen} today={instantToDay(now)} now={now} twelveHours={twelveHours} onChoose={choose} />
      <MorningPanel morning={morning} now={now} from={from} margin={margin} twelveHours={twelveHours} />
    </>
  );
  if (alarms.length === 0) {
    return (
      <div className={styles.screen}>
        <h1 className="sr-only">{t('Alarms')}</h1>
        {week_}
        <EmptyState scene="reminders" title={t('No alarms')} text={t('Set one here: it rings on every phone with {app}.', { app: APPS.clock.name })} keys={[{ key: 'C', label: t('New alarm') }]}>
          <Button icon="plus" onClick={() => openNewAlarm()}>
            {t('New alarm')}
          </Button>
        </EmptyState>
        {where}
      </div>
    );
  }
  return (
    <div className={styles.screen}>
      <h1 className="sr-only">{t('Alarms')}</h1>
      {week_}
      {searching ? null : <h2 className={`${home.section} t-section`}>{t('Alarms')}</h2>}
      {shown.length === 0 ? (
        <EmptyLine glyph="search" text={t('No alarm with “{query}”.', { query: query.trim() })} replayKey={query} />
      ) : (
        <ul className={styles.list} aria-label={t('Alarms')}>
          {shown.map(alarm => (
            <AlarmRow key={alarm.id} alarm={alarm} now={now} twelveHours={twelveHours} weekStart={weekStart} />
          ))}
        </ul>
      )}
      {where}
    </div>
  );
}
