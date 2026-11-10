/**
 * Carnet's places a search finds (`core/services/settingsSearch`), beside every app's: in Réglages
 * the board's layout, the reminders (the web's section: the phone rings them), cleaning the links
 * saved and the Keep import (its own section on the web, a row of « Données » on the phone); in the
 * Administration, Seerr, and « Ce que Claude relève » in Claude's section.
 */
import { tx } from '@unlease/core/i18n';
import { SETTINGS_SECTIONS, type SettingsPlace } from '@unlease/core/services/settingsSearch';
import type { GlyphName } from '@unlease/design/glyphs';

/** Réglages' « Rappels » section on the web, as an address (`#reminders`). */
export const REMINDERS_SETTINGS_SECTION = 'reminders';
/** The web's Keep import, a section of its own after « Données » (`#import`). */
export const KEEP_SETTINGS_SECTION = 'import';

const KEEP_WORDS = ['keep', 'google keep', 'takeout', 'import'];

export const NOTES_SETTINGS_PLACES: readonly SettingsPlace<GlyphName>[] = [
  { id: 'notes-layout', app: 'notes', area: 'settings', section: SETTINGS_SECTIONS.appearance, title: tx('Disposition du tableau'), within: tx('Apparence'), glyph: 'grid', words: ['tableau', 'mur', 'liste', 'colonnes', 'grille', 'board', 'layout', 'wall', 'list', 'columns', 'grid'] },
  { id: 'notes-reminders', app: 'notes', area: 'settings', section: REMINDERS_SETTINGS_SECTION, title: tx('Rappels'), within: null, glyph: 'bell', words: ['notifications', 'alarmes', 'sonner', 'reminders', 'alarms', 'ring'], only: 'web' },
  { id: 'notes-clean-links', app: 'notes', area: 'settings', section: SETTINGS_SECTIONS.data, title: tx('Nettoyer les liens enregistrés'), within: tx('Données'), glyph: 'broom', words: ['suivi', 'pistage', 'utm', 'fbclid', 'tracking', 'clean', 'links'] },
  { id: 'notes-keep', app: 'notes', area: 'settings', section: KEEP_SETTINGS_SECTION, title: tx('Importer depuis Google Keep'), within: null, glyph: 'download', words: KEEP_WORDS, only: 'web' },
  { id: 'notes-keep', app: 'notes', area: 'settings', section: SETTINGS_SECTIONS.data, title: tx('Importer depuis Google Keep'), within: tx('Données'), glyph: 'download', words: KEEP_WORDS, only: 'phone' },
  // « Ce que Claude relève »: the phone's row is in the Administration's Claude section (`LinkReading`).
  { id: 'notes-templates', app: 'notes', area: 'admin', section: 'reading', title: tx('Ce que Claude relève'), within: 'Claude', glyph: 'list', words: ['information', 'informations', 'releve', 'relever', 'fiche', 'fiches', 'modele', 'champ', 'champs', 'extraire', 'facts', 'fact', 'notes', 'template', 'templates', 'field', 'fields', 'extract'], only: 'phone' },
  // The web's, in the same place (`ReadingExtras`).
  { id: 'notes-templates', app: 'notes', area: 'admin', section: 'reading', title: tx('Ce que Claude relève'), within: 'Claude', glyph: 'list', words: ['information', 'informations', 'releve', 'relever', 'fiche', 'fiches', 'modele', 'champ', 'champs', 'extraire', 'facts', 'fact', 'notes', 'template', 'templates', 'field', 'fields', 'extract'], only: 'web' },
  { id: 'notes-seerr', app: 'notes', area: 'admin', section: 'seerr', title: 'Seerr', within: null, glyph: 'film', words: ['overseerr', 'jellyseerr', 'jellyfin', 'plex', 'films', 'series', 'demandes', 'movies', 'shows', 'requests'] },
];
