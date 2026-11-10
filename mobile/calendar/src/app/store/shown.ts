/**
 * « Afficher uniquement celui-ci » and « Tout afficher » on the drawer's calendars (those subscribed
 * to, the holidays) and the other apps' layers: the rules are the package's (`services/shown`, the
 * web's too); here they are written where each is kept (a calendar's `hidden` in one synced batch,
 * the layers in this phone's prefs) with what showed before beside them, never synced. The phone
 * lists no « Mes événements »: one's own events always show. Each hands back its undo.
 */
import { showAll, showOnly, shownNow, shownPatch, readShownMemory, type Shown, type ShownMemory } from '@unlease/calendar/services/shown';
import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';

import type { Undo } from './actions';
import { setPrefs, useCalendarUiStore } from './calendarUi';
import { useLibraryStore, writeLocal } from './libraryStore';

const KEY = 'calendar.shownBefore';

/** The calendars the drawer lists, each shown or not, now. */
export function shownHere(): Record<string, boolean> {
  return shownNow({ feeds: Object.values(useLibraryStore.getState().feeds), prefs: useCalendarUiStore.getState().prefs });
}

function remembered(): ShownMemory | null {
  return readShownMemory(readPreferences()[KEY]);
}

/** The calendars as `target` has them: the subscriptions' in one batch, the layers on this phone. */
function apply(target: Shown, memory: ShownMemory | null): void {
  const patch = shownPatch(shownHere(), target);
  if (patch.feeds.length > 0) writeLocal(patch.feeds.map(each => ({ type: 'calendarFeed', id: each.id, patch: { hidden: each.hidden } })));
  if (Object.keys(patch.layers).length > 0) setPrefs(patch.layers);
  writePreference(KEY, memory);
}

/** `key` alone shown, every other calendar and layer put away. */
export function showOnlyCalendar(key: string): Undo {
  const before = shownHere();
  const memory = remembered();
  const only = showOnly(before, key, memory);
  apply(only.shown, only.memory);
  return () => apply(before, memory);
}

/** What showed before « uniquement » (every calendar, when nothing is remembered). */
export function showAllCalendars(): Undo {
  const before = shownHere();
  const memory = remembered();
  apply(showAll(before, memory), null);
  return () => apply(before, memory);
}
