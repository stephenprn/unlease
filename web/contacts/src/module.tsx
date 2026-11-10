/**
 * Contacts' web app: everything it brings to the shell (`shared/modules`). The people, their
 * numbers, e-mails, addresses, birthdays and notes, the favourites, the labels, the import from
 * Google and the export as vCard, the bin; a contact in the spotlight, and « Créer un contact » (C).
 */
import { t, tx } from '@unlease/core/i18n';
import { isLive } from '@unlease/contacts/models/contacts';
import { CONTACTS_SETTINGS_PLACES } from '@unlease/contacts/services/settingsPlaces';

import { emptyContactsBin } from './app/store/actions';
import { clearSelection, setImportFile, useContactsUi } from './app/store/contactsUi';
import { useContactsStore } from './app/store/library';
import type { AppModule, SpotLabel } from '@shared/modules';
import { navigate } from '@shared/ui/router';
import { contactsData } from './data';
import { contactsBackTo, ContactsBottomBar, ContactsHeaderActions, ContactsNav, ContactsNavFoot, contactsOpened, contactsPathOf, ContactsScreen, contactsStillThere, useContactsTitle } from './ui/ContactsShell';
import { exportContacts } from './ui/features/exporting';
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
    { title: tx('Créer un contact'), icon: 'personPlus', key: 'c', run: () => openNewContact() },
    { title: tx('Importer des contacts'), icon: 'download', run: () => navigate(paths.import) },
    { title: tx('Exporter tous les contacts'), icon: 'upload', run: () => exportContacts(Object.values(useContactsStore.getState().contacts).filter(isLive)) },
    { title: tx('Anniversaires'), icon: 'cake', run: () => navigate(paths.birthdays) },
  ],
  spotCreates: [{ type: 'contact', title: typed => t('Créer le contact « {name} »', { name: typed }), icon: 'personPlus', run: typed => openNewContact(typed) }],
  // Escape ends a pick before the search.
  onKey: event => {
    if (event.key !== 'Escape' || useContactsUi.getState().selection.size === 0) return false;
    clearSelection();
    return true;
  },
  // A vCard or a CSV dropped anywhere: the import page reads it.
  onDropFiles: files => {
    const file = files.find(each => /\.(vcf|vcard|csv)$/i.test(each.name) || /vcard|csv/i.test(each.type));
    if (!file) return false;
    setImportFile(file);
    navigate(paths.import);
    return true;
  },
  shortcuts: [{ keys: 'C', label: tx('Créer un contact') }],

  settingsSections: CONTACTS_SETTINGS,
  emptyBin: () => emptyContactsBin(),
  settingsPlaces: CONTACTS_SETTINGS_PLACES,
};
