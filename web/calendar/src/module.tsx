/**
 * Agenda's web app: everything it brings to the shell (`shared/modules`). The views (a day, three
 * days, a week, a month, a year, the planning), events and their forms, the labels, the calendars
 * subscribed to and the holidays, the birthdays, Carnet's reminders and Pages' dates beside them,
 * the import and the export, the bin; an event in the spotlight, « Créer un événement » (C), the
 * views' keys (Google's: D, X, W, M, Y, A; T today; J and K forward and back; O « Aujourd'hui », the
 * day at a glance).
 */
import { t, tx } from '@unlease/core/i18n';
import { PERIOD_VIEWS, stepDay, VIEW_KEYS, VIEW_NAMES, type CalendarView } from '@unlease/calendar/services/eventText';
import { instantToDay } from '@unlease/calendar/services/time';
import { CALENDAR_SETTINGS_PLACES } from '@unlease/calendar/services/settingsPlaces';

import type { AppModule } from '@shared/modules';
import { navigate, type Route } from '@shared/ui/router';
import { CALENDAR_ADMIN_SECTIONS } from './admin';
import { refreshNotifications } from './app/push';
import { emptyBin } from './app/store/actions';
import { closePeek, closeQuick, setImportFile, useCalendarUi } from './app/store/calendarUi';
import { usePrefsStore } from './app/store/prefs';
import { calendarData } from './data';
import { calendarBackTo, CalendarBottomBar, CalendarHeaderActions, CalendarNav, CalendarNavFoot, calendarOpened, calendarPathOf, CalendarScreens, calendarStillThere, quickAdd, useCalendarTitle } from './ui/CalendarShell';
import { CalendarOverlays } from './ui/features/Overlays';
import { CALENDAR_SETTINGS } from './ui/features/settings/CalendarSettings';
import { CALENDAR_SPOT_KINDS } from './ui/features/spotlight/kinds';
import { exportCalendar } from './ui/features/exporting';
import { CALENDAR_ROUTES, HOME, parseCalendarRoute, paths } from './ui/routes';

/** The view and day on screen, when the calendar is. */
function shown(route: Route): { view: CalendarView; day: string } | null {
  if (route.name !== 'agenda') return null;
  return { view: route.view ?? usePrefsStore.getState().view, day: route.day ?? instantToDay(Date.now()) };
}

const VIEW_OF_KEY = Object.fromEntries(Object.entries(VIEW_KEYS).map(([view, key]) => [key, view as CalendarView]));

export const calendarModule: AppModule = {
  id: 'calendar',
  home: HOME,
  data: calendarData,
  // The browser's push subscription told to the server again: it may have changed on its own.
  start: () => void refreshNotifications(),

  routes: { names: CALENDAR_ROUTES, parse: parseCalendarRoute },
  Screen: CalendarScreens,
  pathOf: calendarPathOf,
  isHome: route => route.name === 'agenda',
  backTo: calendarBackTo,
  useTitle: page => useCalendarTitle(page),
  stillThere: calendarStillThere,
  opened: calendarOpened,
  onPageChange: () => {
    closePeek();
    closeQuick();
  },
  Overlays: CalendarOverlays,

  Nav: CalendarNav,
  NavFoot: CalendarNavFoot,
  HeaderActions: CalendarHeaderActions,
  BottomBar: CalendarBottomBar,
  searchHome: HOME,

  spotKinds: CALENDAR_SPOT_KINDS,
  commands: [
    { title: tx('Créer un événement'), icon: 'plus', key: 'c', run: () => navigate(paths.newEvent()) },
    { title: tx('Aujourd’hui'), icon: 'calendar', key: 't', run: () => navigate(paths.view(usePrefsStore.getState().view, instantToDay(Date.now()))) },
    { title: tx('Importer un agenda'), icon: 'download', run: () => navigate(paths.import) },
    { title: tx('Exporter mon agenda'), icon: 'upload', run: exportCalendar },
    { title: tx('Autres agendas'), icon: 'calendar', run: () => navigate(paths.feeds) },
    // « Aujourd'hui » the view, told apart from « Aujourd'hui » the day (T) by what it is.
    { title: tx('Aujourd’hui : la journée d’un coup d’œil'), icon: 'today', run: () => navigate(paths.view('today', instantToDay(Date.now()))) },
    ...PERIOD_VIEWS.map(view => ({ title: VIEW_NAMES[view], icon: 'calendar' as const, run: () => navigate(paths.view(view, instantToDay(Date.now()))) })),
  ],
  spotCreates: [{ type: 'event', title: typed => t('Créer l’événement « {title} »', { title: typed }), icon: 'plus', run: typed => void quickAdd(typed) }],
  onKey: (event, route) => {
    const place = shown(route);
    if (!place || event.metaKey || event.ctrlKey || event.altKey) return false;
    if (event.key === 'Escape' && (useCalendarUi.getState().peek || useCalendarUi.getState().quick)) {
      closePeek();
      closeQuick();
      return true;
    }
    const key = event.key.toLowerCase();
    // « Aujourd'hui » never turns: its arrows are the page's.
    const turns = place.view !== 'today';
    if (turns && (key === 'j' || key === 'n' || event.key === 'ArrowRight')) {
      navigate(paths.view(place.view, stepDay(place.view, place.day, 1)), { replace: true });
      return true;
    }
    if (turns && (key === 'k' || key === 'p' || event.key === 'ArrowLeft')) {
      navigate(paths.view(place.view, stepDay(place.view, place.day, -1)), { replace: true });
      return true;
    }
    const view = VIEW_OF_KEY[key];
    if (view) {
      navigate(paths.view(view, place.day));
      return true;
    }
    return false;
  },
  // An `.ics` dropped anywhere: the import page reads it.
  onDropFiles: files => {
    const file = files.find(each => /\.ics$/i.test(each.name) || /calendar/i.test(each.type));
    if (!file) return false;
    setImportFile(file);
    navigate(paths.import);
    return true;
  },
  shortcuts: [
    { keys: 'C', label: tx('Créer un événement') },
    { keys: 'T', label: tx('Aujourd’hui') },
    { keys: 'J / K', label: tx('Période suivante, précédente') },
    { keys: 'D X W M Y A', label: tx('Jour, 3 jours, semaine, mois, année, planning') },
    { keys: 'O', label: tx('Aujourd’hui : la journée d’un coup d’œil') },
  ],

  settingsSections: CALENDAR_SETTINGS,
  emptyBin: () => emptyBin(),
  adminSections: CALENDAR_ADMIN_SECTIONS,
  settingsPlaces: CALENDAR_SETTINGS_PLACES,
};
