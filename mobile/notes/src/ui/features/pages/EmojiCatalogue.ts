/** The emoji catalogue on the phone: bundled with the app, made searchable the first time a picker asks, then kept. */
import data from '@unlease/design/emojiCatalogue.json';
import { getLocale } from '@unlease/core/i18n';
import { buildEmojiCatalogue, type EmojiCatalogue, type EmojiCatalogueData, type EmojiLanguage } from '@unlease/design/emojiSearch';

let catalogue: EmojiCatalogue | null = null;

export function emojiCatalogue(): EmojiCatalogue {
  catalogue ??= buildEmojiCatalogue(data as unknown as EmojiCatalogueData);
  return catalogue;
}

export function loadedEmojiCatalogue(): EmojiCatalogue | null {
  return catalogue;
}

/** The phone has no languages setting yet: a search reads both, the interface's language first (it names the emoji). */
const FRENCH_FIRST: readonly EmojiLanguage[] = ['fr', 'en'];
const ENGLISH_FIRST: readonly EmojiLanguage[] = ['en', 'fr'];

export function emojiLanguages(): readonly EmojiLanguage[] {
  return getLocale() === 'en' ? ENGLISH_FIRST : FRENCH_FIRST;
}
