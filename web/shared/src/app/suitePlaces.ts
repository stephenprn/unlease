/**
 * Where a thing of the suite lives on the web, whichever app this is: each app is a web app of its
 * own, at its own path on the same server (`/notes/…`, `/pages/…`, `/contacts/…`), so a reference into another app
 * (a page from Carnet, a note from Pages) is that app's address, opened in its own page. The
 * phone's twin is `mobile/shared/src/app/openApp.ts` (the same paths after the server's address).
 */
import type { AppId } from '@unlease/core/apps';
import { isRefType, type RefType } from '@unlease/core/refs';

const part = encodeURIComponent;

/** Each app's home on the web: its id, but Agenda's `/agenda` (as the build's `WEB_PATHS`). */
const WEB_HOMES: Readonly<Record<AppId, string>> = { notes: '/notes', pages: '/pages', contacts: '/contacts', calendar: '/agenda' };

/** An app's home on the web (`/agenda` for Agenda, whose id is `calendar`). */
export const appHome = (app: AppId): string => WEB_HOMES[app];

/** Each type's address, in the app that shows it. */
const WEB_PLACES: Readonly<Record<RefType, (id: string) => string>> = {
  note: id => `/notes/note/${part(id)}`,
  link: id => `/notes/link/${part(id)}`,
  page: id => `/pages/${part(id)}`,
  contact: id => `/contacts/contact/${part(id)}`,
  event: id => `/agenda/event/${part(id)}`,
};

/** A reference's address in the app that has it; null for a type this build does not know. */
export function suitePlace(type: string, id: string): string | null {
  return isRefType(type) ? WEB_PLACES[type](id) : null;
}
