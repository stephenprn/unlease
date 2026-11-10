/**
 * How the calendar looks in this browser (Réglages, never synced: `CalendarPrefs`), and what the
 * navigation hides here: one's own events, labels unticked. A subscribed calendar's « shown » is
 * its record's (`hidden`, synced), as Google keeps it. Every access is guarded: blocked storage only
 * means nothing is remembered.
 */
import { create } from 'zustand';

import { CALENDAR_PREFS_DEFAULTS, readCalendarPrefs, type CalendarPrefs } from '@unlease/calendar/models/prefs';
import { isCalendarView, isPeriodView, type PeriodView } from '@unlease/calendar/services/eventText';
import { readShownMemory, type ShownMemory } from '@unlease/calendar/services/shown';

import { getStorageName } from '@shared/app/env';

export interface AgendaPrefs extends CalendarPrefs {
  /** One's own events left out of the views (« Mon agenda » unticked). */
  readonly hideOwn: boolean;
  /** Labels whose events are left out of the views. */
  readonly hiddenLabels: readonly string[];
  /** Browser notifications asked for, on this browser (its push subscription is the server's). */
  readonly notify: boolean;
  /** What showed before « Afficher uniquement celui-ci », for « Tout afficher » (`services/shown`). */
  readonly shownBefore: ShownMemory | null;
  /** The calendar's view chosen last (`view` may be « Aujourd'hui »): where the navigation's « Agenda » leads. */
  readonly periodView: PeriodView;
}

const DEFAULTS: AgendaPrefs = { ...CALENDAR_PREFS_DEFAULTS, hideOwn: false, hiddenLabels: [], notify: false, shownBefore: null, periodView: 'week' };

export const usePrefsStore = create<AgendaPrefs>(() => DEFAULTS);

const storageKey = (): string => `${getStorageName()}.calendar`;

export function loadPrefs(): void {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey()) ?? '{}');
    if (typeof parsed === 'object' && parsed !== null) stored = parsed as Record<string, unknown>;
  } catch {
    // Unreadable or blocked: the defaults.
  }
  const prefs = readCalendarPrefs(stored);
  usePrefsStore.setState(
    {
      ...prefs,
      hideOwn: stored.hideOwn === true,
      hiddenLabels: Array.isArray(stored.hiddenLabels) ? stored.hiddenLabels.filter((id): id is string => typeof id === 'string').slice(0, 200) : [],
      notify: stored.notify === true,
      shownBefore: readShownMemory(stored.shownBefore),
      periodView: isCalendarView(stored.periodView) && isPeriodView(stored.periodView) ? stored.periodView : isPeriodView(prefs.view) ? prefs.view : DEFAULTS.periodView,
    },
    true,
  );
}

export function savePrefs(patch: Partial<AgendaPrefs>): void {
  usePrefsStore.setState(patch);
  try {
    localStorage.setItem(storageKey(), JSON.stringify(usePrefsStore.getState()));
  } catch {
    // Blocked storage: the choice holds for this visit only.
  }
}

/** A label shown or left out of the views. */
export function toggleLabelShown(id: string): void {
  const hidden = usePrefsStore.getState().hiddenLabels;
  savePrefs({ hiddenLabels: hidden.includes(id) ? hidden.filter(each => each !== id) : [...hidden, id] });
}

/** Test seam. */
export function resetPrefs(): void {
  usePrefsStore.setState(DEFAULTS, true);
}
