/**
 * « Aujourd'hui » in this browser: what today and tomorrow hold, gathered as the views gather it
 * (`useItems`: the events shown, the calendars and labels unticked left out, the layers kept on),
 * but as the layers' own items, put in the day's order by `planToday`; Carnet's reminders missed and
 * still set (with its layer on), and the day's page in Pages when this browser holds it. Read again
 * each minute (`useNow`), so the now line moves and « Dans 20 min » counts down.
 */
import { useMemo } from 'react';

import { eventColor } from '@unlease/calendar/services/colors';
import { birthdaysIn, remindersIn } from '@unlease/calendar/services/layers';
import { hiddenFeedIds, occurrencesIn } from '@unlease/calendar/services/occurrences';
import { addDays, dayToInstant } from '@unlease/calendar/services/time';
import { overdueReminders, planToday, type DayItem, type TodayPlan } from '@unlease/calendar/services/today';
import { dailyPageOf } from '@unlease/pages/services/dailyPage';
import { pageDatesIn } from '@unlease/pages/services/pageDates';

import { useContactsStore } from '@contacts/app/store/library';
import { useLibraryStore } from '@notes/app/store/library';
import { useCalendarStore } from '../store/library';
import { usePageBlocksStore } from '../store/pageBlocks';
import { usePrefsStore } from '../store/prefs';
import { ownHidden } from './useItems';

export interface TodayState {
  readonly plan: TodayPlan;
  /** The day's page in Pages, when this browser holds it: « Note du jour » opens it rather than making it. */
  readonly dailyPageId: string | null;
}

export function useTodayPlan(today: string, now: number): TodayState {
  const { events, labels, feeds } = useCalendarStore();
  const prefs = usePrefsStore();
  const contacts = useContactsStore(s => s.contacts);
  const notes = useLibraryStore(s => s.notes);
  const blocks = usePageBlocksStore(s => s.blocks);
  // What the two days hold changes with the records, not with the minute: gathered once per change.
  const gathered = useMemo(() => {
    const from = today;
    const to = addDays(today, 2);
    const hiddenFeeds = hiddenFeedIds(Object.values(feeds));
    const items: DayItem[] = occurrencesIn(Object.values(events), from, to, { hiddenFeeds })
      .filter(occurrence => !ownHidden(occurrence.event, prefs, labels))
      .map(occurrence => ({ kind: 'event', key: occurrence.key, occurrence, color: eventColor(occurrence.event, labels, feeds) }));
    if (prefs.birthdays) for (const birthday of birthdaysIn(Object.values(contacts), from, to)) items.push({ kind: 'birthday', key: birthday.key, birthday });
    if (prefs.noteReminders) for (const reminder of remindersIn(Object.values(notes), dayToInstant(from), dayToInstant(to))) items.push({ kind: 'reminder', key: reminder.key, reminder });
    if (prefs.pageDates) for (const page of pageDatesIn(blocks, from, to)) items.push({ kind: 'page', key: page.key, page });
    const overdue = prefs.noteReminders ? overdueReminders(Object.values(notes), today) : [];
    return { items, overdue, dailyPageId: dailyPageOf(blocks, today) };
  }, [events, labels, feeds, prefs, contacts, notes, blocks, today]);
  const plan = useMemo(() => planToday({ today, now, items: gathered.items, overdue: gathered.overdue, dailyPageId: gathered.dailyPageId }), [gathered, today, now]);
  return { plan, dailyPageId: gathered.dailyPageId };
}
