/** « Transformer en collection »: a list of addresses made a collection, or refused with the lines that are not links. */
import type { Fields } from '@unlease/core/sync/record';

import { INBOX_ID, type CheckItem, type LinkItem, type Note } from '../../models/entities';
import { checkFromRecord, linkFromRecord, noteFromRecord } from '../../sync/entities';
import { canBecomeCollection, listConvertedMessage, listToCollection, notLinksWords, undoListToCollection, type ListLibrary } from '../listToCollection';

const NOW = 1_800_000_000_000;
const note = (id: string, fields: Fields = {}): Note => noteFromRecord({ type: 'note', id, fields: { kind: 'text', title: '', body: '', position: 'a0', createdAt: 1, ...fields }, clocks: {} });
const check = (id: string, noteId: string, text: string, checked = false, position = id): CheckItem =>
  checkFromRecord({ type: 'check', id, fields: { noteId, text, checked, position, createdAt: 1 }, clocks: {} });
const savedLink = (id: string, fields: Fields): LinkItem => linkFromRecord({ type: 'link', id, fields: { status: 'pending', position: 'a0', createdAt: 1, ...fields }, clocks: {} });
const byId = <T extends { id: string }>(items: readonly T[]): Record<string, T> => Object.fromEntries(items.map(item => [item.id, item]));
const plain = (text: string): string => text.replace(/\u00a0/g, ' ');

function library(notes: readonly Note[], checks: readonly CheckItem[] = [], links: readonly LinkItem[] = []): ListLibrary {
  const checksByNote: Record<string, string[]> = {};
  for (const item of checks) checksByNote[item.noteId] = [...(checksByNote[item.noteId] ?? []), item.id].sort();
  return { notes: byId([note(INBOX_ID, { kind: 'links', title: 'Non classé', color: 'grey' }), ...notes]), checks: byId(checks), checksByNote, links: byId(links) };
}

describe('listToCollection', () => {
  it('makes a checklist of addresses a collection: comments, ticks, the note to the bin', () => {
    const list = note('n1', { kind: 'checklist', title: 'Cadeaux', color: 'green', pinned: true });
    const lib = library([list], [check('a', 'n1', 'Lampe – https://example.org/lampe', true), check('b', 'n1', 'https://example.org/livre?utm_source=x'), check('c', 'n1', '   ')]);
    expect(canBecomeCollection(list, lib)).toBe(true);
    const done = listToCollection(list, lib, { position: 'Zz', reading: true, now: NOW });
    if (done.status !== 'ok') throw new Error(done.status);
    const [collection, ...rest] = done.changes;
    expect(collection).toMatchObject({ type: 'note', id: done.collectionId, patch: { kind: 'links', title: 'Cadeaux', color: 'green', code: 'C', position: 'Zz', pinned: false } });
    expect(collection!.patch.emblem).toEqual(expect.any(String));
    const links = rest.filter(change => change.type === 'link').map(change => change.patch);
    expect(links.map(link => [link.url, link.comment, link.done, link.doneAt, link.filedBy, link.status, link.noteId])).toEqual([
      ['https://example.org/lampe', 'Lampe', true, NOW, 'person', 'pending', done.collectionId],
      ['https://example.org/livre', '', false, null, 'person', 'pending', done.collectionId],
    ]);
    expect(rest.at(-1)).toEqual({ type: 'note', id: 'n1', patch: { trashedAt: NOW, pinned: false } });
    expect(plain(listConvertedMessage(done.title, done.links))).toBe('Collection « Cadeaux » créée : 2 liens');

    // Taken back: the collection and its links erased, the note out of the bin, pinned again.
    const undo = undoListToCollection(list, done, NOW + 5);
    expect(undo.filter(change => change.patch.deletedAt === NOW + 5)).toHaveLength(3);
    expect(undo.at(-1)).toEqual({ type: 'note', id: 'n1', patch: { trashedAt: null, pinned: true } });
  });

  it('reads a text note’s lines, names an untitled one, keeps a free title, and copies a reading', () => {
    const text = note('n2', { body: 'https://example.org/dune Dune\n\nhttps://example.org/alien', color: 'aube' });
    const elsewhere = note('films', { kind: 'links', title: 'Dune', color: 'red' });
    const read = savedLink('k1', { noteId: 'films', url: 'https://example.org/alien', status: 'ready', title: 'Alien', kind: 'film', analyzedAt: 5 });
    const done = listToCollection(text, library([text, elsewhere], [], [read]), { position: 'a0', reading: false, now: NOW });
    if (done.status !== 'ok') throw new Error(done.status);
    // « Dune » is taken: « Dune 2 »; a gradient is no collection's colour.
    expect(done.changes[0]!.patch).toMatchObject({ title: 'Dune 2', code: 'D' });
    expect(done.changes[0]!.patch.color).not.toBe('aube');
    const links = done.changes.filter(change => change.type === 'link').map(change => change.patch);
    expect(links[0]).toMatchObject({ url: 'https://example.org/dune', status: 'skipped', comment: 'Dune' });
    expect(links[1]).toMatchObject({ url: 'https://example.org/alien', status: 'ready', title: 'Alien', kind: 'film' });
  });

  it('refuses a list with items that are not links, naming them', () => {
    const list = note('n3', { kind: 'checklist' });
    const lib = library([list], [check('a', 'n3', 'https://example.org/a'), check('b', 'n3', 'du pain'), check('c', 'n3', 'des œufs')]);
    expect(listToCollection(list, lib, { position: 'a0', reading: true, now: NOW })).toEqual({ status: 'notLinks', lines: ['du pain', 'des œufs'] });
    const prose = note('n4', { body: 'Rien que des mots' });
    expect(listToCollection(prose, library([prose]), { position: 'a0', reading: true, now: NOW })).toEqual({ status: 'notLinks', lines: ['Rien que des mots'] });
    const empty = note('n5', { kind: 'checklist' });
    expect(listToCollection(empty, library([empty]), { position: 'a0', reading: true, now: NOW })).toEqual({ status: 'empty' });
    expect(canBecomeCollection(empty, library([empty]))).toBe(false);
    expect(canBecomeCollection(note('n6', { kind: 'drawing' }), library([]))).toBe(false);
  });

  it('says what is wrong in a dialog: five items at most, then how many more', () => {
    const words = notLinksWords('checklist', ['un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept']);
    expect(words.title).toBe('Certains éléments ne sont pas des liens');
    expect(words.items).toEqual(['un', 'deux', 'trois', 'quatre', 'cinq']);
    expect(words.more).toBe('et 2 autres');
    expect(notLinksWords('text', ['seule']).title).toBe('Une ligne n’est pas un lien');
    expect(notLinksWords('text', ['seule']).more).toBeNull();
  });
});
