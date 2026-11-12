/** Lists of addresses, read line by line: the Keep import's and « Transformer en collection »'s. */
import { freeTitle, lineLinks, listLinks, listName, mostlyLinks, typedAddress, typedAddressProblem } from '../lineLinks';

describe('listLinks', () => {
  it('reads each line’s address and words, and every line without one with its place', () => {
    const found = listLinks([
      { text: 'À voir', done: false },
      { text: '- Dune : https://example.org/dune', done: true },
      { text: '', done: false },
      { text: 'en salle', done: false },
      { text: 'https://example.org/alien https://example.org/dune', done: false },
    ])!;
    expect(found.links).toEqual([
      { url: 'https://example.org/dune', comment: 'Dune', title: '', done: false },
      { url: 'https://example.org/alien', comment: '', title: '', done: false },
    ]);
    expect(found.strays).toEqual([
      { text: 'À voir', done: false, line: 0, link: 0, before: true, at: 0 },
      { text: 'en salle', done: false, line: 2, link: 0, before: false, at: 1 },
    ]);
    expect(found).toMatchObject({ linkLines: 2, filled: 4 });
    expect(mostlyLinks(found)).toBe(false);
    expect(listLinks([{ text: 'rien', done: false }])).toBeNull();
    expect(lineLinks('example.org/page')).toEqual({ urls: ['https://example.org/page'], words: '' });
  });

  it('calls a list of links one where two lines in three hold an address', () => {
    const lines = (links: number, words: number) => [...Array.from({ length: links }, (_, at) => ({ text: `https://example.org/${at}`, done: false })), ...Array.from({ length: words }, () => ({ text: 'mot', done: false }))];
    expect(mostlyLinks(listLinks(lines(2, 1))!)).toBe(true);
    expect(mostlyLinks(listLinks(lines(3, 2))!)).toBe(false);
    expect(mostlyLinks(listLinks(lines(50, 1))!)).toBe(true);
    expect(mostlyLinks(listLinks(lines(1, 0))!)).toBe(true);
    expect(mostlyLinks(listLinks(lines(1, 1))!)).toBe(false);
  });
});

describe('what is typed in a line’s place', () => {
  it('takes one address, with or without its scheme', () => {
    expect(typedAddress(' example.org/page ')).toBe('https://example.org/page');
    expect(typedAddress('https://example.org')).toBe('https://example.org');
    expect(typedAddress('deux mots')).toBeNull();
    expect(typedAddress('https://a.org https://b.org')).toBeNull();
    expect(typedAddressProblem('')).toBe('Saisissez l’adresse du lien.');
    expect(typedAddressProblem('nope')).toMatch(/^Une adresse de page/);
    expect(typedAddressProblem('example.org')).toBeNull();
  });
});

describe('names', () => {
  it('names a list by its first words, else its first page', () => {
    expect(listName([{ url: 'https://www.example.org/a', comment: '', title: '', done: false }])).toBe('example.org/a');
    expect(listName([{ url: 'https://example.org/a', comment: 'Pour Noël\nsuite', title: '', done: false }])).toBe('Pour Noël');
  });

  it('keeps a title no other goes by, case and accents aside', () => {
    expect(freeTitle('Films', ['Séries'], 100)).toBe('Films');
    expect(freeTitle('Séries', ['series', 'Series 2'], 100)).toBe('Séries 3');
    expect(freeTitle('abcdef', ['abcdef'], 6)).toBe('abcd 2');
  });
});
