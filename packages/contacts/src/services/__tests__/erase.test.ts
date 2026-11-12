/** « Effacer des données » in Contacts: three parts apart, counted, and the batch each one writes. */
import { emptyContact, type Contact, type ContactLabel } from '../../models/contacts';
import { eraseChanges, erasedCount, eraseParts } from '../erase';

const contact = (id: string, more: Partial<Contact> = {}): Contact => ({ ...emptyContact(id, 0), firstName: id, ...more });
const label = (id: string, more: Partial<ContactLabel> = {}): ContactLabel => ({ id, name: id, color: 'green', position: 'a0', createdAt: 0, deletedAt: null, ...more });

const LIBRARY = {
  contacts: {
    lea: contact('lea', { labelIds: ['fam'] }),
    paul: contact('paul', { favorite: true, labelIds: ['fam', 'club'] }),
    // In the bin: with the contacts, starred or not.
    old: contact('old', { favorite: true, trashedAt: 3 }),
    // Merged into Paul, a favourite: goes with him.
    paul2: contact('paul2', { mergedInto: 'paul', trashedAt: 3 }),
    // Merged into Léa: with the contacts.
    lea2: contact('lea2', { mergedInto: 'lea', trashedAt: 3 }),
    gone: contact('gone', { deletedAt: 2 }),
  },
  labels: { fam: label('fam'), club: label('club'), was: label('was', { deletedAt: 1 }) },
};

describe('erasing Contacts’ data', () => {
  it('counts three parts apart', () => {
    const parts = eraseParts(LIBRARY);
    expect(parts.map(part => [part.id, part.count, part.detail])).toEqual([
      ['contacts', 3, '3 contacts hors favoris, dont 2 dans la corbeille'],
      ['favorites', 2, '1 contact en favori, et 1 doublon fusionné dans la corbeille'],
      ['labels', 2, '2 libellés ; les contacts qui les portent restent'],
    ]);
  });

  it('erases the contacts but the favourites, and the labels off those who stay', () => {
    const writes = eraseChanges(LIBRARY, new Set(['contacts', 'labels']), 9);
    expect(writes).toEqual(
      expect.arrayContaining([
        { type: 'contact', id: 'lea', patch: { deletedAt: 9 } },
        { type: 'contact', id: 'old', patch: { deletedAt: 9 } },
        { type: 'contact', id: 'lea2', patch: { deletedAt: 9 } },
        { type: 'contactLabel', id: 'fam', patch: { deletedAt: 9 } },
        { type: 'contactLabel', id: 'club', patch: { deletedAt: 9 } },
        { type: 'contact', id: 'paul', patch: { labelIds: [] } },
      ]),
    );
    expect(writes.some(write => write.id === 'gone' || write.id === 'was' || write.id === 'paul2')).toBe(false);
    expect(erasedCount(writes)).toBe(5);
  });

  it('erases the favourites alone, with what was merged into them', () => {
    const writes = eraseChanges(LIBRARY, new Set(['favorites']), 9);
    expect(writes.map(write => write.id).sort()).toEqual(['paul', 'paul2']);
  });
});
