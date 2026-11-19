import { toBase64Url, utf8 } from '@unlease/core/services/bytes';
import { findGoogleWalletLink, numberInPassId, readGoogleWalletLink } from '../googleWallet';

/** A link as Google Wallet shares one, around a made-up pass (the signature is not checked here). */
function link(payload: unknown, typ = 'savetogooglepay'): string {
  const head = toBase64Url(utf8(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const body = toBase64Url(utf8(JSON.stringify({ aud: 'google', iss: 'wallet-passes-sharing@system.gserviceaccount.com', typ, payload })));
  return `https://pay.google.com/gp/v/save/${head}.${body}.c2lnbmF0dXJl`;
}

const SHARED = link({ loyaltyObjects: [{ classId: '3388000000012345678.CLUBmember', id: '3388000000012345678.M-0123456789-20260101093000' }] });

describe('Google Wallet links', () => {
  it('finds the link among the words a share brings', () => {
    expect(findGoogleWalletLink(`Ma carte de fidélité ${SHARED} via Google Wallet`)).toBe(SHARED);
    expect(findGoogleWalletLink('https://example.org/gp/v/save/abc.def.ghi')).toBeNull();
    // A keyboard asked for capitals raised a letter of the address.
    expect(readGoogleWalletLink(SHARED.replace('/gp/v/', '/gp/V/'))?.number).toBe('0123456789');
  });

  it('reads a pass shared from the Wallet app: its number from its id, its class as a hint', () => {
    expect(readGoogleWalletLink(SHARED)).toEqual({ kind: 'card', title: '', number: '0123456789', barcode: null, program: 'CLUBmember' });
  });

  it('takes the number from an id, never a date', () => {
    expect(numberInPassId('3388000000012345678.M-0123456789-20260101093000')).toBe('0123456789');
    expect(numberInPassId('3388000000012345678.20260101')).toBe('');
    expect(numberInPassId('3388000000012345678.member_4006381333931')).toBe('4006381333931');
    expect(numberInPassId('3388000000012345678.abc')).toBe('');
  });

  it('takes a whole pass as a shop’s site writes it', () => {
    const card = readGoogleWalletLink(
      link({
        loyaltyClasses: [{ id: '3388000000012345678.club', programName: 'Club Boulangerie' }],
        loyaltyObjects: [{ id: '3388000000012345678.x1', classId: '3388000000012345678.club', accountId: '4006381333931', barcode: { type: 'EAN_13', value: '4006381333931' } }],
      }),
    );
    expect(card).toEqual({ kind: 'card', title: 'Club Boulangerie', number: '4006381333931', barcode: { format: 'ean13', value: '4006381333931' }, program: 'club' });
  });

  it('reads a gift card, and leaves a barcode out when its value cannot be drawn', () => {
    const card = readGoogleWalletLink(link({ giftCardObjects: [{ id: '1.g', classId: '1.gift', cardNumber: '1234', barcode: { type: 'EAN_13', value: '12' } }] }));
    expect(card).toMatchObject({ kind: 'giftCard', number: '1234', barcode: null });
  });

  it('refuses what is not a card or not a Wallet token', () => {
    expect(readGoogleWalletLink(link({ flightObjects: [{ id: '1.f', classId: '1.c' }] }))).toBeNull();
    expect(readGoogleWalletLink(link({ loyaltyObjects: [{ id: '1.x' }] }, 'other'))).toBeNull();
    expect(readGoogleWalletLink('https://pay.google.com/gp/v/save/abc.%%%.def')).toBeNull();
    expect(readGoogleWalletLink('https://pay.google.com/gp/v/save/abc.bm90IGpzb24.def')).toBeNull();
  });
});
