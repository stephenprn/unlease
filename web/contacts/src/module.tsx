/**
 * Contacts' web app: everything it brings to the shell (`shared/modules`). The people, their
 * numbers, e-mails, addresses, birthdays and notes, the favourites, the labels, the import from
 * Google and the export as vCard, the bin; a contact in the spotlight, and « Créer un contact » (C).
 */
import { t, tx } from '@unlease/core/i18n';
import { isLive } from '@unlease/contacts/models/contacts';
import { eraseParts } from '@unlease/contacts/services/erase';
import { CONTACTS_SETTINGS_PLACES } from '@unlease/contacts/services/settingsPlaces';

import { binnedContacts, emptyContactsBin, eraseContacts, trashContacts } from './app/store/actions';
import { clearSelection, setImportFile, useContactsUi } from './app/store/contactsUi';
import { useContactsStore } from './app/store/library';
import { showUndo } from '@shared/app/store/ui';
import type { AppModule, ShortcutGroup, SpotLabel } from '@shared/modules';
import { navigate, paths as shellPaths } from '@shared/ui/router';
import { contactsData } from './data';
import { contactsBackTo, ContactsBottomBar, ContactsHeaderActions, ContactsNav, ContactsNavFoot, contactsOpened, contactsPathOf, ContactsScreen, contactsStillThere, useContactsTitle } from './ui/ContactsShell';
import { exportContacts } from './ui/features/exporting';
import { ContactsImport } from './ui/features/importing/ContactsImport';
import { openNewContact } from './ui/features/newContact';
import { ContactsHeaderCover, useSelecting } from './ui/features/SelectionBar';
import { CONTACTS_SETTINGS } from './ui/features/settings/ContactsSettings';
import { CONTACTS_SPOT_KINDS } from './ui/features/spotlight/kinds';
import { CONTACTS_ROUTES, HOME, parseContactsRoute, paths } from './ui/routes';

let labelsCache: { readonly state: ReturnType<typeof useContactsStore.getState>; readonly labels: readonly SpotLabel[] } | null = null;

/** The live labels and how many live contacts wear each: the spotlight's # filter. */
function spotLabels(): readonly SpotLabel[] {
  const state = useContactsStore.getState();
  if (labelsCache?.state === state) return labelsCache.labels;
  const counts = new Map<string, number>();
  for (const contact of Object.values(state.contacts)) {
    if (!isLive(contact)) continue;
    for (const id of contact.labelIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const labels = Object.values(state.labels)
    .filter(label => label.deletedAt === null)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(label => ({ id: label.id, name: label.name, color: label.color, notes: counts.get(label.id) ?? 0 }));
  labelsCache = { state, labels };
  return labels;
}

/** Its keys in the shortcuts dialog beyond its commands' (C): a pick's. */
const CONTACTS_SHORTCUTS: readonly ShortcutGroup[] = [
  {
    title: tx('Selected contacts'),
    rows: [
      [['#'], tx('Delete')],
      [[tx('Shift'), tx('click')], tx('Select up to this contact')],
    ],
  },
];

export const contactsModule: AppModule = {
  id: 'contacts',
  home: HOME,
  data: contactsData,

  routes: { names: CONTACTS_ROUTES, parse: parseContactsRoute },
  Screen: ContactsScreen,
  pathOf: contactsPathOf,
  isHome: route => route.name === 'contacts',
  backTo: contactsBackTo,
  useTitle: page => useContactsTitle(page),
  stillThere: contactsStillThere,
  opened: contactsOpened,
  onPageChange: clearSelection,

  Nav: ContactsNav,
  NavFoot: ContactsNavFoot,
  HeaderActions: ContactsHeaderActions,
  HeaderCover: ContactsHeaderCover,
  useHeaderCovered: useSelecting,
  BottomBar: ContactsBottomBar,
  searchHome: HOME,

  spotKinds: CONTACTS_SPOT_KINDS,
  spotLabels,
  commands: [
    { title: tx('Create contact'), icon: 'personPlus', key: 'c', run: () => openNewContact() },
    { title: tx('Import contacts'), icon: 'download', run: () => navigate(shellPaths.importer) },
    { title: tx('Export all contacts'), icon: 'upload', run: () => exportContacts(Object.values(useContactsStore.getState().contacts).filter(isLive)) },
    { title: tx('Birthdays'), icon: 'cake', run: () => navigate(paths.birthdays) },
  ],
  spotCreates: [{ type: 'contact', title: typed => t('Create the contact “{name}”', { name: typed }), icon: 'personPlus', run: typed => openNewContact(typed) }],
  // Escape ends a pick before the search; # sends what is picked to the bin, as the selection bar's « Supprimer » (in the bin, deleting for good asks first: its bar).
  onKey: (event, route) => {
    const picked = useContactsUi.getState().selection;
    if (picked.size === 0) return false;
    if (event.key === 'Escape') {
      clearSelection();
      return true;
    }
    if (event.key !== '#' || route.name === 'contactsTrash') return false;
    const contacts = useContactsStore.getState().contacts;
    const ids = [...picked].filter(id => contacts[id] && isLive(contacts[id]));
    if (ids.length === 0) return false;
    const undo = trashContacts(ids);
    clearSelection();
    showUndo(ids.length > 1 ? t('Contacts moved to the bin') : t('Contact moved to the bin'), undo);
    return true;
  },
  shortcuts: CONTACTS_SHORTCUTS,
  // A vCard or a CSV dropped anywhere: the import's wizard reads it, straight to its preview.
  onDropFiles: files => {
    const file = files.find(each => /\.(vcf|vcard|csv)$/i.test(each.name) || /vcard|csv/i.test(each.type));
    if (!file) return false;
    setImportFile(file);
    navigate(shellPaths.importer);
    return true;
  },

  settingsSections: CONTACTS_SETTINGS,
  emptyBin: () => emptyContactsBin(),
  binCount: () => binnedContacts().length,
  importer: {
    // A product's name, the same in every language.
    source: () => 'Google Contacts',
    meta: () => t('A file exported from Google Contacts (.vcf or .csv)'),
    Wizard: ContactsImport,
  },
  erase: {
    parts: () => eraseParts(useContactsStore.getState()),
    run: chosen => eraseContacts(chosen),
  },
  settingsPlaces: CONTACTS_SETTINGS_PLACES,
};
