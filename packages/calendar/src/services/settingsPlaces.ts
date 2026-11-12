/**
 * Agenda's places a search finds (`core/services/settingsSearch`), beside every app's: in Réglages
 * its « Agenda » section (the view it opens on and the weather, the web's; the week, weekends, week
 * numbers, the hours, a new event's length and reminders; this browser's reminders; the maps app
 * places open in, the phone's), the import and the export; in the Administration the public
 * holidays, the publication and the questions about the calendar.
 */
import { tx } from '@unlease/core/i18n';
import { SETTINGS_SECTIONS, type SettingsPlace } from '@unlease/core/services/settingsSearch';
import type { GlyphName } from '@unlease/design/glyphs';

/** Réglages' « Agenda » section, as an address: the web's `#calendar`, the phone's `section`. */
export const CALENDAR_SETTINGS_SECTION = 'calendar';

const REMINDER_WORDS = ['rappel', 'notifications', 'alertes', 'alarme', 'reminders', 'alerts', 'default'];
const ALL_DAY_WORDS = [...REMINDER_WORDS, 'journee', 'jour entier', 'all-day', 'all day'];

/** A setting of the « Agenda » section. */
const own = (place: Omit<SettingsPlace<GlyphName>, 'app' | 'area' | 'section' | 'within'>): SettingsPlace<GlyphName> => ({ ...place, app: 'calendar', area: 'settings', section: CALENDAR_SETTINGS_SECTION, within: tx('Agenda') });

export const CALENDAR_SETTINGS_PLACES: readonly SettingsPlace<GlyphName>[] = [
  own({ id: 'calendar-view', title: tx('Vue à l’ouverture'), glyph: 'calendar', words: ['vue', 'jour', 'semaine', 'mois', 'planning', 'view', 'day', 'week', 'month', 'schedule', 'default'], only: 'web' }),
  own({ id: 'calendar-week-start', title: tx('La semaine commence le'), glyph: 'calendar', words: ['lundi', 'dimanche', 'samedi', 'premier jour', 'debut', 'monday', 'sunday', 'saturday', 'first day', 'start'] }),
  own({ id: 'calendar-weekends', title: tx('Masquer les week-ends'), glyph: 'calendar', words: ['weekend', 'samedi', 'dimanche', 'hide', 'saturday', 'sunday'] }),
  own({ id: 'calendar-week-numbers', title: tx('Numéros de semaine'), glyph: 'numbered', words: ['numero', 'iso', 'week number'] }),
  own({ id: 'calendar-twelve-hours', title: tx('Heures sur 12'), glyph: 'clock', words: ['heure', 'am', 'pm', 'format', '24 h', '12 h', 'hours', 'clock', 'time format'] }),
  own({ id: 'calendar-length', title: tx('Durée d’un nouvel événement'), glyph: 'clock', words: ['duree', 'longueur', 'defaut', 'duration', 'length', 'default'] }),
  own({ id: 'calendar-reminders', title: tx('Rappel d’un nouvel événement'), glyph: 'bell', words: REMINDER_WORDS, only: 'web' }),
  own({ id: 'calendar-reminders', title: tx('Rappels d’un nouvel événement'), glyph: 'bell', words: REMINDER_WORDS, only: 'phone' }),
  own({ id: 'calendar-all-day-reminders', title: tx('Rappel d’un nouvel événement d’une journée'), glyph: 'bell', words: ALL_DAY_WORDS, only: 'web' }),
  own({ id: 'calendar-all-day-reminders', title: tx('Rappels d’un événement sur la journée'), glyph: 'bell', words: ALL_DAY_WORDS, only: 'phone' }),
  own({ id: 'calendar-weather', title: tx('Météo'), glyph: 'sun', words: ['ville', 'temps', 'temperature', 'weather', 'city', 'forecast'], only: 'web' }),
  own({ id: 'calendar-browser-reminders', title: tx('Rappels sur ce navigateur'), glyph: 'bell', words: ['notifications', 'push', 'browser', 'reminders'], only: 'web' }),
  own({ id: 'calendar-maps', title: tx('Ouvrir les adresses dans'), glyph: 'mapPin', words: ['cartes', 'carte', 'plan', 'lieux', 'itineraire', 'google maps', 'openstreetmap', 'osm', 'maps', 'map', 'places', 'directions'], only: 'phone' }),
  { id: 'calendar-import', app: 'calendar', area: 'settings', section: SETTINGS_SECTIONS.import, title: tx('Importer des événements'), within: null, glyph: 'download', words: ['ics', 'ical', 'icalendar', 'google agenda', 'google calendar', 'takeout', 'invitation', 'import'] },
  { id: 'calendar-export', app: 'calendar', area: 'settings', section: SETTINGS_SECTIONS.data, title: tx('Exporter les événements'), within: tx('Données'), glyph: 'upload', words: ['ics', 'ical', 'icalendar', 'export'] },
  { id: 'calendar-holidays', app: 'calendar', area: 'admin', section: 'calendar-holidays', title: tx('Jours fériés'), within: null, glyph: 'sun', words: ['feries', 'vacances', 'pays', 'region', 'holidays', 'public holidays', 'bank holidays', 'country'] },
  { id: 'calendar-publish', app: 'calendar', area: 'admin', section: 'calendar-publish', title: tx('Publication'), within: null, glyph: 'share', words: ['publier', 'partager', 'abonnement', 'lien', 'ics', 'webcal', 'publish', 'share', 'subscribe', 'link', 'url'] },
  { id: 'calendar-ask', app: 'calendar', area: 'admin', section: 'calendar-ask', title: tx('Questions sur l’agenda'), within: null, glyph: 'bubble', words: ['demander', 'claude', 'ask', 'question'] },
];
