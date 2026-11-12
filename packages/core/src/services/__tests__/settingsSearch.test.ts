import { afterEach, describe, expect, it } from 'vitest';

import { GLYPHS } from '@unlease/design/glyphs';
import { CALENDAR_SETTINGS_PLACES } from '@unlease/calendar/services/settingsPlaces';
import { CONTACTS_SETTINGS_PLACES } from '@unlease/contacts/services/settingsPlaces';
import { NOTES_SETTINGS_PLACES } from '@unlease/notes/services/settingsPlaces';
import { PAGES_SETTINGS_PLACES } from '@unlease/pages/services/settingsPlaces';

import { APP_IDS, APPS, type AppId } from '../../apps';
import { setLocale } from '../../i18n';
import { findSettings, placesFor, settingsPageOf, settingsWhere, SETTINGS_SECTIONS, SHARED_SETTINGS_PLACES, type SettingsClient, type SettingsPlace } from '../settingsSearch';

const OWN: Readonly<Record<AppId, readonly SettingsPlace[]>> = { notes: NOTES_SETTINGS_PLACES, pages: PAGES_SETTINGS_PLACES, contacts: CONTACTS_SETTINGS_PLACES, calendar: CALENDAR_SETTINGS_PLACES };

/** The ids a query finds, best first, in an app on a client. */
const found = (query: string, app: AppId = 'notes', client: SettingsClient = 'phone'): string[] => findSettings(placesFor(app, client, OWN[app]), query).map(place => place.id);
const first = (query: string, app: AppId = 'notes', client: SettingsClient = 'phone'): string | undefined => found(query, app, client)[0];

describe('the settings a search finds', () => {
  afterEach(() => setLocale('fr'));

  it('finds a place by the words people type, accents and case aside', () => {
    expect(first('grain')).toBe('paper-grain');
    expect(found('grain')).toEqual(['paper-grain', 'ground-grain']);
    expect(first('Budget')).toBe('claude-budget');
    expect(first('s3')).toBe('admin-backup');
    expect(first('S3')).toBe('admin-backup');
    expect(first('clé')).toBe('claude-key');
    expect(first('cle')).toBe('claude-key');
    expect(first('couleur')).toBe('colors');
    expect(first('langue')).toBe('language');
    expect(first('fond')).toBe('ground');
    expect(first('sauvegarde')).toBe('admin-backup');
    expect(first('Seafile')).toBe('admin-drive');
    expect(first('thème')).toBe('theme');
    expect(first('THEME')).toBe('theme');
    expect(first('réglages')).toBe('settings');
  });

  it('understands both languages, whatever the interface shows', () => {
    // French interface, English words: the titles' English comes from the dictionary.
    expect(first('background')).toBe('ground');
    expect(first('colours')).toBe('colors');
    expect(first('dark mode')).toBe('theme');
    expect(first('api key')).toBe('claude-key');
    expect(first('backup')).toBe('admin-backup');
    expect(first('language')).toBe('language');
    setLocale('en');
    expect(first('fond')).toBe('ground');
    expect(first('paper grain')).toBe('paper-grain');
    expect(first('monthly budget')).toBe('claude-budget');
    expect(first('restore')).toBe('backup-restore');
  });

  it('takes plurals and starts of words, a whole word below three letters', () => {
    expect(first('couleurs')).toBe('colors');
    expect(first('sauvegardes')).toBe('admin-backup');
    expect(first('appar')).toBe('appearance');
    expect(first('budg')).toBe('claude-budget');
    // Two letters: a whole word only (« S3 »), never the start of every word beginning so.
    expect(found('co')).toEqual([]);
    expect(found('s')).toEqual([]);
    // Words that say nothing of a setting find nothing.
    expect(found('sur')).toEqual([]);
    expect(found('le de')).toEqual([]);
    expect(found('')).toEqual([]);
    expect(found('   ')).toEqual([]);
  });

  it('needs every word typed, wherever each is', () => {
    expect(found('grain fond')).toEqual(['ground-grain']);
    expect(found('restaurer sauvegarde')).toEqual(['backup-restore']);
    expect(found('grain lisbonne')).toEqual([]);
  });

  it('puts a section before what it holds', () => {
    expect(found('fond').slice(0, 2)).toEqual(['ground', 'ground-grain']);
    expect(found('apparence')[0]).toBe('appearance');
    expect(found('apparence')).toContain('theme');
  });

  it('offers each app its own places, and each client what it shows', () => {
    expect(first('seerr', 'notes')).toBe('notes-seerr');
    expect(found('seerr', 'pages')).not.toContain('notes-seerr');
    expect(first('tableau', 'notes')).toBe('notes-layout');
    expect(found('tableau', 'contacts')).toEqual([]);
    // Carnet's reminders are a row of the web's Réglages: the phone rings them, and says nothing there.
    expect(first('rappels', 'notes', 'web')).toBe('notes-reminders');
    expect(found('rappels', 'notes', 'phone')).not.toContain('notes-reminders');
    // The Keep import: its own section on the web, a row of « Données » on the phone.
    expect(findSettings(placesFor('notes', 'web', NOTES_SETTINGS_PLACES), 'keep')[0]).toMatchObject({ section: 'import', within: null });
    expect(findSettings(placesFor('notes', 'phone', NOTES_SETTINGS_PLACES), 'keep')[0]).toMatchObject({ section: 'data', within: 'Données' });
    expect(first('raccourcis', 'notes', 'web')).toBe('shortcuts');
    expect(found('raccourcis', 'notes', 'phone')).toEqual([]);
    expect(first('anniversaires', 'contacts', 'phone')).toBe('contacts-birthdays');
    expect(found('anniversaires', 'contacts', 'web')).toEqual([]);
    expect(first('indicatif', 'contacts')).toBe('contacts-region');
    expect(first('semaine commence', 'calendar')).toBe('calendar-week-start');
    expect(first('lundi', 'calendar')).toBe('calendar-week-start');
    expect(first('fériés', 'calendar')).toBe('calendar-holidays');
    expect(first('holidays', 'calendar')).toBe('calendar-holidays');
    expect(first('météo', 'calendar', 'web')).toBe('calendar-weather');
    expect(first('questions', 'pages')).toBe('pages-ask');
    expect(first('emoji', 'pages', 'web')).toBe('search-languages');
  });

  it('puts the look’s sections on « Apparence »’s page, the import and the erase on their own, every other on the overview', () => {
    expect([SETTINGS_SECTIONS.appearance, SETTINGS_SECTIONS.colors, SETTINGS_SECTIONS.ground].map(settingsPageOf)).toEqual(['appearance', 'appearance', 'appearance']);
    expect([SETTINGS_SECTIONS.import, SETTINGS_SECTIONS.erase].map(settingsPageOf)).toEqual(['import', 'erase']);
    expect([SETTINGS_SECTIONS.language, SETTINGS_SECTIONS.data, 'notes', null].map(settingsPageOf)).toEqual([null, null, null, null]);
  });

  it('says where each place is', () => {
    const where = (id: string, app: AppId = 'notes'): string => settingsWhere(placesFor(app, 'phone', OWN[app]).find(place => place.id === id)!);
    // The look's own page lies between: « Apparence » itself is a row of Réglages.
    expect(where('appearance')).toBe('Réglages');
    expect(where('theme')).toBe('Réglages › Apparence');
    expect(where('ground')).toBe('Réglages › Apparence');
    expect(where('ground-grain')).toBe('Réglages › Apparence › Fond');
    expect(where('language')).toBe('Réglages');
    expect(where('notes-layout')).toBe(`Réglages › ${APPS.notes.name}`);
    expect(where('claude-budget')).toBe('Administration › Claude');
    expect(where('admin-backup')).toBe('Administration');
    expect(where('settings')).toBe('');
    expect(where('calendar-weekends', 'calendar')).toBe('Réglages › Agenda');
    setLocale('en');
    expect(where('ground-grain')).toBe('Settings › Appearance › Background');
    expect(where('calendar-weekends', 'calendar')).toBe('Settings › Calendar');
  });

  it('draws every place with a glyph the design system has, under an id unique in its app', () => {
    for (const app of APP_IDS) {
      for (const client of ['web', 'phone'] as const) {
        const places = placesFor(app, client, OWN[app]);
        expect(new Set(places.map(place => place.id)).size).toBe(places.length);
        for (const place of places) {
          expect(Object.hasOwn(GLYPHS, place.glyph), `${place.id}: ${place.glyph}`).toBe(true);
          expect(place.app === null || place.app === app).toBe(true);
        }
      }
    }
    expect(SHARED_SETTINGS_PLACES.every(place => place.app === null)).toBe(true);
  });
});
