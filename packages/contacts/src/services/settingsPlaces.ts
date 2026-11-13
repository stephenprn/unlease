/**
 * Contacts' places a search finds (`core/services/settingsSearch`), beside every app's: in Réglages
 * the list's order and the default calling code (its « Contacts » section), the maps app addresses
 * open in and the birthdays' notifications (the phone's), the import (the web's page, the phone's row)
 * and the export.
 */
import { tx } from '@unlease/core/i18n';
import { SETTINGS_SECTIONS, type SettingsPlace } from '@unlease/core/services/settingsSearch';
import type { GlyphName } from '@unlease/design/glyphs';

/** Réglages' « Contacts » section, as an address: the web's `#contacts`, the phone's `section`. */
export const CONTACTS_SETTINGS_SECTION = 'contacts';
/** The phone's « Anniversaires » section. */
export const BIRTHDAYS_SETTINGS_SECTION = 'birthdays';

/** What a search for the import may type: the formats, Google's, the phone's book. */
const IMPORT_WORDS = ['vcf', 'vcard', 'csv', 'google contacts', 'takeout', 'carnet d adresses', 'repertoire', 'import', 'address book'];

export const CONTACTS_SETTINGS_PLACES: readonly SettingsPlace<GlyphName>[] = [
  { id: 'contacts-order', app: 'contacts', area: 'settings', section: CONTACTS_SETTINGS_SECTION, title: tx('Sort by'), within: tx('Contacts'), glyph: 'sort', words: ['tri', 'ordre', 'prenom', 'nom de famille', 'sort', 'order', 'first name', 'last name', 'surname'] },
  { id: 'contacts-region', app: 'contacts', area: 'settings', section: CONTACTS_SETTINGS_SECTION, title: tx('Default country code'), within: tx('Contacts'), glyph: 'phone', words: ['pays', 'region', 'numeros', 'telephone', 'whatsapp', 'country', 'calling code', 'dialing code', 'numbers', 'phone'] },
  { id: 'contacts-maps', app: 'contacts', area: 'settings', section: CONTACTS_SETTINGS_SECTION, title: tx('Open addresses in'), within: tx('Contacts'), glyph: 'mapPin', words: ['cartes', 'carte', 'plan', 'itineraire', 'google maps', 'openstreetmap', 'osm', 'maps', 'map', 'directions'], only: 'phone' },
  { id: 'contacts-birthdays', app: 'contacts', area: 'settings', section: BIRTHDAYS_SETTINGS_SECTION, title: tx('Birthdays'), within: null, glyph: 'cake', words: ['notifications', 'prevenir', 'rappels', 'veille', 'heure', 'birthdays', 'notify', 'reminders'], only: 'phone' },
  // The web's wizard is a page of Réglages; the phone's, its own screen from the first row of « Données ».
  { id: 'contacts-import', app: 'contacts', area: 'settings', section: SETTINGS_SECTIONS.import, title: tx('Import contacts'), within: null, glyph: 'download', words: IMPORT_WORDS },
  { id: 'contacts-export', app: 'contacts', area: 'settings', section: SETTINGS_SECTIONS.data, title: tx('Export contacts'), within: tx('Data'), glyph: 'upload', words: ['vcf', 'vcard', 'export'] },
];
