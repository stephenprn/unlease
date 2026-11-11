/**
 * The lists: every contact (Google's « Contacts », the favourites' faces and the week's birthdays
 * above it, as on the phone; the header's search filters it), the favourites alone, a label's
 * contacts. Each with its title and its count, then the list, or the same empty place.
 */
import { t, tx } from '@unlease/core/i18n';
import { searchSummary } from '@unlease/core/services/searchWords';
import { APP_WORDS } from '@unlease/core/appWords';
import { plural } from '@unlease/core/services/format';

import { useLiveContacts } from '../../app/hooks/useContacts';
import { useContactsStore } from '../../app/store/library';
import { useQuery } from '@shared/app/store/search';
import { Button } from '@shared/ui/components/Button';
import { EmptyState } from '@shared/ui/components/EmptyState';
import { SyncNotice } from '@shared/ui/navigation/Header';
import { settingsFound, SettingsMatches } from '@shared/ui/features/settings/SettingsMatches';
import { PageHead } from '@shared/ui/navigation/PageHead';
import { navigate, type Route } from '@shared/ui/router';
import { NARROW, useMedia } from '@shared/ui/useMedia';
import screens from '@shared/ui/screens/screens.module.css';
import styles from '../contacts.module.css';
import { ContactList, type ListSection } from '../features/ContactList';
import { BirthdayLine, FavoritesStrip } from '../features/HomeExtras';
import { openNewContact } from '../features/newContact';
import { visibleContacts } from '../features/visible';
import { paths } from '../routes';

const EMPTY_TEXT = tx('Créez un contact, ou importez ceux de Google : sur contacts.google.com, « Exporter », puis déposez le fichier ici.');

/** No contact at all, in every list (as on the phone): how to make one, or bring them all in. `labelId`: the label a new one wears. */
function NoContactsYet({ labelId }: { labelId?: string }) {
  return (
    <EmptyState scene="welcome" title={t('Aucun contact pour l’instant')} text={t(EMPTY_TEXT)}>
      <Button icon="personPlus" onClick={() => openNewContact('', labelId ? [labelId] : undefined)}>
        {t('Créer un contact')}
      </Button>
      <Button kind="text" icon="download" onClick={() => navigate(paths.import)}>
        {t('Importer des contacts')}
      </Button>
    </EmptyState>
  );
}

/** Every contact, or what the search found. */
function AllContacts() {
  const all = useLiveContacts();
  const labels = useContactsStore(s => s.labels);
  const query = useQuery();
  const narrow = useMedia(NARROW);
  const searching = query.trim().length > 0;
  if (searching) {
    const found = visibleContacts({ name: 'contacts' }, all, labels, query);
    return (
      <div className={styles.screen}>
        {/* As on the phone: the settings the words name, above the contacts. */}
        <SettingsMatches query={query} />
        <div aria-live="polite">
          {found.length > 0 ? (
            <h1 className={`${screens.resultCount} t-meta`}>{searchSummary(query, found.length, settingsFound(query))}</h1>
          ) : (
            // As in every app: nothing found is an empty place, saying what the search looks through.
            <EmptyState scene="search" as="h1" title={searchSummary(query, 0, settingsFound(query))} text={APP_WORDS.contacts.searchHint} />
          )}
        </div>
        {found.length > 0 ? <ContactList sections={[{ id: 'found', contacts: found }]} /> : null}
      </div>
    );
  }
  const sections: ListSection[] = [{ id: 'all', contacts: all, letters: true }];
  return (
    <div className={styles.screen}>
      {narrow ? <SyncNotice /> : null}
      <div className={styles.listHead}>
        <PageHead title={t('Contacts')} />
        {all.length > 0 ? <p className={`${styles.count} t-meta tabular`}>{plural(all.length, 'contact')}</p> : null}
      </div>
      {all.length === 0 ? (
        <NoContactsYet />
      ) : (
        <>
          {/* As the phone's: the favourites' faces and the week's birthdays above everyone. */}
          <FavoritesStrip contacts={all} />
          <BirthdayLine contacts={all} />
          <ContactList sections={sections} />
        </>
      )}
    </div>
  );
}

function Favorites() {
  const all = useLiveContacts();
  const favorites = all.filter(contact => contact.favorite);
  return (
    <div className={styles.screen}>
      <div className={styles.listHead}>
        <PageHead title={t('Favoris')} />
        {favorites.length > 0 ? <p className={`${styles.count} t-meta tabular`}>{plural(favorites.length, 'contact')}</p> : null}
      </div>
      {all.length === 0 ? (
        <NoContactsYet />
      ) : favorites.length === 0 ? (
        <EmptyState scene="label" title={t('Aucun favori')} text={t('L’étoile d’un contact le met ici, à portée de main, et dans le widget d’appels rapides du téléphone.')} />
      ) : (
        <ContactList sections={[{ id: 'favorites', contacts: favorites, letters: true }]} />
      )}
    </div>
  );
}

function LabelContacts({ id }: { id: string }) {
  const label = useContactsStore(s => s.labels[id]);
  const all = useLiveContacts();
  const wearing = all.filter(contact => contact.labelIds.includes(id));
  if (!label || label.deletedAt !== null) {
    return (
      <div className={styles.screen}>
        <EmptyState scene="label" as="h1" title={t('Ce libellé n’existe plus')} text={t('Il a été supprimé, sur cet appareil ou sur un autre.')} />
      </div>
    );
  }
  return (
    <div className={styles.screen}>
      <div className={styles.listHead}>
        <PageHead title={label.name} action={{ icon: 'personPlus', label: t('Créer un contact'), onClick: () => openNewContact('', [id]) }} />
      </div>
      {wearing.length > 0 ? <p className={`${styles.count} t-meta tabular`}>{plural(wearing.length, 'contact')}</p> : null}
      {all.length === 0 ? (
        <NoContactsYet labelId={id} />
      ) : wearing.length === 0 ? (
        <EmptyState scene="label" title={t('Personne avec ce libellé')} text={t('Ouvrez un contact et ajoutez-lui ce libellé, ou sélectionnez-en plusieurs dans la liste.')} />
      ) : (
        <ContactList sections={[{ id: `label:${id}`, contacts: wearing, letters: true }]} />
      )}
    </div>
  );
}

export function ListScreen({ route }: { route: Route }) {
  switch (route.name) {
    case 'contactsFavorites':
      return <Favorites />;
    case 'contactsLabel':
      return <LabelContacts id={route.id} />;
    default:
      return <AllContacts />;
  }
}
