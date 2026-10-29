import { INBOX_ID, type LinkItem, type Note } from '../../models/entities';
import { linkFromRecord, noteFromRecord } from '../../sync/entities';
import type { Fields } from '@unlease/core/sync/record';
import { parseSortRequest, parseSortResponse, SORT_LIMITS } from '../../sync/sorting';
import { capTargets, collectionsWithLinks, inboxToSort, meaningChanged, sortedSummary, sortLink, sortTargets } from '../sorting';

const line = (id: string, fields: Fields = {}): Note => noteFromRecord({ type: 'note', id, fields: { kind: 'links', title: id, ...fields }, clocks: {} });
const link = (id: string, fields: Fields = {}): LinkItem =>
  linkFromRecord({ type: 'link', id, fields: { noteId: INBOX_ID, url: `https://example.fr/${id}`, status: 'ready', title: id, createdAt: 1, deletedAt: null, ...fields }, clocks: {} });

describe('sortTargets', () => {
  it('shows each collection with its sentence and the titles of its five newest links', () => {
    const links = [
      ...Array.from({ length: 7 }, (_, index) => link(`m${index}`, { noteId: 'mode', title: `Habit ${index}`, createdAt: index })),
      link('untitled', { noteId: 'mode', title: '', createdAt: 99 }),
      link('gone', { noteId: 'mode', title: 'Supprimé', createdAt: 100, deletedAt: 5 }),
      link('elsewhere', { noteId: 'ailleurs', title: 'Ailleurs', createdAt: 100 }),
    ];
    expect(sortTargets([line('mode', { title: 'Mode', hint: 'Vêtements' }), line('films', { title: '  ' })], links)).toEqual([
      { id: 'mode', title: 'Mode', hint: 'Vêtements', examples: ['Habit 6', 'Habit 5', 'Habit 4', 'Habit 3', 'Habit 2'] },
      { id: 'films', title: 'Sans titre', hint: '', examples: [] },
    ]);
  });

  it('names "Non classé" when its title is empty', () => {
    expect(sortTargets([line(INBOX_ID, { title: '' })], [])[0]!.title).toBe('Non classé');
  });
});

describe('what Claude may sort', () => {
  it('sorts "Non classé" except what the person put there and what is still being read', () => {
    const links = [link('mine', { filedBy: 'person' }), link('reading', { status: 'pending' }), link('landed'), link('claude', { filedBy: 'claude' }), link('filed', { noteId: 'mode' })];
    expect(inboxToSort(links).map(item => item.id)).toEqual(['landed', 'claude']);
  });

  it('sends a link as its reading left it, without its pictures', () => {
    const item = link('l1', { title: 'Veste', siteName: 'Zara', kind: 'product', summary: 'Une veste.', attributes: [{ label: 'Couleur', value: 'Bleu' }], imageIds: ['img1'] });
    expect(sortLink(item)).toEqual({ id: 'l1', url: 'https://example.fr/l1', title: 'Veste', site: 'Zara', kind: 'product', summary: 'Une veste.', facts: ['Couleur : Bleu'] });
  });
});

describe('collectionsWithLinks', () => {
  it('names the collections holding links, never "Non classé" nor a plain note', () => {
    const notes = { mode: line('mode'), vide: line('vide'), [INBOX_ID]: line(INBOX_ID), idee: noteFromRecord({ type: 'note', id: 'idee', fields: { kind: 'text', title: 'Idée' }, clocks: {} }) };
    const linksByNote = { mode: ['a'], [INBOX_ID]: ['b'], idee: [] };
    expect(collectionsWithLinks(['idee', INBOX_ID, 'vide', 'mode'], notes, linksByNote)).toEqual(['mode']);
  });
});

describe('meaningChanged', () => {
  const mode = { title: 'Restaurants', hint: 'Restaurants, cafés et bars à essayer.' };

  it('lets a typo, a case or an accent pass', () => {
    expect(meaningChanged(mode, { ...mode, title: 'Restaurant' })).toBe(false);
    expect(meaningChanged(mode, { ...mode, title: 'restaurants' })).toBe(false);
    expect(meaningChanged(mode, { ...mode, hint: 'Restaurants, cafes et bars a essayer.' })).toBe(false);
    expect(meaningChanged({ title: 'Films & séries', hint: '' }, { title: 'Films et séries', hint: '' })).toBe(false);
  });

  it('sees a new name or a new sentence', () => {
    expect(meaningChanged(mode, { ...mode, title: 'Restaurants à Lyon' })).toBe(true);
    expect(meaningChanged({ title: 'Bar', hint: '' }, { title: 'Bio', hint: '' })).toBe(true);
    expect(meaningChanged(mode, { ...mode, hint: 'Restaurants végétariens seulement.' })).toBe(true);
    expect(meaningChanged({ title: 'Mode', hint: '' }, { title: 'Mode', hint: 'Vêtements' })).toBe(true);
  });
});

describe('sortedSummary', () => {
  const titleOf = (id: string) => ({ mode: 'Mode', films: 'Films' })[id] ?? id;

  it('names the collection when all went to one', () => {
    expect(sortedSummary([{ link: 'a', to: 'mode' }], titleOf)).toBe('1 lien rangé dans Mode');
    expect(sortedSummary([{ link: 'a', to: 'mode' }, { link: 'b', to: 'mode' }], titleOf)).toBe('2 liens rangés dans Mode');
  });

  it('counts the collections otherwise', () => {
    expect(sortedSummary([{ link: 'a', to: 'mode' }, { link: 'b', to: 'films' }], titleOf)).toBe('2 liens rangés dans 2 collections');
  });
});

describe('the sorting request', () => {
  const target = { id: 'mode', title: 'Mode', hint: '', examples: [] };
  const item = { id: 'l1', url: 'https://example.fr', title: 'Veste', site: '', kind: 'product', summary: '', facts: [] };

  it('keeps "Non classé" out of the targets, and each link once', () => {
    const request = parseSortRequest({ task: 'file', targets: [target, { id: INBOX_ID, title: 'Non classé' }, target], links: [item, item] });
    expect(request).toEqual({ task: 'file', from: null, targets: [target], links: [item] });
  });

  it('clips long texts and reads an unknown kind as "other"', () => {
    const request = parseSortRequest({ task: 'file', targets: [{ ...target, examples: Array(9).fill('x'.repeat(500)) }], links: [{ ...item, kind: 'vaisseau', title: 'y'.repeat(1000) }] });
    expect(request!.targets[0]!.examples).toHaveLength(SORT_LIMITS.examples);
    expect(request!.targets[0]!.examples[0]).toHaveLength(200);
    expect(request!.links[0]).toMatchObject({ kind: 'other', title: 'y'.repeat(300) });
  });

  it('needs links, a target, and for a review the collection being reviewed among the targets', () => {
    expect(parseSortRequest({ task: 'file', targets: [target], links: [] })).toBeNull();
    expect(parseSortRequest({ task: 'file', targets: [], links: [item] })).toBeNull();
    expect(parseSortRequest({ task: 'review', from: 'films', targets: [target], links: [item] })).toBeNull();
    expect(parseSortRequest({ task: 'review', from: 'mode', targets: [target], links: [item] })).toMatchObject({ task: 'review', from: 'mode' });
    expect(parseSortRequest({ task: 'file', targets: [target], links: [{ ...item, id: 'pas un id !' }] })).toBeNull();
  });

  it('reads an answer, dropping malformed moves', () => {
    expect(parseSortResponse({ moves: [{ link: 'l1', to: 'mode' }, { link: 'l2' }, null, { link: 'l3', to: 4 }] })).toEqual({ moves: [{ link: 'l1', to: 'mode' }], incomplete: null });
    expect(parseSortResponse({ moves: [], incomplete: 'Tri refusé par Claude' })).toEqual({ moves: [], incomplete: 'Tri refusé par Claude' });
    expect(parseSortResponse({})).toBeNull();
  });

  it('caps the targets, a reviewed collection always among them', () => {
    const many = Array.from({ length: SORT_LIMITS.targets + 5 }, (_, index) => ({ ...target, id: `c${index}` }));
    expect(capTargets(many)).toHaveLength(SORT_LIMITS.targets);
    const capped = capTargets(many, `c${SORT_LIMITS.targets + 4}`);
    expect(capped).toHaveLength(SORT_LIMITS.targets);
    expect(capped[0]!.id).toBe(`c${SORT_LIMITS.targets + 4}`);
  });
});
