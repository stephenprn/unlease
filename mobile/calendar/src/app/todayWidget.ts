/**
 * What the « Aujourd'hui » widget draws, handed to it as JSON (`widgets.ts`): the day at a glance as
 * the view reads it (`services/today`), for today and the day after, so a widget drawn after midnight
 * before the app feeds it again starts on the right day. Each row carries its instants: the widget
 * drops what ended and says « En cours » for what runs as it draws (every half hour, and at each
 * start and end it carries). Its words come in the app's language.
 */
import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import type { CalendarPrefs } from '@unlease/calendar/models/prefs';
import { LAYER_COLORS } from '@unlease/calendar/services/colors';
import { birthdayTitle, dayTitle, weekdayDay } from '@unlease/calendar/services/eventText';
import { addDays, today as todayOf } from '@unlease/calendar/services/time';
import { overdueWords, planToday, rowTimeWords, weatherPlaces, weatherWords, type DayItem, type DayRow } from '@unlease/calendar/services/today';
import type { WeatherDay } from '@unlease/calendar/sync/routes';
import { appScheme } from '@shared/app/variant';

import type { LibraryState } from './store/libraryStore';
import { gatherToday } from './today';

export interface TodayWidgetRow {
  readonly key: string;
  readonly title: string;
  /** « 14:30 – 15:30 », « Toute la journée », « Jusqu’à 10:00 »; a missed reminder's « Hier · 18:00 ». */
  readonly time: string;
  readonly place: string;
  /** A pigment key, '' for the primary. */
  readonly color: string;
  /** What a tap opens: `unlease-agenda://<open>` (or another app's address, whole). */
  readonly open: string;
  readonly allDay: boolean;
  /** A reminder's moment: it stays once come (still to do), where an event over is dropped. */
  readonly moment: boolean;
  readonly startAt: number;
  readonly endAt: number;
}

export interface TodayWidgetDay {
  readonly day: string;
  /** « Lundi 9 novembre »: the head. */
  readonly title: string;
  /** « lun. 9 nov. »: the small form's head. */
  readonly label: string;
  /** « Nuageux · 14° / 7° », '' when unknown or the layer is off. */
  readonly weather: string;
  /** Whole days first, then by time. */
  readonly rows: readonly TodayWidgetRow[];
  /** « Demain · mar. 10 nov. ». */
  readonly tomorrowTitle: string;
  readonly tomorrow: readonly TodayWidgetRow[];
  /** « Et 2 autres événements demain », '' for none; opens `moreOpen`. */
  readonly more: string;
  readonly moreOpen: string;
}

export interface TodayPayload {
  readonly id: 'today';
  readonly days: readonly TodayWidgetDay[];
  /** « En retard »: Carnet's reminders missed and still set. */
  readonly overdueTitle: string;
  readonly overdue: readonly TodayWidgetRow[];
  readonly words: {
    /** What runs as the widget draws: « En cours ». */
    readonly now: string;
    /** Nothing at all today. */
    readonly empty: string;
    /** All of today over. */
    readonly done: string;
    /** « +{count} »: the small form's rest of the day. */
    readonly more: string;
  };
}

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

function openOf(item: DayItem): string {
  switch (item.kind) {
    case 'event':
      return `event/${encodeURIComponent(item.occurrence.seriesId)}?at=${encodeURIComponent(item.occurrence.occurrence)}`;
    case 'birthday':
      return `birthday/${encodeURIComponent(item.birthday.contactId)}`;
    case 'reminder':
      return `${appScheme('notes')}://note/${encodeURIComponent(item.reminder.noteId)}`;
    case 'page':
      return `${appScheme('pages')}://page/${encodeURIComponent(item.page.pageId)}`;
  }
}

function asRow(row: DayRow, day: string, twelve: boolean): TodayWidgetRow {
  const item = row.item;
  return {
    key: `${item.key}|${day}`,
    title: titleOf(item),
    time: rowTimeWords(row, day, twelve),
    place: item.kind === 'event' ? item.occurrence.event.place.trim() : '',
    color: item.kind === 'event' ? (item.color ?? '') : LAYER_COLORS[item.kind],
    open: openOf(item),
    allDay: row.allDay,
    moment: item.kind === 'reminder',
    startAt: row.startAt,
    endAt: row.endAt,
  };
}

/** « Aujourd'hui » at `now`, its weather (for today, when known) laid in. */
export function todayPayload(state: LibraryState, prefs: CalendarPrefs, now: number, weather: WeatherDay | null = null): TodayPayload {
  const first = todayOf(now);
  const year = Number(first.slice(0, 4));
  // Today and the day after, each with its own tomorrow: three days read once.
  const gathered = gatherToday(state, prefs, first, 3);
  const days = [first, addDays(first, 1)].map((day): TodayWidgetDay => {
    // The day after is planned from its own start: nothing of it has begun yet.
    const plan = planToday({ today: day, now: day === first ? now : 0, items: gathered.items, dailyPageId: gathered.dailyPageId });
    const tomorrow = plan.tomorrow;
    return {
      day,
      title: dayTitle(day),
      label: weekdayDay(day, year),
      weather: weather && weather.day === day ? weatherWords(weather) : '',
      rows: [...plan.allDay, ...plan.timed].map(row => asRow(row, day, prefs.twelveHours)),
      tomorrowTitle: `${t('Tomorrow')} · ${weekdayDay(addDays(day, 1), year)}`,
      tomorrow: tomorrow ? tomorrow.rows.map(row => asRow(row, tomorrow.day, prefs.twelveHours)) : [],
      more: tomorrow && tomorrow.more > 0 ? t('And {events} tomorrow', { events: plural(tomorrow.more, 'more event', 'more events') }) : '',
      moreOpen: `day/${addDays(day, 1)}`,
    };
  });
  return {
    id: 'today',
    days,
    overdueTitle: t('Overdue'),
    overdue: gathered.overdue.map(reminder => ({
      key: reminder.key,
      title: reminder.title || t('Untitled'),
      time: overdueWords(reminder, first, prefs.twelveHours),
      place: '',
      color: LAYER_COLORS.reminder,
      open: `${appScheme('notes')}://note/${encodeURIComponent(reminder.noteId)}`,
      allDay: false,
      moment: true,
      startAt: reminder.at,
      endAt: reminder.at,
    })),
    words: { now: t('Happening now'), empty: t('Nothing planned today'), done: t('Nothing else today'), more: t('+{count}') },
  };
}

/** Where today's weather is asked, as the view asks it: the day's placed events in order, then home. */
export function todayWeatherPlaces(state: LibraryState, prefs: CalendarPrefs, now: number): string[] {
  const day = todayOf(now);
  const plan = planToday({ today: day, now, items: gatherToday(state, prefs, day, 1).items });
  return weatherPlaces([...plan.allDay, ...plan.timed], prefs.homePlace);
}
