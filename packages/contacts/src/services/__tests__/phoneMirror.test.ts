import { describe, expect, it } from 'vitest';

import { mirrorChanges } from '@unlease/core/services/mirror';
import { emptyContact, type Contact } from '../../models/contacts';
import { mirroredContacts, mirroredPhotos } from '../phoneMirror';

const person = (fields: Partial<Contact>): Contact => ({ ...emptyContact(fields.id ?? 'x', fields.createdAt ?? 0), ...fields });

describe('mirroredContacts', () => {
  it('writes names, numbers whole, kinds and birthdays as Android keeps them', () => {
    const [row] = mirroredContacts(
      [
        person({
          id: 'lea',
          firstName: ' Léa ',
          lastName: 'Martin',
          company: 'Acme',
          jobTitle: 'Chef',
          phones: [
            { id: 'p1', number: '06 12 34 56 78', kind: 'mobile', label: '' },
            { id: 'p2', number: '+44 20 7946 0000', kind: 'work', label: 'Bureau Londres' },
            { id: 'p3', number: 'none', kind: 'home', label: '' },
          ],
          emails: [{ id: 'e1', address: 'lea@example.org', kind: 'main', label: '' }],
          addresses: [
            { id: 'a1', kind: 'home', label: '', street: '1 rue de la Paix', postalCode: '75002', city: 'Paris', region: '', country: 'France' },
            { id: 'a2', kind: 'work', label: '', street: ' ', postalCode: '', city: '', region: '', country: '' },
          ],
          birthday: '--03-12',
          favorite: true,
        }),
      ],
      'FR',
    );
    expect(row).toMatchObject({
      id: 'lea',
      firstName: 'Léa',
      lastName: 'Martin',
      company: 'Acme',
      jobTitle: 'Chef',
      birthday: '--03-12',
      starred: true,
      phones: [
        { value: '+33 6 12 34 56 78', kind: 'mobile', label: '' },
        { value: '+44 20 7946 0000', kind: 'custom', label: 'Bureau Londres' },
      ],
      // An email has no « main » on Android: it becomes « other ».
      emails: [{ value: 'lea@example.org', kind: 'other', label: '' }],
      addresses: [{ kind: 'home', street: '1 rue de la Paix', postalCode: '75002', city: 'Paris', country: 'France' }],
    });
  });

  it('keeps a birthday with its year, drops one that is no real day', () => {
    expect(mirroredContacts([person({ id: 'a', birthday: '1990-03-12' })], null)[0]!.birthday).toBe('1990-03-12');
    expect(mirroredContacts([person({ id: 'a', birthday: '--02-30' })], null)[0]!.birthday).toBeNull();
  });

  it('leaves out the bin, the merged and the deleted, and never the note', () => {
    const rows = mirroredContacts(
      [
        person({ id: 'kept', firstName: 'A', note: 'secret' }),
        person({ id: 'binned', trashedAt: 5 }),
        person({ id: 'merged', mergedInto: 'kept' }),
        person({ id: 'gone', deletedAt: 5 }),
      ],
      null,
    );
    expect(rows.map(row => row.id)).toEqual(['kept']);
    expect(JSON.stringify(rows)).not.toContain('secret');
    expect(mirroredPhotos([person({ id: 'kept', photoId: 'blob' }), person({ id: 'binned', trashedAt: 5, photoId: 'b2' })])).toEqual([{ id: 'kept', photoId: 'blob' }]);
  });

  it('rewrites a person only when what the phone shows changed', () => {
    const before = mirroredContacts([person({ id: 'a', firstName: 'A', note: 'one' })], null);
    const written = before.map(row => ({ id: row.id, fingerprint: row.fingerprint }));
    expect(mirrorChanges(mirroredContacts([person({ id: 'a', firstName: 'A', note: 'two' })], null), written).upserts).toEqual([]);
    expect(mirrorChanges(mirroredContacts([person({ id: 'a', firstName: 'B' })], null), written).upserts).toHaveLength(1);
    expect(mirrorChanges(mirroredContacts([person({ id: 'a', trashedAt: 1 })], null), written).deletes).toEqual(['a']);
  });
});
