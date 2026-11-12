import { setLocale } from '@unlease/core/i18n';
import { INBOX_ID, INBOX_TITLE, type Label } from '../../models/entities';
import { byName, collectionsByName, labelsByName } from '../navOrder';

const label = (id: string, name: string, deletedAt: number | null = null): Label => ({ id, name, color: 'grey', position: id, createdAt: 1, deletedAt });

describe('the navigation’s order', () => {
  afterEach(() => setLocale('fr'));

  it('orders by name as a dictionary does: accents and case aside, numbers by their value', () => {
    const names = ['vins', 'Écoles', 'Films', 'Projet 10', 'Projet 2', 'émissions', 'Achats'];
    expect(byName(names, name => name)).toEqual(['Achats', 'Écoles', 'émissions', 'Films', 'Projet 2', 'Projet 10', 'vins']);
  });

  it('closes the collections with « Non classé », whatever its name in this language', () => {
    const lines = [
      { id: 'b', title: 'Restaurants' },
      { id: INBOX_ID, title: INBOX_TITLE },
      { id: 'a', title: 'Mode' },
      { id: 'c', title: 'Cadeaux' },
    ];
    expect(collectionsByName(lines).map(line => line.id)).toEqual(['c', 'a', 'b', INBOX_ID]);
  });

  it('lists the live labels by name, twins in their own order', () => {
    const labels = { a: label('a', 'Travail'), b: label('b', 'perso'), c: label('c', 'Archivé', 5), d: label('d', 'Perso') };
    expect(labelsByName(['a', 'b', 'c', 'd', 'gone'], labels).map(item => item.id)).toEqual(['b', 'd', 'a']);
  });
});
