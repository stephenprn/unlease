import { bodyMarkdown, bodyText, noteCardParagraphs } from '../noteBody';
import { mentionName, setMentionNamer } from '../noteMentions';

afterEach(() => setMentionNamer(() => null));

describe('mentions in a formatted note', () => {
  const note = { kind: 'text', body: '# Cadeaux\nPour {@contact=lea} et {@contact=gone}', rich: true };

  it('read as the names the program gives, or as gone', () => {
    setMentionNamer(target => (target.id === 'lea' ? 'Léa Martin' : null));
    expect(bodyText(note)).toBe('Cadeaux\nPour Léa Martin et Contact supprimé');
    expect(bodyMarkdown(note)).toContain('Pour @Léa Martin et @Contact supprimé');
    expect(mentionName({ type: 'event', id: 'x' })).toBe('Événement supprimé');
    expect(mentionName({ type: 'meeting', id: 'x' })).toBe('Indisponible ici');
  });

  it('measure a card with the names as they are now', () => {
    setMentionNamer(() => 'Léa');
    const before = noteCardParagraphs(note)![1]!.map(run => run.text).join('');
    setMentionNamer(() => 'Léana Martin');
    const after = noteCardParagraphs(note)![1]!.map(run => run.text).join('');
    expect([before, after]).toEqual(['Pour Léa et Léa', 'Pour Léana Martin et Léana Martin']);
  });
});
