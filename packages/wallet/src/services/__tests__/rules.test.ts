import { barcodeProblem, gs1CheckDigit, guessFormat } from '../../models/barcode';
import { EMPTY_DETAILS, type WalletItem } from '../../models/item';
import { discardable, expiryOf, keepTermOf, plannedReminders } from '../expiry';
import { orderCards } from '../order';
import { searchItems } from '../search';

const item = (over: Partial<Omit<WalletItem, 'details'>> & { details?: Partial<WalletItem['details']> } = {}): WalletItem => ({
  id: over.id ?? 'i',
  locked: false,
  tier: over.tier ?? 'papers',
  kind: over.kind ?? 'document',
  title: over.title ?? '',
  notes: over.notes ?? '',
  text: over.text ?? '',
  usage: over.usage ?? { count: 0, at: null },
  favourite: over.favourite ?? false,
  fileIds: [],
  createdAt: over.createdAt ?? 0,
  deletedAt: over.deletedAt ?? null,
  editedAt: over.editedAt ?? 0,
  details: { ...EMPTY_DETAILS, ...over.details },
});

describe('barcodes', () => {
  it('checks GS1 digits', () => {
    expect(gs1CheckDigit('400638133393')).toBe(1);
    expect(barcodeProblem('ean13', '4006381333931')).toBeNull();
    expect(barcodeProblem('ean13', '4006381333932')).toBe('checkDigit');
    expect(barcodeProblem('ean13', '400638133393')).toBe('length');
    expect(barcodeProblem('ean8', '96385074')).toBeNull();
    expect(barcodeProblem('upcA', '036000291452')).toBeNull();
    expect(barcodeProblem('upcE', '04252614')).toBeNull();
    expect(barcodeProblem('itf', '123')).toBe('length');
    expect(barcodeProblem('code39', 'abc')).toBe('characters');
    expect(barcodeProblem('code128', 'Carte 12-34')).toBeNull();
    expect(barcodeProblem('qr', 'https://example.org/card/123')).toBeNull();
  });

  it('guesses a typed number’s format', () => {
    expect(guessFormat('4006381333931')).toBe('ean13');
    expect(guessFormat('4006381333932')).toBe('code128');
    expect(guessFormat('A-123')).toBe('code128');
  });
});

describe('expiry', () => {
  it('says where a paper stands', () => {
    const passport = item({ kind: 'passport', details: { expiresOn: '2027-03-01' } });
    expect(expiryOf(passport, '2026-11-18')).toEqual({ tone: 'soon', days: 103 });
    expect(expiryOf(passport, '2026-01-01').tone).toBe('valid');
    expect(expiryOf(passport, '2027-03-01')).toEqual({ tone: 'soon', days: 0 });
    expect(expiryOf(passport, '2027-03-02')).toEqual({ tone: 'expired', days: -1 });
    expect(expiryOf(item(), '2026-11-18')).toEqual({ tone: 'none', days: null });
  });

  it('plans reminders ahead, rings a missed one still worth it, and skips the bin', () => {
    const passport = item({ id: 'p', kind: 'passport', details: { expiresOn: '2027-06-30' } });
    const gift = item({ id: 'g', tier: 'cards', kind: 'giftCard', details: { expiresOn: '2026-12-01', remind: [30, 10] } });
    const binned = item({ id: 'b', kind: 'idCard', details: { expiresOn: '2027-01-01' }, deletedAt: 5 });
    const plan = plannedReminders([passport, gift, binned], '2026-11-18');
    expect(plan.map(r => [r.itemId, r.day, r.daysBefore])).toEqual([
      ['g', '2026-11-21', 10],
      ['p', '2026-12-30', 182],
      ['p', '2027-05-31', 30],
    ]);
    const late = plannedReminders([gift], '2026-11-03');
    expect(late.map(r => [r.day, r.daysBefore])).toEqual([
      ['2026-11-03', 30],
      ['2026-11-21', 10],
    ]);
  });

  it('keeps documents as long as France asks', () => {
    const doc = (docType: WalletItem['details']['docType'], details: Partial<WalletItem['details']> = {}) => item({ details: { docType, ...details } });
    expect(keepTermOf(doc('tax', { docDate: '2026-09-01' }))).toBe('2028-12-31');
    expect(keepTermOf(doc('bank', { docDate: '2026-02-28' }))).toBe('2031-02-28');
    expect(keepTermOf(doc('insurance', { expiresOn: '2027-01-01' }))).toBe('2029-01-01');
    expect(keepTermOf(doc('insurance'))).toBeNull();
    expect(keepTermOf(doc('purchase', { docDate: '2026-01-10', expiresOn: '2028-01-10' }))).toBe('2028-01-10');
    expect(keepTermOf(doc('purchase', { docDate: '2026-01-10' }))).toBe('2031-01-10');
    expect(keepTermOf(doc('work', { docDate: '2026-01-10' }))).toBe('retirement');
    expect(keepTermOf(doc('family'))).toBe('forever');
    expect(keepTermOf(doc('tax', { docDate: '2026-09-01', keepUntil: 'forever' }))).toBe('forever');
    expect(keepTermOf(item({ kind: 'passport' }))).toBeNull();
    const old = doc('utilities', { docDate: '2020-01-01' });
    expect(discardable([old, doc('family'), doc('utilities', { docDate: '2025-01-01' })], '2026-11-18')).toEqual([old]);
  });
});

describe('places', () => {
  it('orders cards: favourites, then the most used lately, then by name', () => {
    const now = Date.UTC(2026, 10, 18);
    const day = 86_400_000;
    const cards = [
      item({ id: 'a', title: 'Zèbre' }),
      item({ id: 'b', title: 'Bio', usage: { count: 20, at: now - 200 * day } }),
      item({ id: 'c', title: 'Café', usage: { count: 3, at: now - day } }),
      item({ id: 'd', title: 'Atelier', favourite: true }),
      item({ id: 'e', title: 'Abeille' }),
    ];
    expect(orderCards(cards, now).map(card => card.id)).toEqual(['d', 'c', 'b', 'e', 'a']);
  });

  it('finds an item by its words, accents or not, and never in the bin', () => {
    const items = [
      item({ id: 'a', title: 'Avis d’impôt 2026', details: { docType: 'tax', issuer: 'DGFiP' } }),
      item({ id: 'b', title: 'Bail', text: 'Le présent contrat de location…' }),
      item({ id: 'c', title: 'Impôt ancien', deletedAt: 1 }),
    ];
    expect(searchItems(items, 'impot').map(found => found.id)).toEqual(['a']);
    expect(searchItems(items, 'location').map(found => found.id)).toEqual(['b']);
    expect(searchItems(items, 'dgfip 2026').map(found => found.id)).toEqual(['a']);
    expect(searchItems(items, '')).toEqual([]);
  });
});

import { passphraseStrength } from '../passphrase';

describe('passphrase strength', () => {
  it('prefers words of one’s own to a short password with symbols', () => {
    expect(passphraseStrength('P@ss1').level).toBe('weak');
    expect(passphraseStrength('P@ss1').tooShort).toBe(true);
    expect(passphraseStrength('aaaaaaaaaaaaaaaa').level).toBe('weak');
    expect(passphraseStrength('abcdefghijklmnop').level).toBe('weak');
    expect(passphraseStrength('le chat dort sur la valise bleue').level).toBe('good');
    expect(passphraseStrength('Tr0mpette-Ver7e').level).not.toBe('weak');
  });
});

import { readDay, typedDay } from '../days';

describe('typed days', () => {
  it('reads a day as a phone types it, day first', () => {
    expect(readDay('12/03/2031')).toBe('2031-03-12');
    expect(readDay('12.3.31')).toBe('2031-03-12');
    expect(readDay('2031-03-12')).toBe('2031-03-12');
    expect(readDay('31/02/2031')).toBeNull();
    expect(readDay('12/03')).toBeNull();
    expect(readDay('06/12/65', true)).toBe('1965-12-06');
    expect(typedDay('2031-03-12')).toBe('12/03/2031');
  });
});
