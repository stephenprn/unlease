/**
 * Pages' places a search finds (`core/services/settingsSearch`), beside every app's: in the
 * Administration, the questions about pages.
 */
import { tx } from '@unlease/core/i18n';
import type { SettingsPlace } from '@unlease/core/services/settingsSearch';
import type { GlyphName } from '@unlease/design/glyphs';

export const PAGES_SETTINGS_PLACES: readonly SettingsPlace<GlyphName>[] = [
  { id: 'pages-ask', app: 'pages', area: 'admin', section: 'pages-ask', title: tx('Questions sur les pages'), within: null, glyph: 'bubble', words: ['demander', 'claude', 'ask', 'question', 'private', 'prive'] },
];
