/**
 * The web apps (their folder under `web/`, their id) and where each is served (`/notes/`, `/agenda/`),
 * the folder of its build (`dist/agenda/`): the app's id but for Agenda, whose addresses say what it
 * is in the suite's language. No shared package here: the config loader reads this file as it is.
 */
export type WebApp = 'notes' | 'pages' | 'contacts' | 'calendar';

export const WEB_PATHS: Readonly<Record<WebApp, string>> = { notes: 'notes', pages: 'pages', contacts: 'contacts', calendar: 'agenda' };

export const webPath = (app: WebApp): string => WEB_PATHS[app];
