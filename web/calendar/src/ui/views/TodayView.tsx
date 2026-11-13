/**
 * « Aujourd'hui »: the day at a glance, as a calm list on the view's sheet, in a reading column. The
 * weather when its layer is on; what takes the whole day (birthdays, all-day events, a page's day);
 * then what has a time, in time order, what is over in muted ink, what is under way (its title a
 * weight up) and what comes next saying how long (« Encore 25 min », « Dans 20 min »), the now line between them; an empty day
 * says so and offers to add an event (the view's empty state when nothing follows either, else a line); « Note du jour »; Carnet's reminders missed and still set;
 * tomorrow's birthdays, all-day events and first events. Each row opens what it is: the event, the
 * birthday, the note in Carnet, the page in Pages (`suitePlace`). Read again each minute.
 */
import { Fragment, memo, useId, useMemo } from 'react';

import { APPS } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';
import { formatClock, plural } from '@unlease/core/services/format';
import { LAYER_COLORS } from '@unlease/calendar/services/colors';
import { birthdayTitle, clockWords, weekdayDay } from '@unlease/calendar/services/eventText';
import type { ReminderItem } from '@unlease/calendar/services/layers';
import type { Occurrence } from '@unlease/calendar/services/occurrences';
import { weatherKind } from '@unlease/calendar/services/weather';
import { overdueWords, rowStateWords, rowTimeWords, weatherWords, type DayItem, type DayRow } from '@unlease/calendar/services/today';
import type { GlyphName } from '@unlease/design/glyphs';
import { pebbleTurnOf } from '@unlease/design/pebbles';

import { suitePlace } from '@shared/app/suitePlaces';
import { Button } from '@shared/ui/components/Button';
import { EmptyLine } from '@shared/ui/components/EmptyLine';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { Icon } from '@shared/ui/components/Icon';
import { useScrollEdges } from '@shared/ui/components/scrollEdges';
import { Link, navigate } from '@shared/ui/router';
import { useTodayPlan } from '../../app/hooks/useTodayPlan';
import { useWeather } from '../../app/hooks/useWeather';
import { usePrefsStore } from '../../app/store/prefs';
import calendar from '../calendar.module.css';
import { openDailyNote, useDailyNoteOffered } from '../features/dailyNote';
import { paths } from '../routes';
import styles from './today.module.css';

const LAYER_GLYPHS: Readonly<Record<Exclude<DayItem['kind'], 'event'>, GlyphName>> = { birthday: 'cake', reminder: 'bell', page: 'page' };

/** What a row is called. */
function titleOf(item: DayItem): string {
  switch (item.kind) {
    case 'event':
      return item.occurrence.event.title.trim() || t('Untitled');
    case 'birthday':
      return birthdayTitle(item.birthday.name, item.birthday.age);
    case 'reminder':
      return item.reminder.title || t('Untitled');
    case 'page':
      return item.page.title || t('Untitled');
  }
}

/** Where a row leads: its event, the birthday, the note in Carnet, the page in Pages. */
function placeOf(item: DayItem): string {
  switch (item.kind) {
    case 'event':
      return paths.event(item.occurrence.seriesId, item.occurrence.repeats ? item.occurrence.occurrence : null);
    case 'birthday':
      return paths.birthday(item.birthday.contactId);
    case 'reminder':
      return suitePlace('note', item.reminder.noteId) ?? paths.home;
    case 'page':
      return suitePlace('page', item.page.pageId) ?? paths.home;
  }
}

/** A row's mark in the glyphs' slot: an event's calendar stone in its colour, a layer's glyph in its pigment, a page's emoji. */
function Lead({ item }: { item: DayItem }) {
  if (item.kind === 'event') {
    return <span className={styles.stone} data-line={item.color ?? undefined} data-pebble={pebbleTurnOf(item.occurrence.event.feedId ?? 'own')} aria-hidden="true" />;
  }
  if (item.kind === 'page' && item.page.icon) {
    return (
      <span className={styles.emoji} aria-hidden="true">
        {item.page.icon}
      </span>
    );
  }
  return (
    <span className={styles.glyph} data-line={LAYER_COLORS[item.kind]} aria-hidden="true">
      <Icon name={LAYER_GLYPHS[item.kind]} size={20} />
    </span>
  );
}

/** One thing of the day: its mark, its title over its time (and place), what it says of now at its end. */
const Row = memo(function Row({ row, day, now, today, twelveHours }: { row: DayRow; day: string; now: number; today: string; twelveHours: boolean }) {
  const item = row.item;
  const place = item.kind === 'event' ? item.occurrence.event.place.trim() : '';
  const time = rowTimeWords(row, day, twelveHours);
  const state = day === today ? rowStateWords(row, now, today) : '';
  // A reminder's moment come is still to do (« Fait » in Carnet clears it): its time says so in danger ink.
  const due = item.kind === 'reminder' && row.state === 'past';
  const over = row.state === 'past' && !due;
  return (
    <li>
      <Link to={placeOf(item)} className={styles.row}>
        <span className={styles.slot} data-over={over || undefined}>
          <Lead item={item} />
        </span>
        <span className={styles.words}>
          <span className={`${styles.title} ${row.state === 'now' ? 't-body-strong' : 't-body'}`} data-over={over || undefined}>
            {titleOf(item)}
          </span>
          <span className={`${styles.meta} t-meta`}>
            <span className={styles.time} data-due={due || undefined}>
              {time}
            </span>
            {place ? <span>{` · ${place}`}</span> : null}
          </span>
        </span>
        {state ? <span className={`${styles.state} t-meta-strong`}>{state}</span> : null}
      </Link>
    </li>
  );
});

/** A reminder missed and still set: the note's title over when it was due, in danger ink. */
function OverdueRow({ reminder, today, twelveHours }: { reminder: ReminderItem; today: string; twelveHours: boolean }) {
  return (
    <li>
      <Link to={suitePlace('note', reminder.noteId) ?? paths.home} className={styles.row}>
        <span className={styles.slot}>
          <span className={styles.glyph} data-line={LAYER_COLORS.reminder} aria-hidden="true">
            <Icon name="bell" size={20} />
          </span>
        </span>
        <span className={styles.words}>
          <span className={`${styles.title} t-body`}>{reminder.title || t('Untitled')}</span>
          <span className={`${styles.meta} t-meta`}>
            <span className={styles.time} data-due>
              {overdueWords(reminder, today, twelveHours)}
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}

/** The now line, between what has started and what has not: the time grid's red line and dot. */
function NowLine({ now, twelveHours }: { now: number; twelveHours: boolean }) {
  return (
    <li className={styles.now}>
      <span className="sr-only">{t('Now, {clock}', { clock: clockWords(formatClock(now), twelveHours) })}</span>
    </li>
  );
}

export function TodayView({ today, now }: { today: string; now: number }) {
  const { plan, dailyPageId } = useTodayPlan(today, now);
  const twelveHours = usePrefsStore(s => s.twelveHours);
  const journal = useDailyNoteOffered();
  const rows = useMemo(() => [...plan.allDay, ...plan.timed], [plan]);
  // The day view's weather, asked the same way: at the first of the day's places the forecast finds, else at home.
  const placed = useMemo(() => rows.flatMap((row): Occurrence[] => (row.item.kind === 'event' ? [row.item.occurrence] : [])), [rows]);
  const weather = useWeather(useMemo(() => [today], [today]), placed).get(today);
  const tomorrow = plan.tomorrow;
  const ids = useId();
  const scrollEdges = useScrollEdges({ top: true });
  return (
    <div className={`${calendar.frame} paper`} data-outline="panel">
      <div ref={scrollEdges} className={styles.scroll}>
        <div className={styles.column}>
          {weather ? (
            <p className={`${styles.weather} t-meta`}>
              <Icon name={weatherKind(weather.day.code) === 'clear' ? 'sun' : 'cloud'} size={18} />
              <span>
                {weatherWords(weather.day)}
                {weather.place ? <span className={styles.place}>{` · ${weather.place}`}</span> : null}
              </span>
            </p>
          ) : null}

          {rows.length > 0 ? (
            <ul className={styles.list} aria-label={t('Today')}>
              {plan.allDay.map(row => (
                <Row key={row.item.key} row={row} day={today} now={now} today={today} twelveHours={twelveHours} />
              ))}
              {plan.timed.map((row, index) => (
                <Fragment key={row.item.key}>
                  {index === plan.nowAt ? <NowLine now={now} twelveHours={twelveHours} /> : null}
                  <Row row={row} day={today} now={now} today={today} twelveHours={twelveHours} />
                </Fragment>
              ))}
              {plan.timed.length > 0 && plan.nowAt === plan.timed.length ? <NowLine now={now} twelveHours={twelveHours} /> : null}
            </ul>
          ) : plan.overdue.length === 0 && !tomorrow ? (
            // Nothing today nor tomorrow: the view's empty place.
            <div className={styles.emptyView}>
              <EmptyState scene="reminders" title={t('Nothing planned today')} text={t('The day is yours.')}>
                <Button kind="tonal" icon="plus" onClick={() => navigate(paths.newEvent())}>
                  {t('Create an event')}
                </Button>
              </EmptyState>
            </div>
          ) : (
            // Nothing today, something below: the day's line, the way to fill it after.
            <EmptyLine
              className={styles.emptyDay}
              size="body"
              text={t('Nothing planned today: the day is yours.')}
              action={{ label: t('Create an event'), onClick: () => navigate(paths.newEvent()) }}
            />
          )}

          {journal ? (
            <ul className={styles.list}>
              <li>
                {dailyPageId ? (
                  <Link to={suitePlace('page', dailyPageId) ?? paths.home} className={styles.row}>
                    <JournalWords made />
                  </Link>
                ) : (
                  <button type="button" className={styles.row} onClick={() => void openDailyNote(today)}>
                    <JournalWords made={false} />
                  </button>
                )}
              </li>
            </ul>
          ) : null}

          {plan.overdue.length > 0 ? (
            <section className={styles.section} aria-labelledby={`${ids}-overdue`}>
              <h2 id={`${ids}-overdue`} className={`${styles.head} t-section`}>
                {t('Overdue')}
              </h2>
              <ul className={styles.list}>
                {plan.overdue.map(reminder => (
                  <OverdueRow key={reminder.key} reminder={reminder} today={today} twelveHours={twelveHours} />
                ))}
              </ul>
            </section>
          ) : null}

          {tomorrow ? (
            <section className={styles.section} aria-labelledby={`${ids}-tomorrow`}>
              <div className={styles.head}>
                <h2 id={`${ids}-tomorrow`} className="t-section">
                  {t('Tomorrow')}
                </h2>
                <span className="t-meta">{weekdayDay(tomorrow.day, Number(today.slice(0, 4)))}</span>
              </div>
              <ul className={styles.list}>
                {tomorrow.rows.map(row => (
                  <Row key={row.item.key} row={row} day={tomorrow.day} now={now} today={today} twelveHours={twelveHours} />
                ))}
              </ul>
              {tomorrow.more > 0 ? (
                <div className={styles.more}>
                  <Link to={paths.view('day', tomorrow.day)} className={`${styles.moreLink} t-label`}>
                    {t('And {events} tomorrow', { events: plural(tomorrow.more, 'more event', 'more events') })}
                    <Icon name="chevronRight" size={18} />
                  </Link>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** « Note du jour »: its page in Pages, opened, or made first. */
function JournalWords({ made }: { made: boolean }) {
  return (
    <>
      <span className={styles.slot}>
        <span className={styles.glyph} aria-hidden="true">
          <Icon name={made ? 'page' : 'pagePlus'} size={20} />
        </span>
      </span>
      <span className={styles.words}>
        <span className={`${styles.title} t-body`}>{t('Today’s note')}</span>
        <span className={`${styles.meta} t-meta`}>{made ? t('Open in {app}', { app: APPS.pages.name }) : t('To write in {app}', { app: APPS.pages.name })}</span>
      </span>
    </>
  );
}
