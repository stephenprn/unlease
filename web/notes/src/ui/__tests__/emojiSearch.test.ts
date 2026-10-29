import { describe, expect, it } from 'vitest';

import { fold, loadEmojiCatalogue, searchEmoji, typedEmoji } from '../features/pages/emojiSearch';

describe('emoji search', () => {
  it('folds accents, case and ligatures', () => {
    expect(fold('Cœur  Brisé!')).toBe('coeur brise');
  });

  it('finds an emoji by its French or its English name', async () => {
    const catalogue = await loadEmojiCatalogue();
    const found = (query: string, languages: readonly ('fr' | 'en')[]) => searchEmoji(catalogue, query, languages).map(entry => entry.emoji);
    expect(found('coeur', ['fr']).slice(0, 3)).toContain('❤️');
    expect(found('pain', ['fr'])[0]).toBe('🍞');
    expect(found('bread', ['en'])[0]).toBe('🍞');
    expect(found('fusée', ['fr'])).toContain('🚀');
    expect(found('coeur rouge', ['fr'])).toContain('❤️');
  });

  it('reads only the languages chosen', async () => {
    const catalogue = await loadEmojiCatalogue();
    expect(searchEmoji(catalogue, 'bread', ['fr']).map(entry => entry.emoji)).not.toContain('🍞');
    expect(searchEmoji(catalogue, 'bread', ['fr', 'en']).map(entry => entry.emoji)).toContain('🍞');
  });

  it('takes a pasted emoji as it is', () => {
    expect(typedEmoji(' 👩🏽‍🍳 et le reste')).toBe('👩🏽‍🍳');
    expect(typedEmoji('soleil')).toBeNull();
  });
});
