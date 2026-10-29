import type { Block, BlockKind } from '../../models/blocks';
import type { LinkItem, Note } from '../../models/entities';
import { blockFields, blockFromRecord } from '../../sync/entities';
import { askCost, parsePagesAskRequest, parsePagesAskResponse, type PagesAskResponse } from '../../sync/pagesAsk';
import { ROOT, type ChildIndex } from '../blocks';
import { answerCopy, answerDraft, answerLayout, answerText, askBlocks, askContext, citedPages, isPrivatePage, pagePath, quoteText, type AskLibrary } from '../pagesAsk';

function block(id: string, kind: BlockKind, parentId: string | null, extra: Partial<Block> = {}): Block {
  return blockFromRecord({ type: 'block', id, fields: blockFields({ parentId, position: 'a0', kind, createdAt: 0, ...extra }), clocks: {} });
}

const note = (id: string, over: Partial<Note> = {}): Note => ({
  id, kind: 'text', title: '', body: '', rich: false, drawing: '', color: null, pattern: null, pinned: false, archived: false, trashedAt: null, labelIds: [], position: 'a0',
  reminderAt: null, code: '', emblem: null, hint: '', modules: null, createdAt: 0, deletedAt: null, editedAt: 10, ...over,
});

const link = (id: string, noteId: string, over: Partial<LinkItem> = {}): LinkItem => ({
  id, noteId, url: 'https://www.example.org/hotel', status: 'ready', autoFile: false, filedBy: null, title: '', summary: '', siteName: '', kind: 'other',
  price: null, currency: null, attributes: [], imageIds: [], imageUrl: null, done: false, doneAt: null, comment: '', position: 'a0', error: null, analyzedAt: null,
  lang: 'fr', createdAt: 5, deletedAt: null, ...over,
});

function library(extra: Block[] = []): AskLibrary {
  const blocks = [
    block('voyages', 'page', null, { text: 'Voyages', editedAt: 5 }),
    block('lisbonne', 'page', 'voyages', { text: 'Lisbonne', editedAt: 30 }),
    block('t1', 'h2', 'lisbonne', { text: 'Dates' }),
    block('t2', 'text', 'lisbonne', { text: 'Départ le {b:3 mai}, retour le 10.' }),
    block('t3', 'todo', 'lisbonne', { text: 'Réserver le train', checked: false }),
    block('tog', 'toggle', 'lisbonne', { text: 'Idées' }),
    block('t4', 'bullet', 'tog', { text: 'Le tram 28' }),
    block('hotel', 'bookmark', 'lisbonne', { target: { type: 'link', id: 'h1' } }),
    block('tab', 'table', 'lisbonne', { caption: 'Budget', columns: [{ id: 'c1', name: 'Poste', type: 'text', options: [] }, { id: 'c2', name: 'Prix', type: 'number', options: [] }] as Block['columns'] }),
    block('r1', 'row', 'tab', { cells: { c1: 'Hôtel', c2: 420 } as Block['cells'] }),
    block('hotels', 'page', 'lisbonne', { text: 'Hôtels', editedAt: 20 }),
    block('h-text', 'text', 'hotels', { text: 'Près de l’Alfama' }),
    block('secret', 'page', 'lisbonne', { text: 'Budget perso', private: true, editedAt: 25 }),
    block('s-text', 'text', 'secret', { text: 'Salaire' }),
    block('under', 'page', 'secret', { text: 'Sous le secret' }),
    block('u-text', 'text', 'under', { text: 'Rien' }),
    block('recettes', 'page', null, { text: 'Recettes', editedAt: 40 }),
    block('r-text', 'text', 'recettes', { text: 'La tarte aux pommes de mamie' }),
    ...extra,
  ];
  const children: Record<string, string[]> = {};
  for (const entry of blocks) (children[entry.parentId ?? ROOT] ??= []).push(entry.id);
  return {
    blocks: Object.fromEntries(blocks.map(entry => [entry.id, entry])),
    blocksByParent: children as ChildIndex,
    notes: { trip: note('trip', { kind: 'links', title: 'Voyage' }) },
    checks: {},
    links: { h1: link('h1', 'trip', { title: 'Hôtel Alfama', summary: 'Un hôtel calme.', comment: 'Réservé' }) },
    checksByNote: {},
    linksByNote: { trip: ['h1'] },
  };
}

const label = () => 'Lien';

describe('askBlocks', () => {
  it('reads a page as citable blocks: Markdown, a table a piece per row, a sub-page named, a private one not', () => {
    const texts = askBlocks(library(), 'lisbonne', label).map(piece => `${piece.id}=${piece.text}`);
    expect(texts).toEqual([
      't1=## Dates',
      't2=Départ le **3 mai**, retour le 10.',
      't3=- [ ] Réserver le train',
      'tog=- Idées',
      't4=  - Le tram 28',
      expect.stringContaining('hotel=Link "Hôtel Alfama" (https://www.example.org/hotel)\nUn hôtel calme.\nTheir note: Réservé'),
      'tab=Table "Budget": Poste | Prix',
      expect.stringMatching(/^r1=Poste: Hôtel \| Prix: 420/),
      'hotels=Sub-page "Hôtels"',
    ]);
  });
});

describe('askContext', () => {
  it('reads the page alone, or with its sub-pages, never a private one nor what is under it', () => {
    const lib = library();
    expect(askContext(lib, 'lisbonne', 'page', '', 100_000, label).pages.map(page => page.id)).toEqual(['lisbonne']);
    const tree = askContext(lib, 'lisbonne', 'tree', '', 100_000, label);
    expect(tree.pages.map(page => page.id)).toEqual(['lisbonne', 'hotels']);
    expect(tree.kept).toBe(2);
    expect(tree.pages[1]!.path).toBe('Voyages › Lisbonne › Hôtels');
    expect(isPrivatePage(lib.blocks, 'under')).toBe(true);
    expect(isPrivatePage(lib.blocks, 'hotels')).toBe(false);
  });

  it('reads every page with the closest to the question first, after the page asked from', () => {
    const all = askContext(library(), 'hotels', 'all', 'tarte aux pommes', 100_000, label);
    expect(all.pages.map(page => page.id).slice(0, 2)).toEqual(['hotels', 'recettes']);
    expect(all.pages.map(page => page.id)).not.toContain('secret');
    expect(all.pages.map(page => page.id)).not.toContain('under');
  });

  it('stops where the reach ends: the page that does not fit read in part, the rest left out', () => {
    const lib = library([block('long', 'text', 'hotels', { text: 'x'.repeat(500) })]);
    const cut = askContext(lib, 'lisbonne', 'tree', '', 300, label);
    expect(cut.pages.map(page => page.id)).toEqual(['lisbonne', 'hotels']);
    expect(cut.chars).toBeLessThanOrEqual(300);
    expect(cut.cut).toBe(1);
    expect(cut.pages[1]!.blocks.map(piece => piece.id)).not.toContain('long');
  });

  it('leaves pages in the bin out', () => {
    const lib = library([block('jeté', 'page', 'lisbonne', { text: 'Jeté', trashedAt: 9 })]);
    expect(askContext(lib, 'lisbonne', 'tree', '', 100_000, label).pages.map(page => page.id)).toEqual(['lisbonne', 'hotels']);
  });

  it('names each page by where it sits', () => {
    expect(pagePath(library().blocks, 'hotels')).toBe('Voyages › Lisbonne › Hôtels');
  });
});

const answer: PagesAskResponse = {
  parts: [
    { text: 'Vous partez le 3 mai', cites: [0] },
    { text: ' et revenez le 10, ', cites: [0] },
    { text: 'près de l’Alfama.', cites: [1] },
    { text: '\n\nÀ faire :\n', cites: [] },
    { text: '- réserver le train', cites: [0] },
    { text: '\n- le tram 28', cites: [] },
  ],
  citations: [
    { pageId: 'lisbonne', blockIds: ['t2'], quote: 'Départ le 3 mai, retour le 10.' },
    { pageId: 'hotels', blockIds: ['h-text'], quote: 'Près de l’Alfama' },
  ],
  sources: [{ title: 'Carris', url: 'https://www.example.org/tram' }],
};

describe('answers', () => {
  it('lays an answer out in paragraphs and lists, each mark numbered by first use and given once per run of words', () => {
    const layout = answerLayout(answer.parts);
    expect(layout).toEqual([
      [
        {
          list: false,
          lines: [[{ text: 'Vous partez le 3 mai' }, { cite: 1, index: 0 }, { text: ' et revenez le 10,' }, { cite: 1, index: 0 }, { text: ' près de l’Alfama.' }, { cite: 2, index: 1 }]],
        },
      ],
      [
        { list: false, lines: [[{ text: 'À faire :' }]] },
        { list: true, lines: [[{ text: 'réserver le train' }, { cite: 1, index: 0 }], [{ text: 'le tram 28' }]] },
      ],
    ]);
  });

  it('shows a quote without the Markdown it was sent as', () => {
    expect(quoteText('Quatre jours, du **jeudi 14** au *dimanche*, près du [quartier](https://example.org/a) ~~vite~~ `code`.')).toBe('Quatre jours, du jeudi 14 au dimanche, près du quartier vite code.');
    expect(quoteText('- [x] Réserver\n## Dates\n> Note')).toBe('Réserver Dates Note');
    expect(quoteText('2 * 3 = 6')).toBe('2 * 3 = 6');
  });

  it('copies and lays in a page what was answered, with the pages it rests on', () => {
    expect(answerText(answer)).toBe('Vous partez le 3 mai et revenez le 10, près de l’Alfama.\n\nÀ faire :\n- réserver le train\n- le tram 28');
    expect(citedPages(answer)).toEqual(['lisbonne', 'hotels']);
    expect(answerCopy(answer, id => id.toUpperCase())).toContain('Sources : LISBONNE, HOTELS');
    const draft = answerDraft('Quand ?', answer);
    expect(draft.kind).toBe('toggle');
    expect(draft.children!.map(child => child.kind)).toEqual(['text', 'text', 'bullet', 'bullet', 'text', 'bullet']);
    expect(draft.children![4]!.text).toBe('{i:Sources : }{@page=lisbonne}, {@page=hotels}');
  });
});

describe('the contract', () => {
  it('refuses a request it could not cite from, and keeps the last turns only', () => {
    const pages = [{ id: 'p1', path: 'A', blocks: [{ id: 'b1', text: 'x' }] }];
    expect(parsePagesAskRequest({ scope: 'page', question: 'Q', pages, lang: 'en' })).toMatchObject({ scope: 'page', history: [], web: false, lang: 'en' });
    expect(parsePagesAskRequest({ scope: 'page', question: 'Q', pages: [{ id: 'p1', path: 'A', blocks: [{ id: 'b1', text: 'x'.repeat(9000) }] }] })).toBeNull();
    const history = Array.from({ length: 6 }, (_, at) => ({ question: `q${at}`, answer: `a${at}` }));
    expect(parsePagesAskRequest({ scope: 'tree', question: 'Q', pages, history })!.history.map(turn => turn.question)).toEqual(['q2', 'q3', 'q4', 'q5']);
  });

  it('keeps citations pointing at what exists', () => {
    const parsed = parsePagesAskResponse({ parts: [{ text: 'Oui', cites: [0, 4, 0] }], citations: [{ pageId: 'p1', blockIds: ['b1', 'bad id'], quote: 'x' }], sources: [{ title: 'T', url: 'javascript:alert(1)' }] });
    expect(parsed).toEqual({ parts: [{ text: 'Oui', cites: [0] }], citations: [{ pageId: 'p1', blockIds: ['b1'], quote: 'x' }], sources: [] });
    expect(parsePagesAskResponse({ parts: [{ text: '  ', cites: [] }], citations: [] })).toBeNull();
  });

  it('prices a question by what it reads, the web on top', () => {
    expect(askCost(35_000, 'claude-haiku-5-5', false)).toBeLessThan(askCost(35_000, 'claude-opus-5-5', false));
    expect(askCost(35_000, 'claude-opus-5-5', true)).toBeGreaterThan(askCost(35_000, 'claude-opus-5-5', false) + 0.03);
  });
});
