/**
 * Contacts' places as the shell draws them, and its frame: the navigation (Google Contacts' side:
 * every contact, the favourites, the birthdays, the labels by their tags, the duplicates; the bin at its
 * foot; the import and the export live in Réglages › Données, as on the phone), « Créer un contact » beside the search and as the pebble at the foot of a phone-sized
 * list, the tab's title of each place.
 */
import { useRef, useState, type AnimationEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { spotKey } from '@unlease/core/services/spotlight';
import { isLive } from '@unlease/contacts/models/contacts';
import { upcomingBirthdays } from '@unlease/contacts/services/birthdays';
import { contactName } from '@unlease/contacts/services/names';

import { useMinute } from '@shared/app/hooks/useMinute';
import { useDuplicates, useLabelCounts, useLiveContacts, useLiveLabels } from '../app/hooks/useContacts';
import { useContactsStore, type ContactsState } from '../app/store/library';
import { Icon } from '@shared/ui/components/Icon';
import { LabelTag } from '@shared/ui/components/LabelMark';
import { usePresence } from '@shared/ui/components/presence';
import { NavAction, NavFold, NavGlyph, NavRow, navStyles } from '@shared/ui/navigation/NavParts';
import shell from '@shared/ui/navigation/shell.module.css';
import { Link, navigate, paths as shellPaths, type Arrival, type Route } from '@shared/ui/router';
import { openNewContact } from './features/newContact';
import { paths } from './routes';
import { BirthdaysScreen } from './screens/BirthdaysScreen';
import { ContactScreen } from './screens/ContactScreen';
import { DuplicatesScreen } from './screens/DuplicatesScreen';
import { EditContactScreen, NewContactScreen } from './screens/EditScreen';
import { ImportScreen } from './screens/ImportScreen';
import { LabelsScreen } from './screens/LabelsScreen';
import { ListScreen } from './screens/ListScreen';
import { TrashScreen } from './screens/TrashScreen';

export function ContactsScreen({ route }: { route: Route }) {
  switch (route.name) {
    case 'contacts':
    case 'contactsFavorites':
    case 'contactsLabel':
      return <ListScreen route={route} />;
    case 'contactsBirthdays':
      return <BirthdaysScreen />;
    case 'contactsLabels':
      return <LabelsScreen />;
    case 'contactsImport':
      return <ImportScreen />;
    case 'contactsDuplicates':
      return <DuplicatesScreen />;
    case 'contactsTrash':
      return <TrashScreen />;
    case 'contact':
      return <ContactScreen key={route.id} id={route.id} />;
    case 'contactEdit':
      return <EditContactScreen key={route.id} id={route.id} />;
    case 'contactNew':
      return <NewContactScreen />;
    default:
      return null;
  }
}

function titleFor(state: ContactsState, route: Route): string | null {
  switch (route.name) {
    case 'contactsFavorites':
      return t('Favoris');
    case 'contactsBirthdays':
      return t('Anniversaires');
    case 'contactsLabel':
      return state.labels[route.id]?.name ?? t('Libellés');
    case 'contactsLabels':
      return t('Libellés');
    case 'contactsImport':
      return t('Importer');
    case 'contactsDuplicates':
      return t('Doublons');
    case 'contactsTrash':
      return t('Corbeille');
    case 'contact':
    case 'contactEdit': {
      const contact = state.contacts[route.id];
      return contact ? contactName(contact) : null;
    }
    case 'contactNew':
      return t('Créer un contact');
    default:
      return null;
  }
}

export const useContactsTitle = (page: Route): string | null => useContactsStore(state => titleFor(state, page));

export function contactsPathOf(route: Route): string {
  switch (route.name) {
    case 'contactsFavorites':
      return paths.favorites;
    case 'contactsBirthdays':
      return paths.birthdays;
    case 'contactsLabel':
      return paths.label(route.id);
    case 'contactsLabels':
      return paths.labels;
    case 'contactsImport':
      return paths.import;
    case 'contactsDuplicates':
      return paths.duplicates;
    case 'contactsTrash':
      return paths.trash;
    case 'contact':
      return paths.contact(route.id);
    case 'contactEdit':
      return paths.edit(route.id);
    case 'contactNew':
      return paths.newContact;
    default:
      return paths.contacts;
  }
}

/** A contact is still there to go back to (not in the bin), a label too. */
export function contactsStillThere(route: Route): boolean {
  const state = useContactsStore.getState();
  if (route.name === 'contact' || route.name === 'contactEdit') {
    const contact = state.contacts[route.id];
    return !!contact && isLive(contact);
  }
  if (route.name === 'contactsLabel') return state.labels[route.id]?.deletedAt === null;
  return true;
}

export const contactsOpened = (route: Route): string | null => (route.name === 'contact' ? spotKey('contact', route.id) : null);

/** Back from a place with no history: a contact's form to the contact, the import to Réglages, the rest to the list. */
export const contactsBackTo = (route: Route): string => (route.name === 'contactEdit' ? paths.contact(route.id) : route.name === 'contactsImport' ? shellPaths.settings : paths.contacts);

/** The lists: their pick ends when the page changes. */
export const LIST_ROUTES: readonly Route['name'][] = ['contacts', 'contactsFavorites', 'contactsLabel'];

const Count = ({ count }: { count: number }) => (count > 0 ? <span className={navStyles.itemCount}>{count}</span> : null);

export function ContactsNav({ route, onNavigate }: { route: Route; onNavigate: () => void }) {
  const contacts = useLiveContacts();
  const labels = useLiveLabels();
  const counts = useLabelCounts();
  const now = useMinute();
  const favorites = contacts.filter(contact => contact.favorite).length;
  const soon = upcomingBirthdays(contacts, now, 30).length;
  const duplicates = useDuplicates().length;
  return (
    <>
      <NavRow to={paths.contacts} label={t('Contacts')} leading={<NavGlyph name="people" />} trailing={<Count count={contacts.length} />} current={route.name === 'contacts'} onNavigate={onNavigate} />
      <NavRow to={paths.favorites} label={t('Favoris')} leading={<NavGlyph name="star" />} trailing={<Count count={favorites} />} current={route.name === 'contactsFavorites'} onNavigate={onNavigate} />
      <NavRow to={paths.birthdays} label={t('Anniversaires')} leading={<NavGlyph name="cake" />} trailing={<Count count={soon} />} current={route.name === 'contactsBirthdays'} onNavigate={onNavigate} />
      <NavFold
        id="contactLabels"
        title={t('Libellés')}
        action={
          <Link to={paths.labels} className={navStyles.headingAction} onNavigate={onNavigate} ariaLabel={t('Modifier les libellés')}>
            {t('Modifier')}
          </Link>
        }
      >
        {labels.map(label => (
          <NavRow
            key={label.id}
            to={paths.label(label.id)}
            label={label.name}
            leading={
              <span className={navStyles.markSlot} data-line={label.color}>
                <LabelTag color={label.color} size={20} />
              </span>
            }
            trailing={<Count count={counts.get(label.id) ?? 0} />}
            wash={label.color}
            current={route.name === 'contactsLabel' && route.id === label.id}
            onNavigate={onNavigate}
          />
        ))}
        <NavAction
          label={t('Créer un libellé')}
          icon="plus"
          onClick={() => {
            onNavigate();
            navigate(`${paths.labels}?new`);
          }}
        />
      </NavFold>
      <NavRow to={paths.duplicates} label={t('Doublons')} leading={<NavGlyph name="copy" />} trailing={<Count count={duplicates} />} current={route.name === 'contactsDuplicates'} onNavigate={onNavigate} />
    </>
  );
}

export function ContactsNavFoot({ route, onNavigate }: { route: Route; onNavigate: () => void }) {
  return <NavRow to={paths.trash} label={t('Corbeille')} leading={<NavGlyph name="trash" />} current={route.name === 'contactsTrash'} onNavigate={onNavigate} />;
}

/** « Créer un contact » beside the search, wide (a label's list makes one wearing it). */
export function ContactsHeaderActions({ route }: { route: Route }) {
  if (route.name === 'contactNew' || route.name === 'contactEdit') return null;
  const labelIds = route.name === 'contactsLabel' ? [route.id] : [];
  return (
    <button type="button" className={`${shell.classify} paper`} onClick={() => openNewContact('', labelIds)} aria-label={t('Créer un contact')} data-tip={t('Créer un contact (C)')}>
      <Icon name="personPlus" size={20} />
      <span className={shell.classifyLabel}>{t('Créer un contact')}</span>
    </button>
  );
}

/** Its slide away (`--duration-short`), and a little longer for the fallback that lets it go. */
const BAR_EXIT_MS = 200;

/** A phone-sized window's bar on the list: its pebble makes a contact. Mounted with its page: `enter` is how that page came. */
export function ContactsBottomBar({ route, enter }: { route: Route; enter: Arrival | null }) {
  const { present, closing, done } = usePresence(route.name === 'contacts', BAR_EXIT_MS);
  const [arrival] = useState(enter);
  const fab = useRef<HTMLButtonElement>(null);
  if (!present) return null;
  const gone = (event: AnimationEvent<HTMLDivElement>): void => {
    if (closing && event.target === event.currentTarget) done();
  };
  return (
    <div className={`${shell.bottomBar} paper`} data-enter={(!closing && arrival) || undefined} data-closing={closing || undefined} inert={closing} onAnimationEnd={gone}>
      <div className={shell.bottomActions} />
      <button ref={fab} type="button" className={shell.fab} data-pebble-under={0} aria-label={t('Créer un contact')} onClick={() => openNewContact()}>
        <Icon name="plus" size={26} />
      </button>
    </div>
  );
}
