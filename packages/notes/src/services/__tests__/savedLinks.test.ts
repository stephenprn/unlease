import { INBOX_ID, type LinkItem, type Note } from '../../models/entities';
import { linkFromRecord, noteFromRecord } from '../../sync/entities';
import type { Fields } from '@unlease/core/sync/record';
import { addedMessage, planLinks, readingFrom, savedAddresses } from '../savedLinks';

const line = (id: string, fields: Fields = {}): Note => noteFromRecord({ type: 'note', id, fields: { kind: 'links', title: id, ...fields }, clocks: {} });
const link = (id: string, fields: Fields = {}): LinkItem =>
  linkFromRecord({ type: 'link', id, fields: { noteId: 'films', url: `https://exemple.fr/${id}`, status: 'pending', createdAt: 1, deletedAt: null, ...fields }, clocks: {} });
const byId = <T extends { id: string }>(items: readonly T[]): Record<string, T> => Object.fromEntries(items.map(item => [item.id, item]));

const notes = byId([line(INBOX_ID, { title: 'Non classé' }), line('films', { title: 'Films' }), line('series', { title: 'Séries' }), line('cadeaux', { title: 'Cadeaux' })]);
const READ: Fields = {
  status: 'ready',
  title: 'Cléo de 5 à 7',
  summary: 'Agnès Varda, 1962.',
  siteName: 'Allociné',
  kind: 'film',
  price: null,
  currency: null,
  attributes: [{ label: 'Durée', value: '90 min' }],
  imageIds: ['img-1'],
  imageUrl: 'https://exemple.fr/cleo.jpg',
  analyzedAt: 50,
};

describe('savedAddresses', () => {
  it('keeps the live links of live collections, by their address without trackers', () => {
    const saved = savedAddresses(
      byId([
        link('a', { url: 'https://exemple.fr/cleo?utm_source=x' }),
        link('b', { url: 'https://exemple.fr/cleo', noteId: 'series' }),
        link('gone', { url: 'https://exemple.fr/cleo', deletedAt: 5 }),
        link('binned', { url: 'https://exemple.fr/cleo', noteId: 'bin' }),
        link('orphan', { url: 'https://exemple.fr/cleo', noteId: 'nowhere' }),
      ]),
      { ...notes, bin: line('bin', { trashedAt: 9 }) },
    );
    expect([...saved.keys()]).toEqual(['https://exemple.fr/cleo']);
    expect(saved.get('https://exemple.fr/cleo')!.map(item => item.id)).toEqual(['a', 'b']);
  });
});

describe('readingFrom', () => {
  it('copies the freshest reading that succeeded, never a failed or pending one', () => {
    const reading = readingFrom([link('old', { ...READ, title: 'Ancien', analyzedAt: 10 }), link('new', READ), link('failed', { status: 'failed', analyzedAt: 99 }), link('pending')]);
    expect(reading).toEqual({ ...READ, error: null });
    expect(readingFrom([link('failed', { status: 'failed', title: 'À moitié' }), link('skipped', { status: 'skipped' })])).toBeNull();
  });
});

describe('planLinks', () => {
  const saved = savedAddresses(byId([link('cleo', { ...READ, url: 'https://exemple.fr/cleo' }), link('nuit', { url: 'https://exemple.fr/nuit', noteId: 'series' })]), notes);

  it('adds nothing for an address the collection holds', () => {
    expect(planLinks(['https://exemple.fr/cleo?fbclid=z'], 'films', saved)).toEqual([{ url: 'https://exemple.fr/cleo', cleaned: 1, savedIn: ['films'], existing: 'cleo', reading: null }]);
  });

  it('adds an address another collection holds, with its reading', () => {
    const [plan] = planLinks(['https://exemple.fr/cleo'], 'cadeaux', saved);
    expect(plan).toMatchObject({ savedIn: ['films'], existing: null, reading: { ...READ, error: null } });
    expect(planLinks(['https://exemple.fr/nuit'], 'films', saved)[0]).toMatchObject({ savedIn: ['series'], existing: null, reading: null });
  });

  it('adds nothing Claude would file beside itself: any collection holding it counts', () => {
    expect(planLinks(['https://exemple.fr/nuit'], null, saved)[0]).toMatchObject({ savedIn: ['series'], existing: 'nuit' });
    expect(planLinks(['https://exemple.fr/neuf'], null, saved)[0]).toMatchObject({ savedIn: [], existing: null, reading: null });
  });

  it('plans an address once, however often it was pasted', () => {
    expect(planLinks(['https://exemple.fr/neuf', 'https://exemple.fr/neuf?utm_source=x'], 'films', saved).map(plan => plan.url)).toEqual(['https://exemple.fr/neuf']);
  });
});

describe('addedMessage', () => {
  const fresh = { existing: null, savedIn: [], cleaned: 0 };
  const here = { existing: 'x', savedIn: ['films'], cleaned: 0 };
  const twin = { existing: null, savedIn: ['series'], cleaned: 0 };

  it('says an address is already in the collection', () => {
    expect(addedMessage([here], { into: 'films', here: true }, notes)).toBe('Ce lien est déjà dans cette collection');
    expect(addedMessage([{ ...here, savedIn: ['series', 'films'] }], { into: 'films', announce: true }, notes)).toBe('Ce lien est déjà dans Films');
  });

  it('says an added address was in another collection already', () => {
    expect(addedMessage([twin], { into: 'films', here: true }, notes)).toBe('Ce lien est déjà dans Séries : ajouté ici aussi');
    expect(addedMessage([{ ...twin, cleaned: 1 }], { into: 'films', announce: true }, notes)).toBe('Ce lien est déjà dans Séries : ajouté aussi à Films · 1\u00a0traceur retiré');
    expect(addedMessage([{ ...twin, savedIn: ['series', 'cadeaux', INBOX_ID] }], { into: 'films' }, notes)).toBe('Ce lien est déjà dans 3\u00a0collections : ajouté aussi à Films');
  });

  it('says where a new link went only when asked to', () => {
    expect(addedMessage([fresh], { into: 'films', here: true }, notes)).toBeNull();
    expect(addedMessage([{ ...fresh, cleaned: 2 }], { into: 'films', announce: true }, notes)).toBe('Ajouté à Films · 2\u00a0traceurs retirés');
    expect(addedMessage([fresh, fresh], { into: 'films' }, notes)).toBeNull();
  });

  it('counts a paste of several addresses', () => {
    expect(addedMessage([fresh, twin, here], { into: 'films', here: true }, notes)).toBe('2\u00a0liens ajoutés ici, dont 1 déjà dans Séries · 1\u00a0lien déjà dans cette collection');
    expect(addedMessage([fresh, { ...fresh, cleaned: 1 }, here], { into: 'films', announce: true }, notes)).toBe('2\u00a0liens ajoutés à Films · 1\u00a0lien déjà dans Films · 1\u00a0traceur retiré');
    expect(addedMessage([here, here], { into: 'films', here: true }, notes)).toBe('2\u00a0liens déjà dans cette collection');
  });

  it('names where Claude would have filed an address saved already', () => {
    const saved = { existing: 'x', savedIn: ['series'], cleaned: 0 };
    expect(addedMessage([saved], { into: null }, notes)).toBe('Ce lien est déjà dans Séries');
    expect(addedMessage([fresh, saved, { ...saved, savedIn: ['films', 'series'] }], { into: null }, notes)).toBe('2\u00a0liens déjà dans Séries et Films');
    // Reading off: new links stay in "Non classé", and the slip says so.
    expect(addedMessage([fresh, saved], { into: INBOX_ID, announce: true }, notes)).toBe('1\u00a0lien ajouté à Non classé · 1\u00a0lien déjà dans Séries');
    expect(addedMessage([{ ...saved, savedIn: [INBOX_ID] }], { into: INBOX_ID, announce: true }, notes)).toBe('Ce lien est déjà dans Non classé');
  });
});
