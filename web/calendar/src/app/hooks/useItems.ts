/**
 * What the views draw for a range of days: the occurrences of the events shown (one's own but the
 * labels unticked here, the calendars shown), and the layers of the other apps this browser shows
 * (contacts' birthdays, Carnet's reminders, the days written in pages), each as an occurrence of an
 * event made up for the view (its key says what it is: `birthday:…`, `reminder:…`, `page-date:…`),
 * so every view lays them out the same way.
 */
import { useMemo } from 'react';

import { t } from '@unlease/core/i18n';
import type { LineColor } from '@unlease/design/colors';
import { isOwn, type CalendarEvent } from '@unlease/calendar/models/events';
import { eventColor, LAYER_COLORS as LAYERS } from '@unlease/calendar/services/colors';
import { birthdayTitle } from '@unlease/calendar/services/eventText';
import { birthdaysIn, remindersIn } from '@unlease/calendar/services/layers';
import { compareOccurrences, hiddenFeedIds, occurrencesIn, type Occurrence } from '@unlease/calendar/services/occurrences';
import { addDays, addMinutes, dayToInstant, instantToWall, isDay } from '@unlease/calendar/services/time';
import { pageDatesIn } from '@unlease/pages/services/pageDates';

import { useContactsStore } from '@contacts/app/store/library';
import { useLibraryStore } from '@notes/app/store/library';
import { useCalendarStore } from '../store/library';
import { usePageBlocksStore } from '../store/pageBlocks';
import { usePrefsStore, type AgendaPrefs } from '../store/prefs';

export type ItemKind = 'event' | 'birthday' | 'reminder' | 'page';

/** What an occurrence's key says it is. */
export function kindOf(key: string): ItemKind {
  if (key.startsWith('birthday:')) return 'birthday';
  if (key.startsWith('reminder:')) return 'reminder';
  if (key.startsWith('page-date:')) return 'page';
  return 'event';
}

/** The colours of the layers, the phone's too (`calendar/services/colors`). */
export const LAYER_COLORS: Readonly<Record<Exclude<ItemKind, 'event'>, LineColor>> = LAYERS;

/** An event made up for a layer's item: shown, never stored. */
function made(key: string, title: string, start: string, end: string): CalendarEvent {
  return {
    id: key,
    title,
    description: '',
    place: '',
    start,
    end,
    timeZone: '',
    rrule: '',
    exdates: [],
    recurringId: null,
    originalStart: '',
    reminders: [],
    labelIds: [],
    contactIds: [],
    files: [],
    feedId: null,
    uid: '',
    url: '',
    color: null,
    trashedAt: null,
    createdAt: 0,
    deletedAt: null,
    editedAt: 0,
  };
}

function layerOccurrence(key: string, title: string, start: string, end: string): Occurrence {
  const event = made(key, title, start, end);
  const allDay = isDay(start);
  const startAt = dayToInstant(start.slice(0, 10)) + (allDay ? 0 : (Number(start.slice(11, 13)) * 60 + Number(start.slice(14, 16))) * 60_000);
  const endAt = allDay ? dayToInstant(end) : startAt + 30 * 60_000;
  return { key, event, seriesId: key, occurrence: start, repeats: false, allDay, start, end, startAt, endAt, firstDay: start.slice(0, 10), lastDay: allDay ? addDays(end, -1) : start.slice(0, 10) };
}

/** Whether one's own event is left out by what is unticked here. */
export function ownHidden(event: CalendarEvent, prefs: Pick<AgendaPrefs, 'hideOwn' | 'hiddenLabels'>, labels: Readonly<Record<string, { readonly deletedAt: number | null }>>): boolean {
  if (!isOwn(event)) return false;
  const worn = event.labelIds.filter(id => labels[id]?.deletedAt === null);
  if (worn.length === 0) return prefs.hideOwn;
  return worn.every(id => prefs.hiddenLabels.includes(id));
}

/** The occurrences (and layers' items) touching the days [from, to). */
export function useItems(from: string, to: string): readonly Occurrence[] {
  const { events, labels, feeds } = useCalendarStore();
  const prefs = usePrefsStore();
  const contacts = useContactsStore(s => s.contacts);
  const notes = useLibraryStore(s => s.notes);
  const blocks = usePageBlocksStore(s => s.blocks);
  return useMemo(() => {
    const hiddenFeeds = hiddenFeedIds(Object.values(feeds));
    const out = occurrencesIn(Object.values(events), from, to, { hiddenFeeds }).filter(item => !ownHidden(item.event, prefs, labels));
    if (prefs.birthdays) {
      for (const birthday of birthdaysIn(Object.values(contacts), from, to)) out.push(layerOccurrence(birthday.key, birthdayTitle(birthday.name, birthday.age), birthday.day, addDays(birthday.day, 1)));
    }
    if (prefs.noteReminders) {
      for (const reminder of remindersIn(Object.values(notes), dayToInstant(from), dayToInstant(to))) {
        const start = instantToWall(reminder.at, '');
        out.push(layerOccurrence(reminder.key, reminder.title || t('Reminder'), start, addMinutes(start, 30)));
      }
    }
    if (prefs.pageDates) {
      for (const date of pageDatesIn(blocks, from, to)) {
        const start = date.time ? `${date.day}T${date.time}` : date.day;
        out.push(layerOccurrence(date.key, date.title || t('Untitled'), start, date.time ? addMinutes(start, 30) : addDays(date.day, 1)));
      }
    }
    return out.sort(compareOccurrences);
  }, [events, labels, feeds, prefs, contacts, notes, blocks, from, to]);
}

/** The colour an occurrence is painted in; null: the device's primary. */
export function useColorOf(): (item: Occurrence) => LineColor | null {
  const { labels, feeds } = useCalendarStore();
  return useMemo(
    () => (item: Occurrence) => {
      const kind = kindOf(item.key);
      return kind === 'event' ? eventColor(item.event, labels, feeds) : LAYER_COLORS[kind];
    },
    [labels, feeds],
  );
}
