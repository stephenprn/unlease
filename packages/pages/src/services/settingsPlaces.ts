/**
 * Pages' places a search finds (`core/services/settingsSearch`), beside every app's: the import from
 * Notion or Markdown (its own page on the web, its screen on the phone); in the Administration, the
 * questions about pages.
 */
import { tx } from '@unlease/core/i18n';
import { SETTINGS_SECTIONS, type SettingsPlace } from '@unlease/core/services/settingsSearch';
import type { GlyphName } from '@unlease/design/glyphs';

export const PAGES_SETTINGS_PLACES: readonly SettingsPlace<GlyphName>[] = [
  { id: 'pages-import', app: 'pages', area: 'settings', section: SETTINGS_SECTIONS.import, title: tx('Importer depuis Notion'), within: null, glyph: 'download', words: ['notion', 'markdown', 'md', 'obsidian', 'export', 'import', 'importer'] },
  { id: 'pages-ask', app: 'pages', area: 'admin', section: 'pages-ask', title: tx('Questions sur les pages'), within: null, glyph: 'bubble', words: ['demander', 'claude', 'ask', 'question', 'private', 'prive'] },
];
