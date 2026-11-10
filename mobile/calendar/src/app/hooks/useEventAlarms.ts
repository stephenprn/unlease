/**
 * From the root: the reminders re-armed a moment after the events, the calendars or the language
 * change, and each time the app comes back to the front (the hours gone by bring the next ones into
 * its horizon, and a late one may ring); the hourly run with the app closed asked for; a pressed one
 * opening its event. The first event with a reminder asks Android (13 and later) for notifications.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { selectLocale, selectOnboarded, useSettingsStore } from '@shared/app/store/settingsStore';
import { ensurePermission, initialEvent, onForegroundEvent, type PressedEvent } from '@platform/notifications';

import { later } from '../later';
import { keepAlarmsFresh, reconcileAlarms } from '../reminders';
import { useLibraryStore } from '../store/libraryStore';

const RECONCILE_AFTER_MS = 600;
let asked = false;

export function useEventAlarms(open: (event: PressedEvent) => void): void {
  const events = useLibraryStore(s => s.events);
  const feeds = useLibraryStore(s => s.feeds);
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
      later(reconcileAlarms());
    }, RECONCILE_AFTER_MS);
    return () => clearTimeout(timer.current);
  }, [events, feeds, locale, onboarded]);

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
