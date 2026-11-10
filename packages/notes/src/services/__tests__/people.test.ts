import { afterEach, describe, expect, it } from 'vitest';

import { searchDocuments } from '@unlease/core/services/search';
import type { LinkItem, Note } from '../../models/entities';
import { linkFields, linkFromRecord, noteFields, noteFromRecord } from '../../sync/entities';
import { giftIdeasFor } from '../gifts';
import { peopleNames, setMentionNamer } from '../noteMentions';
import { buildDocument } from '../noteSearch';

const note = (id: string, over: Partial<Note> = {}): Note => ({
  id, kind: 'text', title: '', body: '', rich: false, drawing: '', color: null, pattern: null, pinned: false, archived: false, trashedAt: null, labelIds: [], position: 'a0',
  reminderAt: null, code: '', emblem: null, hint: '', modules: null, contactIds: [], createdAt: 0, deletedAt: null, editedAt: 10, ...over,
});

const link = (id: string, noteId: string, over: Partial<LinkItem> = {}): LinkItem => ({
  id, noteId, url: `https://shop.example.org/${id}`, status: 'ready', autoFile: false, filedBy: null, title: id, summary: '', siteName: '', kind: 'product',
  price: null, currency: null, priceBefore: null, priceChangedAt: null, priceCheckedAt: null, attributes: [], imageIds: [], imageUrl: null, done: false, doneAt: null, comment: '', position: 'a0', error: null, analyzedAt: null,
  lang: 'fr', copy: null, contactIds: [], createdAt: 5, deletedAt: null, ...over,
});

afterEach(() => setMentionNamer(() => null));

describe('the people a note or a link names', () => {
  it('reads and writes them, written only once someone is named', () => {
    const plain = noteFields({ ...note('n'), contactIds: [] });
    expect(plain).not.toHaveProperty('contactIds');
    const named = noteFields({ ...note('n'), contactIds: ['lea'] });
    expect(noteFromRecord({ type: 'note', id: 'n', fields: named, clocks: {} }).contactIds).toEqual(['lea']);
    expect(noteFromRecord({ type: 'note', id: 'old', fields: plain, clocks: {} }).contactIds).toEqual([]);
    const fields = linkFields({ ...link('l', 'gifts'), contactIds: ['paul'] });
    expect(linkFromRecord({ type: 'link', id: 'l', fields, clocks: {} }).contactIds).toEqual(['paul']);
  });

  it('finds a note by the names of its people, those the program names', () => {
    setMentionNamer(target => (target.type === 'contact' && target.id === 'lea' ? 'Léa Martin' : null));
    expect(peopleNames(['lea', 'gone'])).toEqual(['Léa Martin']);
    const docs = [buildDocument(note('n1', { title: 'Dîner', contactIds: ['lea'] }), [], [], []), buildDocument(note('n2', { title: 'Autre' }), [], [link('l', 'n2', { contactIds: ['lea'] })], [])];
    expect(searchDocuments(docs, 'lea').map(hit => hit.noteId).sort()).toEqual(['n1', 'n2']);
  });

  it('lists the gift ideas kept for someone: by their people, or by an older client’s comment; to buy first', () => {
    const notes = { gifts: note('gifts', { kind: 'links', title: 'Cadeaux' }), mode: note('mode', { kind: 'links', title: 'Mode' }) };
    const links = {
      a: link('a', 'gifts', { contactIds: ['lea'], createdAt: 1 }),
      b: link('b', 'gifts', { comment: 'Pour Léa Martin', createdAt: 2 }),
      c: link('c', 'gifts', { contactIds: ['merged'], done: true, createdAt: 3 }),
      d: link('d', 'gifts', { contactIds: ['paul'], comment: 'Pour Léa', createdAt: 4 }),
      e: link('e', 'mode', { contactIds: ['lea'], createdAt: 5 }),
      f: link('f', 'gifts', { contactIds: ['lea'], deletedAt: 9, createdAt: 6 }),
    };
    expect(giftIdeasFor(notes, links, { ids: ['lea', 'merged'], name: 'Léa Martin' }).map(found => found.id)).toEqual(['b', 'a', 'c']);
    expect(giftIdeasFor({ mode: notes.mode }, links, { ids: ['lea'], name: 'Léa' })).toEqual([]);
  });
});
