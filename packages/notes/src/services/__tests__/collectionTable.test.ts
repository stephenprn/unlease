import { INBOX_ID, type LinkItem } from '../../models/entities';
import { linkFromRecord } from '../../sync/entities';
import type { Fields } from '@unlease/core/sync/record';
import { arrangeColumns, collectionColumns, linkCell, placeColumn, showColumn } from '../collectionTable';

const link = (id: string, fields: Fields = {}): LinkItem =>
  linkFromRecord({ type: 'link', id, fields: { noteId: INBOX_ID, url: `https://www.example.fr/${id}`, status: 'ready', title: id, createdAt: 1, deletedAt: null, ...fields }, clocks: {} });
const facts = (pairs: Record<string, string>): Fields['attributes'] => Object.entries(pairs).map(([label, value]) => ({ label, value }));

const films = [
  link('a', { kind: 'film', attributes: facts({ Genre: 'Drame', Réalisateur: 'Agnès Varda', Année: '1962', Durée: '1 h 30', Note: '4,2/5' }) }),
  link('b', { kind: 'film', attributes: facts({ Réalisateur: 'Jacques Demy', Année: '1964', Genre: 'Comédie musicale' }) }),
  link('c', { kind: 'film', attributes: facts({ Réalisateur: 'Éric Rohmer', Durée: '1 h 45' }) }),
];

describe('a collection’s columns', () => {
  it('takes the facts its links carry, in the order Claude writes them for their kind, the most carried shown', () => {
    const columns = collectionColumns(films);
    expect(columns.map(column => column.name)).toEqual(['Site', 'Type', 'Prix', 'Réalisateur', 'Année', 'Durée', 'Genre', 'Note', 'Résumé', 'Votre note', 'Ajouté le', 'Adresse']);
    expect(columns.filter(column => column.shown).map(column => column.name)).toEqual(['Site', 'Réalisateur', 'Année', 'Durée', 'Genre']);
  });

  it('shows the kind when they differ, the price when one has it, and says a price or a source only once', () => {
    const links = [
      link('shoe', { kind: 'product', price: 89, currency: 'EUR', attributes: facts({ Marque: 'Veja', 'Taille(s)': '38 à 45' }) }),
      link('jacket', { kind: 'product', attributes: facts({ Tailles: 'S, M' }) }),
      link('gig', { kind: 'event', comment: 'Avec Léa', attributes: facts({ Prix: '25 €', Source: 'Fnac Spectacles', Lieu: 'Olympia' }) }),
    ];
    const columns = collectionColumns(links);
    const names = columns.map(column => column.name);
    expect(names.filter(name => name === 'Prix')).toHaveLength(1);
    expect(names).not.toContain('Source');
    expect(names.filter(name => /^Taille/.test(name))).toEqual(['Taille(s)']);
    expect(columns.filter(column => column.shown).map(column => column.key)).toEqual(['site', 'kind', 'price', 'fact:marque', 'fact:taille', 'fact:lieu', 'comment']);
    expect(linkCell(links[0]!, 'price', 0)).toBe('89\u00a0€');
    expect(linkCell(links[2]!, 'price', 0)).toBe('25 €');
    expect(linkCell(links[1]!, 'fact:taille', 0)).toBe('S, M');
    expect(linkCell(links[0]!, 'kind', 0)).toBe('Article');
    expect(linkCell(links[2]!, 'site', 0)).toBe('example.fr');
    expect(linkCell(links[2]!, 'fact:marque', 0)).toBe('');
  });

  it('keeps the person’s order and choice, and puts the columns they never placed after', () => {
    const columns = collectionColumns(films);
    const arranged = arrangeColumns(columns, [
      { key: 'fact:duree', shown: true },
      { key: 'site', shown: false },
      { key: 'fact:gone', shown: true },
    ]);
    expect(arranged.slice(0, 3).map(column => [column.key, column.shown])).toEqual([
      ['fact:duree', true],
      ['site', false],
      ['kind', false],
    ]);
    expect(arranged.map(column => column.key)).not.toContain('fact:gone');
    expect(arranged).toHaveLength(columns.length);
  });

  it('moves a shown column among the shown ones, and shows one again after the last shown', () => {
    const arranged = arrangeColumns(collectionColumns(films), []);
    const shownKeys = (next: readonly { key: string; shown: boolean }[]): string[] => next.filter(entry => entry.shown).map(entry => entry.key);
    expect(shownKeys(placeColumn(arranged, [], 'fact:duree', 0))).toEqual(['fact:duree', 'site', 'fact:realisateur', 'fact:annee', 'fact:genre']);
    expect(shownKeys(placeColumn(arranged, [], 'site', 9))).toEqual(['fact:realisateur', 'fact:annee', 'fact:duree', 'fact:genre', 'site']);
    const hidden = showColumn(arranged, [], 'fact:annee', false);
    expect(shownKeys(hidden)).toEqual(['site', 'fact:realisateur', 'fact:duree', 'fact:genre']);
    const back = showColumn(arrangeColumns(collectionColumns(films), hidden), hidden, 'fact:annee', true);
    expect(shownKeys(back)).toEqual(['site', 'fact:realisateur', 'fact:duree', 'fact:genre', 'fact:annee']);
    expect(shownKeys(showColumn(arranged, [], 'summary', true)).at(-1)).toBe('summary');
    // A column no link fills now keeps its place and choice for when one does.
    const placed = [{ key: 'fact:gone', shown: true }];
    expect(placeColumn(arrangeColumns(collectionColumns(films), placed), placed, 'fact:duree', 0).at(-1)).toEqual({ key: 'fact:gone', shown: true });
  });
});
