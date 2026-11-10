import { describe, expect, it } from 'vitest';

import { closesAfter, displayMentionQuery, mentionList, mentionQueryAt, mentionScore, placeMention, rankMentions } from '../mentionSearch';
import { richDisplay } from '../richDisplay';
import { parseRich, serializeRich } from '../richText';

const people = [{ title: 'Paul Martin' }, { title: 'Léa Martin', boost: 1 }, { title: 'Amélie Fontaine', also: '06 31 41 59 26' }, { title: 'Martine Léandri' }];

describe('mentionScore', () => {
  it('finds each word at a word start, accents and case aside', () => {
    expect(mentionScore({ title: 'Léa Martin' }, 'lea ma')).toBeGreaterThan(0);
    expect(mentionScore({ title: 'Léa Martin' }, 'LÉA')).toBeGreaterThan(0);
    expect(mentionScore({ title: 'Léa Martin' }, 'lea zz')).toBe(0);
  });

  it('puts a word start before a match inside a word, and the name before what else names it', () => {
    const start = mentionScore({ title: 'Martine Léandri' }, 'mar');
    const inside = mentionScore({ title: 'Omar Sy' }, 'mar');
    const also = mentionScore({ title: 'Amélie Fontaine', also: 'marché' }, 'mar');
    expect(start).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(also);
    expect(also).toBeGreaterThan(0);
  });

  it('finds a number among what else names someone', () => {
    expect(mentionScore(people[2]!, '06 31')).toBeGreaterThan(0);
  });
});

describe('rankMentions', () => {
  it('ranks the name starting with the query first, then the likelier, then the shorter', () => {
    expect(rankMentions(people, 'mar').map(entry => entry.title)).toEqual(['Martine Léandri', 'Léa Martin', 'Paul Martin']);
    expect(rankMentions(people, '').map(entry => entry.title)[0]).toBe('Léa Martin');
  });
});

describe('mentionList', () => {
  const sections = [
    { section: 'Contacts', entries: people },
    { section: 'Pages', entries: [{ title: 'Marseille' }, { title: 'Recettes' }] },
  ];

  it('offers a few of each kind in order while nothing is typed', () => {
    expect(mentionList(sections, '', { idle: 2 }).map(hit => hit.entry.title)).toEqual(['Léa Martin', 'Paul Martin', 'Marseille', 'Recettes']);
  });

  it('groups by kind, the kind of the best answer first', () => {
    const hits = mentionList(sections, 'recet', { grouped: true });
    expect(hits.map(hit => hit.section)).toEqual(['Pages']);
    expect(mentionList(sections, 'mars', { grouped: true })[0]!.entry.title).toBe('Marseille');
  });

  it('mixes kinds by score in one list', () => {
    const hits = mentionList(sections, 'mar', { total: 3 });
    expect(hits).toHaveLength(3);
    expect(hits.map(hit => hit.entry.title)).toEqual(['Martine Léandri', 'Marseille', 'Léa Martin']);
  });
});

describe('mentionQueryAt', () => {
  it('reads the words after a « @ » that starts a word', () => {
    expect(mentionQueryAt('Voir @Léa Ma', 12)).toEqual({ at: 5, query: 'Léa Ma' });
    expect(mentionQueryAt('@', 1)).toEqual({ at: 0, query: '' });
    expect(mentionQueryAt('(@pa', 4)).toEqual({ at: 1, query: 'pa' });
  });

  it('asks nothing inside an address, across lines, after two spaces or a long run', () => {
    expect(mentionQueryAt('lea@example.org', 15)).toBeNull();
    expect(mentionQueryAt('@lea\nma', 7)).toBeNull();
    expect(mentionQueryAt('@lea  ma', 8)).toBeNull();
    expect(mentionQueryAt(`@${'a'.repeat(41)}`, 42)).toBeNull();
    expect(mentionQueryAt('@ lea', 5)).toBeNull();
  });

  it('gives up after a space once nothing answers', () => {
    expect(closesAfter('rdv demain', 0)).toBe(true);
    expect(closesAfter('rdv', 0)).toBe(false);
    expect(closesAfter('léa ma', 1)).toBe(false);
  });
});

describe('displayMentionQuery and placeMention', () => {
  it('reads « @word » in a field showing mentions as names, and puts the mention in its place', () => {
    const runs = parseRich('Voir {@contact=c1} et @pa');
    const display = richDisplay(runs, () => 'Léa Martin');
    expect(display.text).toBe('Voir @Léa Martin et @pa');
    const query = displayMentionQuery(display, display.text.length);
    expect(query).toEqual({ at: 20, start: 10, query: 'pa' });
    // Right after a mention's name: nothing asked.
    expect(displayMentionQuery(display, 16)).toBeNull();
    const placed = placeMention(runs, query!.start, query!.start + 3, { kind: 'mention', target: { type: 'contact', id: 'c2' } });
    expect(serializeRich(placed.runs)).toBe('Voir {@contact=c1} et {@contact=c2} ');
    expect(placed.caret).toBe(12);
  });
});
