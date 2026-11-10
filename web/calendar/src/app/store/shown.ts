/**
 * « Afficher uniquement celui-ci » and « Tout afficher » on the navigation's calendars (« Mes
 * événements » and each label, the calendars subscribed to, what the other apps lay on the
 * calendar): the rules are the package's (`services/shown`); here they are written where each is
 * kept (a calendar's `hidden` in one synced batch; one's own, the labels unticked and the layers in
 * this browser's prefs, the memory beside them), and the slip offers to take it back.
 */
import { useMemo } from 'react';

import { t } from '@unlease/core/i18n';
import { showAll, showOnly, shownNow, shownPatch, type Shown, type ShownMemory } from '@unlease/calendar/services/shown';

import { writeLocal } from '@shared/app/store/records';
import { showUndo } from '@shared/app/store/ui';
import { useCalendarStore, type CalendarState } from './library';
import { savePrefs, usePrefsStore, type AgendaPrefs } from './prefs';

const listedOf = (prefs: AgendaPrefs, { labels, feeds }: Pick<CalendarState, 'labels' | 'feeds'>): Record<string, boolean> =>
  shownNow({ own: !prefs.hideOwn, labels: { all: Object.values(labels), hidden: prefs.hiddenLabels }, feeds: Object.values(feeds), prefs });

/** The calendars the navigation lists, each shown or not, now. */
export function shownHere(): Record<string, boolean> {
  return listedOf(usePrefsStore.getState(), useCalendarStore.getState());
}

/** The same, kept up to date for the navigation. */
export function useShownHere(): Shown {
  const prefs = usePrefsStore();
  const labels = useCalendarStore(s => s.labels);
  const feeds = useCalendarStore(s => s.feeds);
  return useMemo(() => listedOf(prefs, { labels, feeds }), [prefs, labels, feeds]);
}

/** The calendars as `target` has them: the subscriptions' in one batch, the rest in this browser. */
function apply(target: Shown, memory: ShownMemory | null): void {
  const patch = shownPatch(shownHere(), target);
  if (patch.feeds.length > 0) writeLocal(patch.feeds.map(each => ({ type: 'calendarFeed', id: each.id, patch: { hidden: each.hidden } })));
  const unticked = new Set(usePrefsStore.getState().hiddenLabels);
  for (const label of patch.labels) {
    if (label.hidden) unticked.add(label.id);
    else unticked.delete(label.id);
  }
  savePrefs({ ...patch.layers, ...(patch.own !== null ? { hideOwn: !patch.own } : {}), ...(patch.labels.length > 0 ? { hiddenLabels: [...unticked] } : {}), shownBefore: memory });
}

/** `key` alone shown; the slip takes it back. */
export function showOnlyCalendar(key: string): void {
  const before = shownHere();
  const remembered = usePrefsStore.getState().shownBefore;
  const only = showOnly(before, key, remembered);
  apply(only.shown, only.memory);
  showUndo(t('Les autres agendas sont masqués'), () => apply(before, remembered));
}

/** What showed before « uniquement » (every calendar, when nothing is remembered); the slip takes it back. */
export function showAllCalendars(): void {
  const before = shownHere();
  const remembered = usePrefsStore.getState().shownBefore;
  apply(showAll(before, remembered), null);
  showUndo(t('Les agendas sont de nouveau affichés'), () => apply(before, remembered));
}
