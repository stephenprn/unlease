/**
 * Contacts' records as a web app holds them: its own, and those of an app that shows contacts (Pages'
 * mentions), which syncs their records and keeps them as Contacts does. Its state, what this browser
 * remembers of it, its photos waiting to be sent, and the address of a contact in Contacts' own web
 * app. A leaf: it pulls in none of Contacts' screens.
 */
import type { AppData } from '@shared/modules';
import { markPhotoUploaded } from './app/store/actions';
import { resetContactsUi } from './app/store/contactsUi';
import { contactsProjection, useContactsStore } from './app/store/library';
import { loadPrefs, resetPrefs } from './app/store/prefs';
import { paths } from './ui/routes';

export const contactsData: AppData = {
  id: 'contacts',
  projection: contactsProjection,
  load: loadPrefs,
  reset: () => {
    resetPrefs();
    resetContactsUi();
  },
  // A photo picked here, kept in this browser until the server has it (two contacts may share one after a merge).
  fileOwner: id => {
    const owners = Object.values(useContactsStore.getState().contacts).filter(contact => contact.photoId === id);
    if (owners.length === 0) return null;
    const live = owners.find(contact => contact.deletedAt === null && !contact.photoUploaded);
    return { done: !live, mime: (live ?? owners[0]!).photoMime || 'image/jpeg', image: true, mark: () => markPhotoUploaded(id) };
  },
  refPaths: { contact: paths.contact },
};
