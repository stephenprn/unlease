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
import { calendarEraseParts } from '@unlease/calendar/services/erase';
import { instantToDay } from '@unlease/calendar/services/time';
import { CALENDAR_SETTINGS_PLACES } from '@unlease/calendar/services/settingsPlaces';

import type { AppModule, ShortcutGroup } from '@shared/modules';
import { navigate, paths as shellPaths, type Route } from '@shared/ui/router';
import { CALENDAR_ADMIN_SECTIONS } from './admin';
import { refreshNotifications } from './app/push';
import { isCalendarFile } from './app/importFiles';
import { binnedEvents, emptyBin, eraseCalendar } from './app/store/actions';
import { closePeek, closeQuick, setImportFiles, useCalendarUi } from './app/store/calendarUi';
import { useCalendarStore } from './app/store/library';
import { usePrefsStore } from './app/store/prefs';
import { calendarData } from './data';
import { calendarBackTo, CalendarBottomBar, CalendarHeaderActions, CalendarNav, CalendarNavFoot, calendarOpened, calendarPathOf, CalendarScreens, calendarStillThere, quickAdd, useCalendarTitle } from './ui/CalendarShell';
import { CalendarOverlays } from './ui/features/Overlays';
import { CALENDAR_SETTINGS } from './ui/features/settings/CalendarSettings';
import { CALENDAR_SPOT_KINDS } from './ui/features/spotlight/kinds';
import { exportCalendar } from './ui/features/exporting';
import { CalendarImport } from './ui/features/importing/CalendarImport';
import { CALENDAR_ROUTES, HOME, parseCalendarRoute, paths } from './ui/routes';

/** The view and day on screen, when the calendar is. */
function shown(route: Route): { view: CalendarView; day: string } | null {
  if (route.name !== 'agenda') return null;
  return { view: route.view ?? usePrefsStore.getState().view, day: route.day ?? instantToDay(Date.now()) };
}

const VIEW_OF_KEY = Object.fromEntries(Object.entries(VIEW_KEYS).map(([view, key]) => [key, view as CalendarView]));

/** Each view under its name in the shortcuts dialog (French: read where shown), « Aujourd'hui » last. */
const VIEW_TITLES: Readonly<Record<CalendarView, string>> = {
  day: tx('Jour'),
  threeDays: tx('3 jours'),
  week: tx('Semaine'),
  month: tx('Mois'),
  year: tx('Année'),
  schedule: tx('Planning'),
  today: tx('Aujourd’hui : la journée d’un coup d’œil'),
};

/** Its keys in the shortcuts dialog beyond its commands' (C, T): the calendar's (`onKey`). */
const CALENDAR_SHORTCUTS: readonly ShortcutGroup[] = [
  {
    title: tx('Dans l’agenda'),
    rows: [
      [['J'], tx('Période suivante')],
      [['K'], tx('Période précédente')],
      ...(Object.keys(VIEW_TITLES) as CalendarView[]).map(view => [[VIEW_KEYS[view].toUpperCase()], VIEW_TITLES[view]] as const),
    ],
  },
];

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
  // Its foot's « Importer un agenda » is the chosen row on Réglages' import page.
  navMarks: ['import'],
  HeaderActions: CalendarHeaderActions,
  BottomBar: CalendarBottomBar,
  searchHome: HOME,

  spotKinds: CALENDAR_SPOT_KINDS,
  commands: [
    { title: tx('Créer un événement'), icon: 'plus', key: 'c', run: () => navigate(paths.newEvent()) },
    { title: tx('Aujourd’hui'), icon: 'calendar', key: 't', run: () => navigate(paths.view(usePrefsStore.getState().view, instantToDay(Date.now()))) },
    { title: tx('Importer un agenda'), icon: 'download', run: () => navigate(shellPaths.importer) },
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
  // An `.ics` or Google's `.zip` dropped anywhere: the import reads it, straight to its preview.
  onDropFiles: files => {
    const calendars = files.filter(isCalendarFile);
    if (calendars.length === 0) return false;
    setImportFiles(calendars);
    navigate(shellPaths.importer);
    return true;
  },
  shortcuts: CALENDAR_SHORTCUTS,

  settingsSections: CALENDAR_SETTINGS,
  importer: {
    source: () => t('Google Agenda'),
    meta: () => t('Un fichier .ics : l’export de Google Agenda, une invitation'),
    Wizard: CalendarImport,
  },
  erase: {
    parts: () => {
      const { events, labels, feeds } = useCalendarStore.getState();
      return calendarEraseParts({ events, labels, feeds });
    },
    run: chosen => eraseCalendar(chosen),
  },
  emptyBin: () => emptyBin(),
  binCount: () => binnedEvents().length,
  adminSections: CALENDAR_ADMIN_SECTIONS,
  settingsPlaces: CALENDAR_SETTINGS_PLACES,
};
