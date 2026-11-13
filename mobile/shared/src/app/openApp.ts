/**
 * A place in another app of the suite (a page of Pages from Carnet, a note of Carnet from Pages):
 * opened in that app when it is installed on this phone (its scheme, `appScheme(id)`), else in the
 * suite's web app on the server (`<server>/<web path>`).
 */
import { Linking } from 'react-native';

import { APPS, type AppId } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';

import { useSettingsStore } from './store/settingsStore';
import { showSnack } from './store/uiStore';
import { appScheme } from './variant';

export interface SuitePlace {
  /** After the app's scheme: `page/<id>` opens `unlease-pages://page/<id>`; '' its home. */
  readonly phone: string;
  /** After the server's address: `/pages/<id>`. */
  readonly web: string;
}

/** The place in Pages for a page (`unlease-pages://page/<id>`, `<server>/pages/<id>`); its home without one. */
export const pagePlace = (id?: string | null): SuitePlace => (id ? { phone: `page/${id}`, web: `/pages/${id}` } : { phone: '', web: '/pages' });

/** A place in Carnet: a note, a collection or a link (`carnet://note/<id>`, `<server>/notes/note/<id>`); its board without one. */
export const notesPlace = (type?: 'note' | 'line' | 'link', id?: string): SuitePlace => (type && id ? { phone: `${type}/${id}`, web: `/notes/${type}/${id}` } : { phone: '', web: '/notes' });

/** A contact in Contacts (`unlease-contacts://contact/<id>`, on the web `/contacts/contact/<id>`); its list without one. */
export const contactPlace = (id?: string | null): SuitePlace => (id ? { phone: `contact/${id}`, web: `/contacts/contact/${id}` } : { phone: '', web: '/contacts' });

/** An event in Agenda (`unlease-agenda://event/<id>`, on the web `/agenda/event/<id>`); its calendar without one. */
export const eventPlace = (id?: string | null): SuitePlace => (id ? { phone: `event/${id}`, web: `/agenda/event/${id}` } : { phone: '', web: '/agenda' });

/** A new event in Agenda, its form filled from a draft (`unlease-agenda://new?…`, on the web `/agenda/new?…`). */
export const newEventPlace = (query: string): SuitePlace => ({ phone: `new?${query}`, web: `/agenda/new?${query}` });

/** An app's home: Carnet's board, Pages' pages, the contacts, the calendar. */
export function appHome(app: AppId): SuitePlace {
  switch (app) {
    case 'notes':
      return notesPlace();
    case 'pages':
      return pagePlace();
    case 'contacts':
      return contactPlace();
    case 'calendar':
      return eventPlace();
    default:
      return { phone: '', web: `/${APPS[app as AppId].slug}` };
  }
}

/** Whether it opened (in the app, or on the web); a slip says why not otherwise. */
export async function openInApp(app: AppId, place: SuitePlace): Promise<boolean> {
  try {
    // Android answers only for the apps the manifest names (`<queries>`): the suite's are there.
    await Linking.openURL(`${appScheme(app)}://${place.phone}`);
    return true;
  } catch {
    // Not installed here: the web app on the server, when there is one.
  }
  const server = useSettingsStore.getState().server;
  if (server) {
    try {
      await Linking.openURL(`${server.url}${place.web}`);
      return true;
    } catch {
      // Nothing opens web addresses either.
    }
  }
  showSnack(t('Could not open {app}: install its app, or connect a server.', { app: APPS[app].name }), undefined, { tone: 'error' });
  return false;
}
