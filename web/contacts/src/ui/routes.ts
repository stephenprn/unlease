/**
 * Contacts' places, all under `/contacts`: every contact, the favourites, the birthdays, a label's
 * contacts, the labels, the import, the duplicates, the bin, a contact (`/contacts/contact/<id>`, the address other
 * apps' references open: `suitePlaces`), its form, and a new contact's.
 */
import { decodePart, type Route } from '@shared/ui/router';

declare module '@shared/ui/router' {
  interface Routes {
    readonly contacts: object;
    readonly contactsFavorites: object;
    readonly contactsBirthdays: object;
    readonly contactsLabel: { readonly id: string };
    readonly contactsLabels: object;
    readonly contactsImport: object;
    readonly contactsDuplicates: object;
    readonly contactsTrash: object;
    readonly contact: { readonly id: string };
    readonly contactEdit: { readonly id: string };
    readonly contactNew: object;
  }
}

export const CONTACTS_ROUTES = [
  'contacts',
  'contactsFavorites',
  'contactsBirthdays',
  'contactsLabel',
  'contactsLabels',
  'contactsImport',
  'contactsDuplicates',
  'contactsTrash',
  'contact',
  'contactEdit',
  'contactNew',
] as const satisfies readonly Route['name'][];

export const HOME = '/contacts';

const FIXED: Readonly<Record<string, Route>> = {
  [HOME]: { name: 'contacts' },
  [`${HOME}/favorites`]: { name: 'contactsFavorites' },
  [`${HOME}/birthdays`]: { name: 'contactsBirthdays' },
  [`${HOME}/labels`]: { name: 'contactsLabels' },
  [`${HOME}/import`]: { name: 'contactsImport' },
  [`${HOME}/duplicates`]: { name: 'contactsDuplicates' },
  [`${HOME}/trash`]: { name: 'contactsTrash' },
  [`${HOME}/new`]: { name: 'contactNew' },
};

export function parseContactsRoute(path: string): Route | null {
  const fixed = FIXED[path];
  if (fixed) return fixed;
  const label = /^\/contacts\/label\/([^/]+)$/.exec(path);
  if (label) return { name: 'contactsLabel', id: decodePart(label[1]!) };
  const contact = /^\/contacts\/contact\/([^/]+)(\/edit)?$/.exec(path);
  if (contact) return contact[2] ? { name: 'contactEdit', id: decodePart(contact[1]!) } : { name: 'contact', id: decodePart(contact[1]!) };
  return null;
}

/** Contacts' places (the shell's, `settings` and `admin`, are `@shared/ui/router`'s `paths`). */
export const paths = {
  contacts: HOME,
  favorites: `${HOME}/favorites`,
  birthdays: `${HOME}/birthdays`,
  labels: `${HOME}/labels`,
  import: `${HOME}/import`,
  duplicates: `${HOME}/duplicates`,
  trash: `${HOME}/trash`,
  newContact: `${HOME}/new`,
  label: (id: string): string => `${HOME}/label/${encodeURIComponent(id)}`,
  contact: (id: string): string => `${HOME}/contact/${encodeURIComponent(id)}`,
  edit: (id: string): string => `${HOME}/contact/${encodeURIComponent(id)}/edit`,
} as const;
