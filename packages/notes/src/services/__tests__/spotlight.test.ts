import type { Block, BlockKind } from '../../models/blocks';
import type { CheckItem, Label, LinkItem, Note } from '../../models/entities';
import { blockFields, blockFromRecord } from '../../sync/entities';
import { ROOT, type ChildIndex } from '../blocks';
import { buildIndex, parseQuery, search } from '@unlease/core/services/searchIndex';
import { linkTitle, parseSpotKey, spotKey, spotlightDocs, type SpotLibrary } from '../spotlight';

const note = (id: string, over: Partial<Note> = {}): Note => ({
  id, kind: 'text', title: '', body: '', rich: false, drawing: '', color: null, pattern: null, pinned: false, archived: false, trashedAt: null, labelIds: [], position: 'a0',
  reminderAt: null, code: '', emblem: null, hint: '', modules: null, createdAt: 0, deletedAt: null, editedAt: 10, ...over,
});

const check = (id: string, noteId: string, text: string, editedAt = 10): CheckItem => ({ id, noteId, text, checked: false, position: 'a0', indent: 0, createdAt: 0, deletedAt: null, editedAt });

const link = (id: string, noteId: string, over: Partial<LinkItem> = {}): LinkItem => ({
  id, noteId, url: 'https://www.example.org/films/dune-part-two', status: 'ready', autoFile: false, filedBy: null, title: '', summary: '', siteName: '', kind: 'other',
  price: null, currency: null, attributes: [], imageIds: [], imageUrl: null, done: false, doneAt: null, comment: '', position: 'a0', error: null, analyzedAt: null,
  lang: 'fr', createdAt: 5, deletedAt: null, ...over,
});

const label = (id: string, name: string): Label => ({ id, name, color: 'blue', position: 'a0', createdAt: 0, deletedAt: null });

function block(id: string, kind: BlockKind, parentId: string | null, extra: Partial<Block> = {}): Block {
  return blockFromRecord({ type: 'block', id, fields: blockFields({ parentId, position: 'a0', kind, createdAt: 0, ...extra }), clocks: {} });
}

function library(): SpotLibrary {
  const notes = [
    note('courses', { kind: 'checklist', title: 'Courses', labelIds: ['maison'] }),
    note('idee', { body: 'Planter des tomates\n\nArroser le soir' }),
    note('films', { kind: 'links', title: 'Films', hint: 'Les films à voir' }),
    note('vieux', { title: 'À la corbeille', trashedAt: 20 }),
  ];
  const blocks = [
    block('voyage', 'page', null, { text: 'Voyage' }),
    block('titre', 'h2', 'voyage', { text: 'Lisbonne' }),
    block('para', 'text', 'voyage', { text: 'Le {b:Tage} au soleil' }),
    block('photo', 'image', 'voyage', { fileName: 'tram.jpg', caption: 'Le tram 28' }),
    block('jour', 'page', 'voyage', { text: 'Jour 1' }),
    block('jeté', 'page', null, { text: 'Jeté', trashedAt: 30 }),
  ];
  const children: Record<string, string[]> = {};
  for (const entry of blocks) (children[entry.parentId ?? ROOT] ??= []).push(entry.id);
  return {
    notes: Object.fromEntries(notes.map(entry => [entry.id, entry])),
    checks: { c1: check('c1', 'courses', 'Pain', 50), c2: check('c2', 'courses', 'Beurre') },
    links: {
      dune: link('dune', 'films', { title: 'Dune : deuxième partie', siteName: 'Allociné', kind: 'film', summary: 'Paul Atréides s’allie aux Fremen.', attributes: [{ label: 'Réalisateur', value: 'Denis Villeneuve' }], comment: 'Avec Léa' }),
      unread: link('unread', 'films', { url: 'https://www.example.org/films/the-brutalist-2024', title: '' }),
    },
    labels: { maison: label('maison', 'Maison') },
    attachments: {},
    blocks: Object.fromEntries(blocks.map(entry => [entry.id, entry])),
    blocksByParent: children as ChildIndex,
    checksByNote: { courses: ['c1', 'c2'] },
    linksByNote: { films: ['dune', 'unread'] },
    attachmentsByNote: {},
    noteOrder: notes.map(entry => entry.id),
  };
}

describe('the spotlight’s documents', () => {
  const docs = spotlightDocs(library(), () => '');
  const byKey = (key: string) => docs.find(entry => entry.key === key);

  it('holds every live page, note, collection and link, nothing in the bin', () => {
    expect(docs.map(entry => entry.key).sort()).toEqual(['collection:films', 'link:dune', 'link:unread', 'note:courses', 'note:idee', 'page:jour', 'page:voyage']);
    expect(parseSpotKey(spotKey('link', 'a:b'))).toEqual({ type: 'link', id: 'a:b' });
    expect(parseSpotKey('nothing')).toBeNull();
  });

  it('reads a note’s lines and items (each item where a hit opens), its labels as meta, its first line as a heading when untitled', () => {
    expect(byKey('note:courses')).toMatchObject({
      title: 'Courses',
      parts: [{ text: 'Pain', role: 'body', ref: 'c1' }, { text: 'Beurre', role: 'body', ref: 'c2' }, { text: 'Maison', role: 'meta' }],
      editedAt: 50,
      meta: { type: 'note', labelIds: ['maison'], within: null },
    });
    expect(byKey('note:idee')!.parts).toEqual([{ text: 'Planter des tomates', role: 'heading', ref: null }, { text: 'Arroser le soir', role: 'body', ref: null }]);
  });

  it('reads a link as its row does, with its site, kind and collection as meta', () => {
    const dune = byKey('link:dune')!;
    expect(dune.title).toBe('Dune : deuxième partie');
    expect(dune.parts.filter(part => part.role === 'meta').map(part => part.text)).toEqual(['Allociné', 'Film', 'Films', 'https://www.example.org/films/dune-part-two']);
    expect(dune.meta).toMatchObject({ type: 'link', within: 'films' });
    expect(byKey('link:unread')!.title).toBe(linkTitle(library().links.unread!));
    expect(byKey('collection:films')).toMatchObject({ title: 'Films', parts: [{ text: 'Les films à voir', role: 'body' }] });
  });

  it('reads a page’s own blocks, headings apart and files as meta, each where a hit opens', () => {
    expect(byKey('page:voyage')).toMatchObject({
      title: 'Voyage',
      parts: [
        { text: 'Lisbonne', role: 'heading', ref: 'titre' },
        { text: 'Le Tage au soleil', role: 'body', ref: 'para' },
        { text: 'tram.jpg\nLe tram 28', role: 'meta', ref: 'photo' },
      ],
      meta: { type: 'page', within: null },
    });
    expect(byKey('page:jour')!.meta.within).toBe('voyage');
  });

  it('finds the film by its collection and its title, and the page by its heading', () => {
    const index = buildIndex(docs);
    const keys = (text: string) => search(index, parseQuery(text)).hits.map(hit => `${hit.tier}:${hit.doc.key}`);
    expect(keys('films dune')).toEqual(['content:link:dune']);
    expect(keys('villeneuve')).toEqual(['content:link:dune']);
    expect(keys('dune')).toEqual(['title:link:dune']);
    expect(keys('lisbonne')).toEqual(['content:page:voyage']);
    expect(keys('maison')).toEqual(['content:note:courses']);
  });
});
