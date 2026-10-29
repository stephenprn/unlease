/**
 * The emoji picker's catalogue, loaded the first time a picker opens (a separate chunk), and its
 * search, shared with the phone (`design/emojiSearch`). A search reads the languages chosen
 * in Réglages.
 */
import { buildEmojiCatalogue, type EmojiCatalogue, type EmojiCatalogueData } from '@unlease/design/emojiSearch';

export { EVERYDAY_EMOJI, emojiName, fold, searchEmoji, typedEmoji, type Emoji, type EmojiCatalogue, type EmojiGroup } from '@unlease/design/emojiSearch';

let loading: Promise<EmojiCatalogue> | null = null;
let loaded: EmojiCatalogue | null = null;

/** The catalogue, fetched once and kept. */
export function loadEmojiCatalogue(): Promise<EmojiCatalogue> {
  loading ??= import('@unlease/design/emojiCatalogue.json')
    .then(module => (loaded = buildEmojiCatalogue(module.default as unknown as EmojiCatalogueData)))
    .catch((error: unknown) => {
      // Offline before it was ever fetched: the next opening tries again.
      loading = null;
      throw error;
    });
  return loading;
}

/** The catalogue if it is already here (null until a picker or a « : » has asked for it). */
export function emojiCatalogueNow(): EmojiCatalogue | null {
  return loaded;
}
