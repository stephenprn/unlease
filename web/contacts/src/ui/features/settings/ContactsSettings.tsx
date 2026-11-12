/**
 * Contacts' part of the Réglages, this device's own: the list's order (by first name, as Google's,
 * or by last name), the « Indicatif par défaut »: the country whose calling code a number written
 * without its `+` takes (a contact's page shows and dials it with it, WhatsApp needs it, a new number
 * in the form starts with it). (An address offers Google Maps and OpenStreetMap where it is shown: no
 * maps to choose here.) In « Données », as on the phone: the export of every contact as one `.vcf`,
 * under the import (the shell's row, opening the wizard).
 */
import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import type { SortOrder } from '@unlease/contacts/services/names';
import { CONTACTS_SETTINGS_SECTION } from '@unlease/contacts/services/settingsPlaces';

import { useLiveContacts } from '../../../app/hooks/useContacts';
import { defaultRegion, setRegion, setSortOrder, usePrefsStore, useSortOrder } from '../../../app/store/prefs';
import { showSnack } from '@shared/app/store/ui';
import { Icon } from '@shared/ui/components/Icon';
import { Segmented } from '@shared/ui/components/Segmented';
import { SelectField } from '@shared/ui/components/SelectField';
import { Section } from '@shared/ui/features/settings/Section';
import styles from '@shared/ui/features/settings/settings.module.css';
import type { SettingsSection } from '@shared/modules';
import contacts from '../../contacts.module.css';
import { callingCountries, callingCountry } from '../callingCodes';
import { exportContacts } from '../exporting';

/** The choice for « follow the browser ». */
const BROWSER = 'browser';

function RegionField() {
  const chosen = usePrefsStore(s => s.region);
  const fallback = defaultRegion();
  return (
    <SelectField
      className={contacts.settingsField}
      label={t('Indicatif par défaut')}
      value={chosen ?? BROWSER}
      onChange={value => setRegion(value === BROWSER ? null : value)}
      options={[
        { value: BROWSER, label: fallback ? t('Celui de ce navigateur : {country}', { country: callingCountry(fallback) }) : t('Celui de ce navigateur (aucun)') },
        ...callingCountries(),
        { value: 'none', label: t('Aucun : les numéros sont écrits avec leur +') },
      ]}
      help={t('Un numéro écrit sans indicatif (06 12 34 56 78) prend celui-ci : la fiche du contact l’affiche et l’appelle avec, WhatsApp aussi, et un nouveau numéro le propose.')}
    />
  );
}

function ContactsSection() {
  const order = useSortOrder();
  return (
    <Section title={t('Contacts')} id={CONTACTS_SETTINGS_SECTION}>
      <div className={styles.block}>
        {/* As the phone's: the choice named above its track, the segments in words alone. */}
        <p className="t-meta-strong">{t('Trier par')}</p>
        <Segmented<SortOrder>
          label={t('Trier par')}
          value={order}
          onChange={setSortOrder}
          options={[
            { value: 'firstName', label: t('Prénom') },
            { value: 'lastName', label: t('Nom de famille') },
          ]}
        />
        <p className="t-meta">{t('L’ordre de la liste sur cet appareil. Trié par nom de famille, la liste écrit aussi le nom en premier.')}</p>
        <RegionField />
      </div>
    </Section>
  );
}

/** « Données »'s export, the phone's row: it goes out (`upload`). The import is the shell's row, above it (`AppModule.importer`). */
function ContactsData() {
  const live = useLiveContacts();
  const exportAll = (): void => {
    const count = exportContacts(live);
    if (count > 0) showSnack(t('{contacts} exportés', { contacts: plural(count, 'contact') }), undefined, { tone: 'success' });
  };
  return (
    <>
      {live.length > 0 ? (
        <button type="button" className={styles.row} onClick={exportAll}>
          <Icon name="upload" size={24} />
          <span className={styles.rowText}>
            <span className="t-body">{t('Exporter')}</span>
            <span className="t-meta">{t('{contacts} dans un fichier .vcf', { contacts: plural(live.length, 'contact') })}</span>
          </span>
        </button>
      ) : (
        <div className={styles.row}>
          <Icon name="upload" size={24} />
          <span className={styles.rowText}>
            <span className="t-body">{t('Exporter')}</span>
            <span className="t-meta">{t('Aucun contact à exporter.')}</span>
          </span>
        </div>
      )}
    </>
  );
}

export const CONTACTS_SETTINGS: readonly SettingsSection[] = [
  { id: 'contacts-order', Body: ContactsSection },
  { id: 'contacts-data', Body: ContactsData, place: 'data' },
];
