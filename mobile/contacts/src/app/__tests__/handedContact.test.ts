/**
 * Another app's « Créer un contact » (Android's INSERT extras, as IntakeModule hands them): read into
 * the new contact's form, each value in its field and each number with its kind.
 */
import { handedContact, handedDraft } from '../handedContact';

describe('another app’s new contact', () => {
  it('splits the name and keeps each number’s kind, a custom type as its label', () => {
    const handed = handedContact({
      name: '  Léa  Marie Martin ',
      phone: '+33 6 12 34 56 78',
      phone_type: 2,
      secondary_phone: '01 23 45 67 89',
      secondary_phone_type: 3,
      tertiary_phone: '04 72 00 00 00',
      tertiary_phone_type: 'Chalet',
      email: 'lea@example.org',
      email_type: 2,
      secondary_email: 'LEA@example.org',
      company: 'Atelier Nord',
      job_title: 'Architecte',
      postal: '12 rue des Lilas\n69003 Lyon',
      postal_type: 1,
      notes: 'Rencontrée au salon',
      phonetic_name: 'lé a',
    });
    expect(handed).toEqual({
      firstName: 'Léa Marie',
      lastName: 'Martin',
      company: 'Atelier Nord',
      jobTitle: 'Architecte',
      phones: [
        { number: '+33 6 12 34 56 78', kind: 'mobile', label: '' },
        { number: '01 23 45 67 89', kind: 'work', label: '' },
        { number: '04 72 00 00 00', kind: 'other', label: 'Chalet' },
      ],
      // The same address twice is one.
      emails: [{ address: 'lea@example.org', kind: 'work', label: '' }],
      addresses: [{ kind: 'home', label: '', street: '12 rue des Lilas\n69003 Lyon', postalCode: '', city: '', region: '', country: '' }],
      birthday: null,
      note: 'Rencontrée au salon',
    });
  });

  it('gives a number without a type the form’s kinds, and a single word is the first name', () => {
    const handed = handedContact({ name: 'Plombier', phone: '06 00 00 00 01', secondary_phone: '06 00 00 00 02', email: 'p@example.org' });
    expect(handed).toMatchObject({ firstName: 'Plombier', lastName: '' });
    expect(handed.phones.map(phone => phone.kind)).toEqual(['mobile', 'home']);
    expect(handed.emails[0]).toEqual({ address: 'p@example.org', kind: 'home', label: '' });
  });

  it('reads the data rows: the name’s parts, numbers, an address in its parts, the birthday, websites in the note', () => {
    const handed = handedContact({
      phone: '06 12 34 56 78',
      data: [
        { mimetype: 'vnd.android.cursor.item/name', data1: 'Dr Hugo Garnier', data2: 'Hugo', data3: 'Garnier' },
        // The same number again (written another way) is one.
        { mimetype: 'vnd.android.cursor.item/phone_v2', data1: '+33 6 12 34 56 78', data2: '1' },
        { mimetype: 'vnd.android.cursor.item/phone_v2', data1: '09 87 65 43 21', data2: '0', data3: 'Bateau' },
        { mimetype: 'vnd.android.cursor.item/email_v2', data1: 'hugo@example.org', data2: '1' },
        { mimetype: 'vnd.android.cursor.item/organization', data1: 'Garnier & fils', data4: 'Gérant' },
        { mimetype: 'vnd.android.cursor.item/postal-address_v2', data2: '2', data4: '3 quai Rambaud', data7: 'Lyon', data9: '69002', data10: 'France' },
        { mimetype: 'vnd.android.cursor.item/contact_event', data1: '--02-29', data2: '3' },
        { mimetype: 'vnd.android.cursor.item/website', data1: 'https://garnier.example.org' },
        { mimetype: 'vnd.android.cursor.item/photo', data15: 'bytes' },
      ],
    });
    expect(handed).toMatchObject({ firstName: 'Hugo', lastName: 'Garnier', company: 'Garnier & fils', jobTitle: 'Gérant', birthday: '--02-29', note: 'https://garnier.example.org' });
    expect(handed.phones).toEqual([
      { number: '06 12 34 56 78', kind: 'mobile', label: '' },
      { number: '09 87 65 43 21', kind: 'other', label: 'Bateau' },
    ]);
    expect(handed.emails).toEqual([{ address: 'hugo@example.org', kind: 'home', label: '' }]);
    expect(handed.addresses).toEqual([{ kind: 'work', label: '', street: '3 quai Rambaud', postalCode: '69002', city: 'Lyon', region: '', country: 'France' }]);
  });

  it('leaves out what does not read, and a birthday that is no day', () => {
    const handed = handedContact({ name: 42, phone: { number: '1' }, data: [{ mimetype: 'vnd.android.cursor.item/contact_event', data1: '1990-02-30', data2: '3' }, 'nonsense'] });
    expect(handed).toEqual({ firstName: '42', lastName: '', company: '', jobTitle: '', phones: [], emails: [], addresses: [], birthday: null, note: '' });
    expect(handedContact(null).phones).toEqual([]);
  });

  it('gives the form a number and an e-mail row to fill when none came, each row its own id', () => {
    let next = 0;
    const draft = handedDraft(handedContact({ name: 'Nina Faure', postal: 'Lyon' }), () => `id-${(next += 1)}`);
    expect(draft.phones).toEqual([{ id: 'id-1', number: '', kind: 'mobile', label: '' }]);
    expect(draft.emails).toEqual([{ id: 'id-2', address: '', kind: 'home', label: '' }]);
    expect(draft.addresses).toEqual([expect.objectContaining({ id: 'id-3', street: 'Lyon' })]);
  });
});
