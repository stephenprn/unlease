/**
 * From the root: the reminders re-armed a moment after the events, the calendars or the language
 * change, and each time the app comes back to the front (the hours gone by bring the next ones into
 * its horizon, and a late one may ring); the hourly run with the app closed asked for; a pressed one
 * opening its event (the morning digest's, « Aujourd'hui »). The first event with a reminder, or the
 * digest turned on, asks Android (13 and later) for notifications.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { selectLocale, selectOnboarded, useSettingsStore } from '@shared/app/store/settingsStore';
import { ensurePermission, initialEvent, onForegroundEvent, type PressedEvent } from '@platform/notifications';

import { later } from '../later';
import { keepAlarmsFresh, reconcileAlarms } from '../reminders';
import { useCalendarUiStore } from '../store/calendarUi';
import { useLibraryStore } from '../store/libraryStore';

const RECONCILE_AFTER_MS = 600;
let asked = false;

export function useEventAlarms(open: (event: PressedEvent) => void): void {
  const events = useLibraryStore(s => s.events);
  const feeds = useLibraryStore(s => s.feeds);
  // The morning digest reads the other apps' layers and the prefs too: its words are armed again when they change.
  const digest = useCalendarUiStore(s => (s.prefs.digest ? JSON.stringify([s.prefs.digestAt, s.prefs.digestEmpty, s.prefs.twelveHours, s.prefs.birthdays, s.prefs.noteReminders, s.prefs.pageDates]) : ''));
  const notes = useLibraryStore(s => (digest ? s.carnet.notes : null));
  const contacts = useLibraryStore(s => (digest ? s.people.contacts : null));
  const blocks = useLibraryStore(s => (digest ? s.blocks : null));
  const locale = useSettingsStore(selectLocale);
  const onboarded = useSettingsStore(selectOnboarded);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!onboarded) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const wantsAny = Object.values(useLibraryStore.getState().events).some(event => event.deletedAt === null && event.trashedAt === null && event.reminders.length > 0);
      if (wantsAny && !asked) {
        asked = true;
        later(ensurePermission());
      }
      if (useCalendarUiStore.getState().prefs.digest && !asked) {
        asked = true;
        later(ensurePermission());
      }
      later(reconcileAlarms());
    }, RECONCILE_AFTER_MS);
    return () => clearTimeout(timer.current);
  }, [events, feeds, locale, onboarded, digest, notes, contacts, blocks]);

  useEffect(() => {
    if (!onboarded) return undefined;
    keepAlarmsFresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') later(reconcileAlarms());
    });
    return () => subscription.remove();
  }, [onboarded]);

  useEffect(() => {
    initialEvent()
      .then(event => event && setTimeout(() => open(event), 400))
      .catch(() => undefined);
    return onForegroundEvent(open);
  }, [open]);
}
