/**
 * Carnet's places a search finds (`core/services/settingsSearch`), beside every app's: in Réglages
 * its own section, first (« Carnet »: the board's layout; the reminders, the web's row: the phone
 * rings them), cleaning the links saved and the Keep import (« Importer », the first row of
 * « Données », opening its wizard); in the Administration, Seerr, and « Ce que Claude relève » in
 * Claude's section.
 */
import { tx } from '@unlease/core/i18n';
import { SETTINGS_SECTIONS, type SettingsPlace } from '@unlease/core/services/settingsSearch';
import type { GlyphName } from '@unlease/design/glyphs';

import { APP_NAME } from '../brand';

/**
 * Réglages' « Carnet » section, the page's first (as Agenda's « Agenda »), as an address: the web's
 * `#notes`, the phone's `section`. (The web's reminders were a section of their own, `#reminders`:
 * that address still opens Réglages at its top, on this one.)
 */
export const NOTES_SETTINGS_SECTION = 'notes';
const KEEP_WORDS = ['keep', 'google keep', 'takeout', 'import'];

export const NOTES_SETTINGS_PLACES: readonly SettingsPlace<GlyphName>[] = [
  { id: 'notes-layout', app: 'notes', area: 'settings', section: NOTES_SETTINGS_SECTION, title: tx('Disposition du tableau'), within: APP_NAME, glyph: 'grid', words: ['tableau', 'mur', 'liste', 'colonnes', 'grille', 'board', 'layout', 'wall', 'list', 'columns', 'grid'] },
  { id: 'notes-reminders', app: 'notes', area: 'settings', section: NOTES_SETTINGS_SECTION, title: tx('Rappels'), within: APP_NAME, glyph: 'bell', words: ['notifications', 'alarmes', 'sonner', 'reminders', 'alarms', 'ring'], only: 'web' },
  { id: 'notes-clean-links', app: 'notes', area: 'settings', section: SETTINGS_SECTIONS.data, title: tx('Nettoyer les liens enregistrés'), within: tx('Données'), glyph: 'broom', words: ['suivi', 'pistage', 'utm', 'fbclid', 'tracking', 'clean', 'links'] },
  // The import's wizard, its own page on the web and its own screen on the phone.
  { id: 'notes-keep', app: 'notes', area: 'settings', section: SETTINGS_SECTIONS.import, title: tx('Importer depuis Google Keep'), within: null, glyph: 'download', words: KEEP_WORDS },
  // « Ce que Claude relève »: the phone's row is in the Administration's Claude section (`LinkReading`).
  { id: 'notes-templates', app: 'notes', area: 'admin', section: 'reading', title: tx('Ce que Claude relève'), within: 'Claude', glyph: 'list', words: ['information', 'informations', 'releve', 'relever', 'fiche', 'fiches', 'modele', 'champ', 'champs', 'extraire', 'facts', 'fact', 'notes', 'template', 'templates', 'field', 'fields', 'extract'], only: 'phone' },
  // The web's, in the same place (`ReadingExtras`).
  { id: 'notes-templates', app: 'notes', area: 'admin', section: 'reading', title: tx('Ce que Claude relève'), within: 'Claude', glyph: 'list', words: ['information', 'informations', 'releve', 'relever', 'fiche', 'fiches', 'modele', 'champ', 'champs', 'extraire', 'facts', 'fact', 'notes', 'template', 'templates', 'field', 'fields', 'extract'], only: 'web' },
  { id: 'notes-seerr', app: 'notes', area: 'admin', section: 'seerr', title: 'Seerr', within: null, glyph: 'film', words: ['overseerr', 'jellyseerr', 'jellyfin', 'plex', 'films', 'series', 'demandes', 'movies', 'shows', 'requests'] },
];
