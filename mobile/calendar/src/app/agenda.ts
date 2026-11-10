/**
 * What the views show for a range of days, from everything this phone holds: the events (their
 * occurrences, the calendars hidden left out), and the layers of the other apps the person keeps on
 * (`CalendarPrefs`): the contacts' birthdays, the notes' reminders, the days written in pages. Pure,
 * so the views, the widgets and the tests read it the same way.
 */
import type { LineColor } from '@unlease/design/colors';
import type { CalendarPrefs } from '@unlease/calendar/models/prefs';
import { eventColor } from '@unlease/calendar/services/colors';
import { birthdaysIn, remindersIn, type BirthdayItem, type ReminderItem } from '@unlease/calendar/services/layers';
import { hiddenFeedIds, occurrencesIn, type Occurrence } from '@unlease/calendar/services/occurrences';
import { dayToInstant } from '@unlease/calendar/services/time';
import { pageDatesIn, type PageDate } from '@unlease/pages/services/pageDates';

import type { LibraryState } from './store/libraryStore';

/** One thing on a day: an occurrence, or a layer's item. */
export type AgendaItem =
  | { readonly kind: 'event'; readonly key: string; readonly occurrence: Occurrence; readonly color: LineColor | null }
  | { readonly kind: 'birthday'; readonly key: string; readonly birthday: BirthdayItem }
  | { readonly kind: 'reminder'; readonly key: string; readonly reminder: ReminderItem }
  | { readonly kind: 'page'; readonly key: string; readonly page: PageDate };

/** The layers' colours: a birthday's, a note's reminder's, a page's (the web's too). */
export { LAYER_COLORS } from '@unlease/calendar/services/colors';

export interface Agenda {
  readonly occurrences: readonly Occurrence[];
  /** The layers' items, all of a day (birthdays, pages) or at a time (reminders). */
  readonly extras: readonly AgendaItem[];
}

export function agendaIn(state: LibraryState, prefs: CalendarPrefs, from: string, to: string, labelId: string | null = null): Agenda {
  const hidden = hiddenFeedIds(Object.values(state.feeds));
  const occurrences = occurrencesIn(Object.values(state.events), from, to, { hiddenFeeds: hidden, labelId });
  const extras: AgendaItem[] = [];
  if (labelId) return { occurrences, extras };
  if (prefs.birthdays) for (const birthday of birthdaysIn(Object.values(state.people.contacts), from, to)) extras.push({ kind: 'birthday', key: birthday.key, birthday });
  if (prefs.noteReminders) for (const reminder of remindersIn(Object.values(state.carnet.notes), dayToInstant(from), dayToInstant(to))) extras.push({ kind: 'reminder', key: reminder.key, reminder });
  if (prefs.pageDates) for (const page of pageDatesIn(state.blocks, from, to)) extras.push({ kind: 'page', key: page.key, page });
  return { occurrences, extras };
}

/** An occurrence as an item, its colour read once. */
export function eventItem(state: LibraryState, occurrence: Occurrence): AgendaItem {
  return { kind: 'event', key: occurrence.key, occurrence, color: eventColor(occurrence.event, state.calendarLabels, state.feeds) };
}

/** The day an item is on (its first day). */
export function itemDay(item: AgendaItem): string {
  switch (item.kind) {
    case 'event':
      return item.occurrence.firstDay;
    case 'birthday':
      return item.birthday.day;
    case 'reminder':
      return item.reminder.day;
    case 'page':
      return item.page.day;
  }
}

/** Whether an item touches a day. */
export function itemOn(item: AgendaItem, day: string): boolean {
  return item.kind === 'event' ? item.occurrence.firstDay <= day && item.occurrence.lastDay >= day : itemDay(item) === day;
}

/** Every item of a day, in the order a list shows them: all day first (birthdays, then events), then by time. */
export function itemsOn(state: LibraryState, agenda: Agenda, day: string): AgendaItem[] {
  const all: AgendaItem[] = [...agenda.extras.filter(item => itemOn(item, day)), ...agenda.occurrences.filter(item => item.firstDay <= day && item.lastDay >= day).map(item => eventItem(state, item))];
  const rank = (item: AgendaItem): number => {
    if (item.kind === 'birthday') return 0;
    if (item.kind === 'page' && item.page.time === null) return 1;
    if (item.kind === 'event' && (item.occurrence.allDay || item.occurrence.firstDay < day)) return 2;
    return 3;
  };
  const at = (item: AgendaItem): number => {
    if (item.kind === 'event') return item.occurrence.startAt;
    if (item.kind === 'reminder') return item.reminder.at;
    if (item.kind === 'page' && item.page.time) return dayToInstant(day) + (Number(item.page.time.slice(0, 2)) * 60 + Number(item.page.time.slice(3, 5))) * 60_000;
    return 0;
  };
  return all.sort((a, b) => rank(a) - rank(b) || at(a) - at(b) || a.key.localeCompare(b.key));
}
