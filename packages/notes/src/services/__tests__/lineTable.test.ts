import type { Fields } from '@unlease/core/sync/record';
import type { LinkItem } from '../../models/entities';
import { linkFromRecord } from '../../sync/entities';
import { columnValue, lineColumns } from '../lineTable';

const link = (id: string, kind: string, attributes: readonly [string, string][]): LinkItem =>
  linkFromRecord({
    type: 'link',
    id,
    fields: { noteId: 'mode', url: `https://exemple.fr/${id}`, status: 'ready', kind, attributes: attributes.map(([label, value]) => ({ label, value })), createdAt: 1, deletedAt: null } as Fields,
    clocks: {},
  });

describe('a collection as a table', () => {
  it('makes a column of each fact most links wear, the kind’s own first', () => {
    const links = [
      link('veste', 'product', [['Matière', 'Laine bouillie'], ['Couleur', 'Camel'], ['Prix', '189 €'], ['Coupe', 'Droite']]),
      link('pull', 'product', [['couleur', 'Marine'], ['Matière', 'Mérinos'], ['Marque', 'Knit & Purl']]),
      link('baskets', 'product', [['Couleur', 'Blanc'], ['Marque', 'Side Step'], ['Pointure', '42']]),
      link('sac', 'product', []),
    ];
    // « Coupe » and « Pointure » are on one link each; the price has its own column.
    expect(lineColumns(links)).toEqual([
      { key: 'marque', label: 'Marque' },
      { key: 'couleur', label: 'Couleur' },
      { key: 'matiere', label: 'Matière' },
    ]);
    expect(columnValue(links[1]!, { key: 'couleur', label: 'Couleur' })).toBe('Marine');
    expect(columnValue(links[3]!, { key: 'couleur', label: 'Couleur' })).toBe('');
  });

  it('keeps a lone link’s facts, and four columns at most', () => {
    expect(lineColumns([link('film', 'film', [['Année', '1999'], ['Réalisateur', 'Lynne Ramsay']])]).map(column => column.label)).toEqual(['Réalisateur', 'Année']);
    const many = [1, 2].map(n => link(`l${n}`, 'other', ['A', 'B', 'C', 'D', 'E'].map(label => [label, `${label}${n}`] as [string, string])));
    expect(lineColumns(many).map(column => column.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(lineColumns([])).toEqual([]);
  });
});
