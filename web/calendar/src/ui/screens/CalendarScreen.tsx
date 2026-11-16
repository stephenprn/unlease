/**
 * The calendar: its bar (« Aujourd'hui », the arrows, the period's title, the view, Claude, the day's
 * note) over the view the address names (`/agenda/week/2026-11-02`), or the one chosen last and today
 * for `/agenda`; « Ma journée » (`/agenda/today`), the day at a glance, under the same bar with
 * nothing to turn. With words in the search box, the events found instead.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { t, tc } from '@unlease/core/i18n';
import { isPeriodView, PERIOD_VIEWS, VIEW_NAMES, stepDay, viewDays, viewTitle, type CalendarView } from '@unlease/calendar/services/eventText';
import { addDays, monthGrid, partsOf, startOfMonth } from '@unlease/calendar/services/time';

import { useQuery } from '@shared/app/store/search';
import { selectServer, selectServerApps, useSettingsStore } from '@shared/app/store/settings';
import { useServerSettingsStore } from '@shared/app/store/serverSettings';
import { Button } from '@shared/ui/components/Button';
import controls from '@shared/ui/components/controls.module.css';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton, pebbleUnder } from '@shared/ui/components/IconButton';
import { Popover } from '@shared/ui/components/Popover';
import { Segmented } from '@shared/ui/components/Segmented';
import { DOCKED, useMedia } from '@shared/ui/useMedia';
import { navigate } from '@shared/ui/router';
import { useItems } from '../../app/hooks/useItems';
import { useNow } from '../../app/hooks/useToday';
import { setAskOpen } from '../../app/store/calendarUi';
import { savePrefs, usePrefsStore, useShownWeekdays } from '../../app/store/prefs';
import styles from '../calendar.module.css';
import { paths } from '../routes';
import { openDailyNote } from '../features/dailyNote';
import { ChoiceField } from '../features/Fields';
import { MiniMonth } from '../views/MiniMonth';
import { MonthView } from '../views/MonthView';
import { ScheduleView } from '../views/ScheduleView';
import { TimeGrid } from '../views/TimeGrid';
import { TodayView } from '../views/TodayView';
import { YearView } from '../views/YearView';
import { SearchResults } from './SearchResults';

/** Where the bar holds the six views as a segmented track: a wide window, beside the docked navigation. */
const WIDE_BAR = '(min-width: 1360px)';

/** The days whose events a view needs. */
function range(view: CalendarView, day: string, weekStart: number, weekdays: readonly number[] | null): { from: string; to: string } {
  switch (view) {
    case 'month': {
      const weeks = monthGrid(day, weekStart);
      return { from: weeks[0]![0]!, to: addDays(weeks[weeks.length - 1]![6]!, 1) };
    }
    case 'year':
      return { from: `${day.slice(0, 4)}-01-01`, to: `${Number(day.slice(0, 4)) + 1}-01-01` };
    case 'schedule':
      return { from: day, to: addDays(day, 1) };
    default: {
      const days = viewDays(view, day, weekStart, weekdays);
      return { from: days[0]!, to: addDays(days[days.length - 1]!, 1) };
    }
  }
}

/**
 * « Aujourd'hui » on a phone-sized window: today's number on Onde's day page (`datePage`, the phone's
 * too), as a calendar's own icon reads it, never the calendar's glyph (« Agenda »'s, in the navigation).
 */
function TodayJump({ today, onJump }: { today: string; onJump: () => void }) {
  return (
    <button type="button" className={controls.iconButton} {...pebbleUnder(0)} aria-label={t('Today')} data-tip={t('Today (T)')} onClick={onJump}>
      <span className={styles.todayMark} aria-hidden="true">
        <Icon name="datePage" size={24} />
        <span className="tabular">{partsOf(today).day}</span>
      </span>
    </button>
  );
}

/**
 * The period's title, where the navigation's month is not on screen (under 1100px): a press opens
 * the month in small to pick a day, as the phone's title does, its chevron saying so.
 */
function PeriodTitle({ title, view, day, today, days, weekStart }: { title: string; view: CalendarView; day: string; today: string; days: readonly string[]; weekStart: number }) {
  const docked = useMedia(DOCKED);
  const button = useRef<HTMLButtonElement>(null);
  const [picking, setPicking] = useState(false);
  const [month, setMonth] = useState(day);
  // The year shows its months whole already; « Ma journée » is today's.
  if (docked || view === 'year' || view === 'today') return <h1 className={`${styles.toolbarTitle} t-title`}>{title}</h1>;
  const shown = new Set(view === 'day' || view === 'threeDays' || view === 'week' ? days : []);
  return (
    <h1 className={`${styles.toolbarTitle} t-title`}>
      <button
        ref={button}
        type="button"
        className={styles.titleButton}
        aria-haspopup="dialog"
        aria-expanded={picking}
        onClick={() => {
          setMonth(day);
          setPicking(true);
        }}
      >
        <span className={styles.titleWords}>{title}</span>
        <Icon name="chevronDown" size={20} />
      </button>
      <Popover open={picking} anchor={button} onDismiss={() => setPicking(false)} label={t('Go to day')} width={320}>
        <div className={styles.titlePicker}>
          <MiniMonth
            month={month}
            weekStart={weekStart}
            today={today}
            shown={shown}
            onStep={direction => setMonth(stepDay('month', month, direction))}
            onPick={picked => {
              setPicking(false);
              navigate(paths.view(view, picked), { replace: true });
            }}
          />
        </div>
      </Popover>
    </h1>
  );
}

/** Where the arrows and the keys move a view to. */
export function stepView(view: CalendarView, day: string, direction: 1 | -1): void {
  navigate(paths.view(view, stepDay(view, day, direction)), { replace: true });
}

export function CalendarScreen({ view: asked, day: dayAsked }: { view: CalendarView | null; day: string | null }) {
  const { now, today } = useNow();
  const prefs = usePrefsStore();
  const view = asked ?? prefs.view;
  // « Ma journée » is today's, whatever the address says.
  const isToday = view === 'today';
  const day = isToday ? today : (dayAsked ?? today);
  const query = useQuery();
  const server = useSettingsStore(selectServer);
  const apps = useSettingsStore(selectServerApps);
  const settings = useServerSettingsStore(s => s.settings);
  // « Jours travaillés seulement »: the week without the days not worked.
  const weekdays = useShownWeekdays();
  const { from, to } = range(view, day, prefs.weekStart, weekdays);
  const items = useItems(from, to);
  const days = useMemo(() => viewDays(view, day, prefs.weekStart, weekdays), [view, day, prefs.weekStart, weekdays]);
  // The six views side by side where the bar has room for them, else in a menu.
  const wide = useMedia(WIDE_BAR);

  // The view chosen last opens next time; the calendar's last is where the navigation's « Agenda » leads.
  useEffect(() => {
    const kept = usePrefsStore.getState();
    if (asked && (asked !== kept.view || (isPeriodView(asked) && asked !== kept.periodView))) savePrefs(isPeriodView(asked) ? { view: asked, periodView: asked } : { view: asked });
  }, [asked]);

  if (query.trim()) return <SearchResults query={query} today={today} />;

  const pages = !!server && (!apps || apps.includes('pages'));
  const ask = settings?.calendar.ask === true && settings.analysis.enabled;
  const showMonth = view === 'month' ? startOfMonth(day) : day;
  // The calendar's six: « Ma journée » is a place of the navigation (its row, O), so none is chosen there.
  const viewChoices = PERIOD_VIEWS.map(each => ({ value: each as CalendarView, label: VIEW_NAMES[each] }));
  return (
    <div className={styles.calendar}>
      <div className={styles.toolbar} role="toolbar" aria-label={t('Period shown')}>
        <div className={styles.toolbarStart}>
          {isToday ? null : (
            <>
              <Button kind="outlined" className={styles.todayButton} onClick={() => navigate(paths.view(view, today), { replace: true })} title={t('Today (T)')}>
                {t('Today')}
              </Button>
              <span className={styles.todayIcon}>
                <TodayJump today={today} onJump={() => navigate(paths.view(view, today), { replace: true })} />
              </span>
              <span className={styles.stepBack}>
                <IconButton icon="chevronRight" label={t('Previous period')} shortcut="K" shape={1} onClick={() => stepView(view, day, -1)} />
              </span>
              <IconButton icon="chevronRight" label={t('Next period')} shortcut="J" shape={2} onClick={() => stepView(view, day, 1)} />
            </>
          )}
          <PeriodTitle title={viewTitle(view, showMonth, prefs.weekStart, weekdays)} view={view} day={day} today={today} days={days} weekStart={prefs.weekStart} />
        </div>
        <div className={styles.toolbarEnd}>
          {view === 'day' && pages ? <IconButton icon="pagePlus" label={t('Today’s note')} shape={3} onClick={() => void openDailyNote(day)} /> : null}
          {ask ? <IconButton icon="sparkle" label={t('Ask Claude')} hasPopup="dialog" shape={1} onClick={() => setAskOpen(true)} /> : null}
          {wide ? (
            <div className={styles.viewSwitch}>
              <Segmented options={viewChoices} value={view} label={tc('layout', 'View')} onChange={next => navigate(paths.view(next, day))} />
            </div>
          ) : (
            <span className={styles.viewMenu}>
              <ChoiceField value={view} choices={viewChoices} label={tc('layout', 'View')} shown={isToday ? VIEW_NAMES.today : undefined} onChange={next => navigate(paths.view(next, day))} />
            </span>
          )}
        </div>
      </div>
      {isToday ? (
        <TodayView today={today} now={now} />
      ) : view === 'month' ? (
        <MonthView day={day} items={items} today={today} />
      ) : view === 'year' ? (
        <YearView day={day} items={items} today={today} />
      ) : view === 'schedule' ? (
        <ScheduleView day={day} today={today} />
      ) : (
        <TimeGrid days={days} items={items} now={now} today={today} />
      )}
    </div>
  );
}

