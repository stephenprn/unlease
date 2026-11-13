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
      label={t('Default country code')}
      value={chosen ?? BROWSER}
      onChange={value => setRegion(value === BROWSER ? null : value)}
      options={[
        { value: BROWSER, label: fallback ? t('This browser’s: {country}', { country: callingCountry(fallback) }) : t('This browser’s (none)') },
        ...callingCountries(),
        { value: 'none', label: t('None: numbers are written with their +') },
      ]}
      help={t('A number written without a country code (06 12 34 56 78) takes this one: the contact’s page shows it and calls it with it, as WhatsApp does, and a new number starts with it.')}
    />
  );
}

function ContactsSection() {
  const order = useSortOrder();
  return (
    <Section title={t('Contacts')} id={CONTACTS_SETTINGS_SECTION}>
      <div className={styles.block}>
        {/* As the phone's: the choice named above its track, the segments in words alone. */}
        <p className="t-meta-strong">{t('Sort by')}</p>
        <Segmented<SortOrder>
          label={t('Sort by')}
          value={order}
          onChange={setSortOrder}
          options={[
            { value: 'firstName', label: t('First name') },
            { value: 'lastName', label: t('Last name') },
          ]}
        />
        <p className="t-meta">{t('The list’s order on this device. Sorted by last name, the list also writes the last name first.')}</p>
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
    if (count > 0) showSnack(t('{contacts} exported', { contacts: plural(count, 'contact') }), undefined, { tone: 'success' });
  };
  return (
    <>
      {live.length > 0 ? (
        <button type="button" className={styles.row} onClick={exportAll}>
          <Icon name="upload" size={24} />
          <span className={styles.rowText}>
            <span className="t-body">{t('Export')}</span>
            <span className="t-meta">{t('{contacts} in a .vcf file', { contacts: plural(live.length, 'contact') })}</span>
          </span>
        </button>
      ) : (
        <div className={styles.row}>
          <Icon name="upload" size={24} />
          <span className={styles.rowText}>
            <span className="t-body">{t('Export')}</span>
            <span className="t-meta">{t('No contacts to export.')}</span>
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
