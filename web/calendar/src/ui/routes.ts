/**
 * Agenda's places, all under `/agenda`: « Aujourd'hui » (`/agenda/today`), a view at a day (`/agenda/week/2026-11-02`), an event
 * (`/agenda/event/<id>?at=<occurrence>`, the address other apps' references open: `suitePlaces`),
 * its form, a new event's (`/agenda/new?start=…&title=…`, prefilled by a quick add, Claude or
 * Carnet's « Ajouter à l'agenda »), a birthday, the labels, a label's events, the subscriptions, the
 * bin. `/agenda` itself opens on the view and the day chosen last. The import is Réglages' page
 * (`/agenda/settings/import`, the shell's `paths.importer`): its old address, `/agenda/import`, leads there.
 */
import type { CalendarView } from '@unlease/calendar/services/eventText';

import { decodePart, type Route } from '@shared/ui/router';

declare module '@shared/ui/router' {
  interface Routes {
    readonly agenda: { readonly view: CalendarView | null; readonly day: string | null };
    readonly agendaEvent: { readonly id: string };
    readonly agendaEdit: { readonly id: string };
    readonly agendaNew: object;
    readonly agendaBirthday: { readonly id: string };
    readonly agendaLabels: object;
    readonly agendaLabel: { readonly id: string };
    readonly agendaFeeds: object;
    readonly agendaImport: object;
    readonly agendaTrash: object;
  }
}

export const CALENDAR_ROUTES = ['agenda', 'agendaEvent', 'agendaEdit', 'agendaNew', 'agendaBirthday', 'agendaLabels', 'agendaLabel', 'agendaFeeds', 'agendaImport', 'agendaTrash'] as const satisfies readonly Route['name'][];

export const HOME = '/agenda';

/** A view's part of the address (`3days` for « 3 jours »). */
const VIEW_PARTS: Readonly<Record<CalendarView, string>> = { today: 'today', day: 'day', threeDays: '3days', week: 'week', month: 'month', year: 'year', schedule: 'schedule' };
const VIEW_OF_PART: Readonly<Record<string, CalendarView>> = Object.fromEntries(Object.entries(VIEW_PARTS).map(([view, part]) => [part, view as CalendarView]));

const FIXED: Readonly<Record<string, Route>> = {
  [HOME]: { name: 'agenda', view: null, day: null },
  [`${HOME}/new`]: { name: 'agendaNew' },
  [`${HOME}/labels`]: { name: 'agendaLabels' },
  [`${HOME}/feeds`]: { name: 'agendaFeeds' },
  [`${HOME}/import`]: { name: 'agendaImport' },
  [`${HOME}/trash`]: { name: 'agendaTrash' },
};

/** A day as an address writes it, or a year (`2026`) read as its first day. */
function dayPart(value: string | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}$/.test(value)) return `${value}-01-01`;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function parseCalendarRoute(path: string): Route | null {
  const fixed = FIXED[path];
  if (fixed) return fixed;
  const view = /^\/agenda\/(today|day|3days|week|month|year|schedule)(?:\/([\d-]+))?$/.exec(path);
  if (view) return { name: 'agenda', view: VIEW_OF_PART[view[1]!]!, day: dayPart(view[2]) };
  const event = /^\/agenda\/event\/([^/]+)(\/edit)?$/.exec(path);
  if (event) return event[2] ? { name: 'agendaEdit', id: decodePart(event[1]!) } : { name: 'agendaEvent', id: decodePart(event[1]!) };
  const birthday = /^\/agenda\/birthday\/([^/]+)$/.exec(path);
  if (birthday) return { name: 'agendaBirthday', id: decodePart(birthday[1]!) };
  const label = /^\/agenda\/label\/([^/]+)$/.exec(path);
  if (label) return { name: 'agendaLabel', id: decodePart(label[1]!) };
  return null;
}

const part = encodeURIComponent;
const at = (occurrence?: string | null): string => (occurrence ? `?at=${part(occurrence)}` : '');

/** Agenda's places (the shell's, `settings` and `admin`, are `@shared/ui/router`'s `paths`). */
export const paths = {
  home: HOME,
  /** A view at a day; « Aujourd'hui » is today's, whatever the day (`/agenda/today`). */
  view: (view: CalendarView, day: string): string => (view === 'today' ? `${HOME}/today` : `${HOME}/${VIEW_PARTS[view]}/${view === 'year' ? day.slice(0, 4) : day}`),
  event: (id: string, occurrence?: string | null): string => `${HOME}/event/${part(id)}${at(occurrence)}`,
  edit: (id: string, occurrence?: string | null): string => `${HOME}/event/${part(id)}/edit${at(occurrence)}`,
  /** A new event's form, its fields filled from `query` (`start`, `end`, `title`, `place`, `tz`, `url`, `link`, `description` or Carnet's `notes`). */
  newEvent: (query: Readonly<Record<string, string | undefined>> = {}): string => {
    const search = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '')).toString();
    return `${HOME}/new${search ? `?${search}` : ''}`;
  },
  birthday: (contactId: string): string => `${HOME}/birthday/${part(contactId)}`,
  labels: `${HOME}/labels`,
  label: (id: string): string => `${HOME}/label/${part(id)}`,
  feeds: `${HOME}/feeds`,
  /** The import's old address: it leads to Réglages' (`@shared/ui/router`'s `paths.importer`). */
  import: `${HOME}/import`,
  trash: `${HOME}/trash`,
} as const;
