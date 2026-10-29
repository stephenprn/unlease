import type { Block, BlockKind, TableColumn } from '../../models/blocks';
import { blockFields, blockFromRecord } from '../../sync/entities';
import { isValidField } from '@unlease/core/sync/schema';
import { ancestorPages, bulletMark, containingPage, descendants, isInBin, isWithin, listDepth, listNumber, numberLabel, pageHeadings, ROOT, shownTarget, subPages, type ChildIndex } from '../blocks';
import { codeLanguage, languageFromFence } from '../code';
import { buildPageDocuments, searchPageDocuments } from '../pageSearch';
import { mediaKindFor, videoEmbedUrl } from '../media';
import { cellFits, cellHref, cellText, convertCell, distinctTexts, isEmail, isPhone, isWebAddress, optionsFor, parseDay, parseNumber, readCellInput } from '../table';
import { formatBytes } from '@unlease/core/services/format';

function block(id: string, kind: BlockKind, parentId: string | null, extra: Partial<Block> = {}): Block {
  return blockFromRecord({ type: 'block', id, fields: blockFields({ parentId, position: 'a0', kind, createdAt: 0, ...extra }), clocks: {} });
}

/** A workspace: Voyage > (Jour 1 in a column, a toggle holding Carnet de route > Notes). */
function workspace() {
  const list = [
    block('voyage', 'page', null),
    block('intro', 'text', 'voyage'),
    block('cols', 'columns', 'voyage'),
    block('col1', 'column', 'cols'),
    block('jour1', 'page', 'col1'),
    block('toggle', 'toggle', 'voyage'),
    block('route', 'page', 'toggle'),
    block('notes', 'page', 'route'),
    block('n1', 'numbered', 'notes'),
    block('n2', 'numbered', 'notes'),
    block('n2a', 'numbered', 'n2'),
    block('bullet', 'bullet', 'notes'),
    block('n3', 'numbered', 'notes'),
  ];
  const blocks = Object.fromEntries(list.map(entry => [entry.id, entry]));
  const children: Record<string, string[]> = {};
  for (const entry of list) (children[entry.parentId ?? ROOT] ??= []).push(entry.id);
  return { blocks, children: children as ChildIndex };
}

describe('the page tree', () => {
  it('finds the page holding a block, and the breadcrumb of a page', () => {
    const { blocks } = workspace();
    expect(containingPage(blocks, 'jour1')).toBe('voyage');
    expect(containingPage(blocks, 'n2a')).toBe('notes');
    expect(containingPage(blocks, 'voyage')).toBeNull();
    expect(ancestorPages(blocks, 'notes').map(page => page.id)).toEqual(['voyage', 'route']);
  });

  it('lists sub-pages wherever they sit in the content, and everything under a block', () => {
    const { blocks, children } = workspace();
    expect(subPages(blocks, children, 'voyage')).toEqual(['jour1', 'route']);
    expect(subPages(blocks, children, 'route')).toEqual(['notes']);
    expect(descendants(children, 'route')).toEqual(['notes', 'n1', 'n2', 'n2a', 'bullet', 'n3']);
  });

  it('knows what the bin holds and what would make a loop', () => {
    const { blocks } = workspace();
    const trashed = { ...blocks, route: { ...blocks.route!, trashedAt: 5 } };
    expect(isInBin(trashed, 'n2a')).toBe(true);
    expect(isInBin(trashed, 'jour1')).toBe(false);
    expect(isInBin(blocks, 'orphan')).toBe(true);
    expect(isWithin(blocks, 'n2a', 'route')).toBe(true);
    expect(isWithin(blocks, 'jour1', 'route')).toBe(false);
  });

  it('numbers a list by its run of items, and marks nested lists differently', () => {
    const { blocks, children } = workspace();
    const siblings = children.notes!;
    expect([0, 1, 3].map(index => listNumber(blocks, siblings, index))).toEqual([1, 2, 1]);
    expect(listDepth(blocks, 'n2a', 'numbered')).toBe(1);
    expect(numberLabel(3, 0)).toBe('3.');
    expect(numberLabel(28, 1)).toBe('ab.');
    expect(numberLabel(4, 2)).toBe('iv.');
    expect(bulletMark(1)).toBe('◦');
  });

  it('writes only the fields a block uses, and reads defaults for the rest', () => {
    const fields = blockFields({ parentId: 'p', position: 'a0', kind: 'todo', createdAt: 1, checked: true });
    expect(Object.keys(fields).sort()).toEqual(['checked', 'createdAt', 'deletedAt', 'kind', 'parentId', 'position', 'text']);
    const read = blockFromRecord({ type: 'block', id: 'b', fields: { kind: 'callout', color: 'blue', targetType: 'note', targetId: 'n1' }, clocks: {} });
    expect(read.color).toBe('blue');
    expect(read.target).toEqual({ type: 'note', id: 'n1' });
    expect(read.ratio).toBe(1);
    expect(read.caption).toBe('');
    expect(read.view).toBe('list');
    expect(read.viewColumns).toEqual([]);
    expect(read.showDone).toBe(false);
    expect(blockFromRecord({ type: 'block', id: 'b', fields: { kind: 'hologram' }, clocks: {} }).kind).toBe('text');
  });
});

describe('a table of contents', () => {
  it('lists the page’s headings in reading order, into columns and toggles, never into a sub-page or a table', () => {
    const list = [
      block('doc', 'page', null),
      block('h1a', 'h2', 'doc', { text: 'Partie' }),
      block('cols', 'columns', 'doc'),
      block('col1', 'column', 'cols'),
      block('h3a', 'h3', 'col1', { text: 'Dans une colonne' }),
      block('toggle', 'toggle', 'doc', { text: 'Plus' }),
      block('h4a', 'h4', 'toggle', { text: '{b:Caché}' }),
      block('empty', 'h2', 'doc', { text: '  ' }),
      block('sub', 'page', 'doc', { text: 'Sous-page' }),
      block('hsub', 'h1', 'sub', { text: 'Ailleurs' }),
      block('h2b', 'h2', 'doc', { text: 'Fin' }),
    ];
    const blocks = Object.fromEntries(list.map(each => [each.id, each]));
    const children: ChildIndex = { doc: ['h1a', 'cols', 'toggle', 'empty', 'sub', 'h2b'], cols: ['col1'], col1: ['h3a'], toggle: ['h4a'], sub: ['hsub'] };
    expect(pageHeadings(blocks, children, 'doc').map(entry => [entry.id, entry.level, entry.depth])).toEqual([
      ['h1a', 2, 0],
      ['h3a', 3, 1],
      ['h4a', 4, 2],
      ['h2b', 2, 0],
    ]);
    expect(pageHeadings(blocks, children, 'sub')).toEqual([{ id: 'hsub', level: 1, text: 'Ailleurs', depth: 0 }]);
    expect(pageHeadings(blocks, {}, 'doc')).toEqual([]);
  });
});

describe('what a block points at', () => {
  const note = { type: 'note', id: 'n1' } as const;

  it('reads a bookmark, an embed, or a text holding one mention and nothing else', () => {
    expect(shownTarget(block('b', 'bookmark', 'p', { target: note }))).toEqual({ target: note, display: 'bookmark' });
    expect(shownTarget(block('e', 'embed', 'p', { target: note }))).toEqual({ target: note, display: 'embed' });
    expect(shownTarget(block('t', 'text', 'p', { text: ' {@note=n1} ' }))).toEqual({ target: note, display: 'mention' });
    expect(shownTarget(block('h', 'h2', 'p', { text: '{@note=n1}' }))).toEqual({ target: note, display: 'mention' });
  });

  it('reads nothing in a text with words, a date or two mentions, in code, or in a bookmark without a target', () => {
    expect(shownTarget(block('t', 'text', 'p', { text: 'Voir {@note=n1}' }))).toBeNull();
    expect(shownTarget(block('t', 'text', 'p', { text: '{@note=n1}{@page=p2}' }))).toBeNull();
    expect(shownTarget(block('t', 'text', 'p', { text: '{@note=n1} {@date=2026-11-12}' }))).toBeNull();
    expect(shownTarget(block('c', 'code', 'p', { text: '{@note=n1}' }))).toBeNull();
    expect(shownTarget(block('b', 'bookmark', 'p'))).toBeNull();
  });
});

describe('the block schema', () => {
  const column: TableColumn = { id: 'c1', name: 'Prix', type: 'number', unit: '€' };

  it('takes table columns and cells, a newer client’s keys included', () => {
    expect(isValidField('block', 'columns', [column, { id: 'c2', name: 'Statut', type: 'select', options: [{ id: 'o1', name: 'À faire', color: 'red' }] }])).toBe(true);
    expect(isValidField('block', 'columns', [{ ...column, type: 'formula', format: 'x' }])).toBe(true);
    expect(isValidField('block', 'columns', [column, column])).toBe(false);
    expect(isValidField('block', 'columns', [{ ...column, width: 5 }])).toBe(false);
    expect(isValidField('block', 'cells', { c1: 12.5, c2: ['o1'], c3: true, c4: null, c5: 'texte' })).toBe(true);
    expect(isValidField('block', 'cells', { c1: { nested: true } })).toBe(false);
    expect(isValidField('block', 'cells', ['c1'])).toBe(false);
  });

  it('checks a block’s place and target', () => {
    expect(isValidField('block', 'parentId', null)).toBe(true);
    expect(isValidField('block', 'parentId', '../x')).toBe(false);
    expect(isValidField('block', 'kind', 'columns')).toBe(true);
    // Any app's type, one a newer client added included, so a peer passes it on; never markup.
    expect(isValidField('block', 'targetType', 'event')).toBe(true);
    expect(isValidField('block', 'targetType', null)).toBe(true);
    expect(isValidField('block', 'targetType', '<b>')).toBe(false);
    expect(isValidField('block', 'targetType', 'Note')).toBe(false);
    expect(isValidField('block', 'ratio', 0)).toBe(false);
    expect(isValidField('block', 'ratio', 1.5)).toBe(true);
  });

  it('takes a caption within its limit', () => {
    expect(isValidField('block', 'caption', 'Vue depuis Santa Luzia')).toBe(true);
    expect(isValidField('block', 'caption', 'x'.repeat(2001))).toBe(false);
    expect(isValidField('block', 'caption', null)).toBe(false);
  });

  it('takes an embedded collection’s look and columns, a newer client’s look included', () => {
    expect(isValidField('block', 'view', 'table')).toBe(true);
    expect(isValidField('block', 'view', 'gallery')).toBe(true);
    expect(blockFromRecord({ type: 'block', id: 'b', fields: { kind: 'embed', view: 'gallery' }, clocks: {} }).view).toBe('list');
    expect(isValidField('block', 'viewColumns', [{ key: 'site', shown: false }, { key: 'fact:realisateur', shown: true }])).toBe(true);
    expect(isValidField('block', 'viewColumns', [{ key: 'site', shown: false }, { key: 'site', shown: true }])).toBe(false);
    expect(isValidField('block', 'viewColumns', [{ key: '', shown: true }])).toBe(false);
    expect(isValidField('block', 'viewColumns', [{ key: 'site', shown: 'yes' }])).toBe(false);
    expect(isValidField('block', 'showDone', true)).toBe(true);
    expect(isValidField('block', 'showDone', 'yes')).toBe(false);
  });
});

describe('table cells', () => {
  const number: TableColumn = { id: 'n', name: 'Montant', type: 'number', unit: '€' };
  const text: TableColumn = { id: 't', name: 'Texte', type: 'text' };
  const select: TableColumn = { id: 's', name: 'Statut', type: 'select', options: [{ id: 'o1', name: 'Payé', color: 'green' }, { id: 'o2', name: 'À payer', color: 'red' }] };

  it('reads numbers as French writes them', () => {
    expect(parseNumber('1 234,56')).toBe(1234.56);
    expect(parseNumber('1234.5')).toBe(1234.5);
    expect(parseNumber('12 €')).toBe(12);
    expect(parseNumber('−3')).toBe(-3);
    expect(parseNumber('1.234,5')).toBe(1234.5);
    expect(parseNumber('douze')).toBeNull();
    expect(cellText(1234.5, number)).toBe('1\u202F234,5\u00a0€');
  });

  it('reads days typed by hand and refuses impossible ones', () => {
    expect(parseDay('21/10/2026')).toBe('2026-10-21');
    expect(parseDay('2026-10-21')).toBe('2026-10-21');
    expect(parseDay('1.2.26')).toBe('2026-02-01');
    expect(parseDay('31/02/2026')).toBeNull();
    expect(cellText('2026-10-21', { id: 'd', name: 'Date', type: 'date' })).toBe('21\u00a0oct.\u00a02026');
  });

  it('converts a column’s cells when its type changes', () => {
    expect(convertCell('12,5', text, number)).toBe(12.5);
    expect(convertCell(12.5, number, text)).toBe('12,5\u00a0€');
    expect(convertCell('payé', text, select)).toBe('o1');
    expect(convertCell('o2', select, text)).toBe('À payer');
    expect(convertCell('Payé, À payer', text, { ...select, type: 'multi' })).toEqual(['o1', 'o2']);
    expect(convertCell('oui', text, { id: 'c', name: 'Fait', type: 'checkbox' })).toBe(true);
    expect(convertCell(undefined, text, number)).toBeNull();
  });

  it('offers the texts of a column as options, once each', () => {
    const names = distinctTexts(['Rome', 'Lisbonne, rome', '', 'Porto'], text);
    expect(names).toEqual(['Rome', 'Lisbonne', 'Porto']);
    let next = 0;
    const options = optionsFor(names, [{ id: 'x', name: 'porto', color: 'blue' }], () => `id${(next += 1)}`);
    expect(options.map(option => option.name)).toEqual(['porto', 'Rome', 'Lisbonne']);
  });

  it('makes link cells openable', () => {
    expect(cellHref('url', 'exemple.fr/page')).toBe('https://exemple.fr/page');
    expect(cellHref('email', 'a@b.fr')).toBe('mailto:a@b.fr');
    expect(cellHref('phone', '06 12 34 56 78')).toBe('tel:0612345678');
    expect(cellHref('url', 'pas un lien')).toBeNull();
    expect(cellHref('email', 'pas une adresse')).toBeNull();
    expect(cellHref('phone', 'appeler Paul')).toBeNull();
  });

  it('knows an e-mail address, a web address and a phone number', () => {
    for (const ok of ['a@b.fr', 'prenom.nom+tri@sous.exemple.co.uk', 'élodie@café.fr']) expect([ok, isEmail(ok)]).toEqual([ok, true]);
    for (const no of ['abc', 'a@b', '@exemple.fr', 'a@@b.fr', 'a b@c.fr', '.a@b.fr', 'a..b@c.fr', 'a@b.f', 'a@-b.fr', 'nom@exemple.fr.']) expect([no, isEmail(no)]).toEqual([no, false]);
    for (const ok of ['exemple.fr', 'https://exemple.fr/page?x=1#haut', 'http://localhost:5173', 'www.exemple.com/a', '192.168.1.10:8080/admin']) expect([ok, isWebAddress(ok)]).toEqual([ok, true]);
    for (const no of ['pas un lien', 'exemple', 'ftp://exemple.fr', 'https://', 'exemple.fr/une page']) expect([no, isWebAddress(no)]).toEqual([no, false]);
    for (const ok of ['06 12 34 56 78', '+33 (0)6.12.34.56.78', '15', '01-23-45-67-89']) expect([ok, isPhone(ok)]).toEqual([ok, true]);
    for (const no of ['appeler Paul', '06 12 +34', '+', '1']) expect([no, isPhone(no)]).toEqual([no, false]);
  });

  it('reads what is typed in a cell by its column’s type, and refuses what does not fit', () => {
    expect(readCellInput('email', '  nom@exemple.fr ')).toEqual({ ok: true, value: 'nom@exemple.fr' });
    expect(readCellInput('email', 'nom')).toEqual({ ok: false });
    expect(readCellInput('url', 'exemple')).toEqual({ ok: false });
    expect(readCellInput('phone', 'demain')).toEqual({ ok: false });
    expect(readCellInput('number', '12,5 €')).toEqual({ ok: true, value: 12.5 });
    expect(readCellInput('number', 'douze')).toEqual({ ok: false });
    expect(readCellInput('date', '31/02/2026')).toEqual({ ok: false });
    expect(readCellInput('date', '21/10/2026')).toEqual({ ok: true, value: '2026-10-21' });
    // Nothing typed empties any cell; text keeps its spaces.
    expect(readCellInput('email', ' ')).toEqual({ ok: true, value: '' });
    expect(readCellInput('number', '')).toEqual({ ok: true, value: null });
    expect(readCellInput('text', ' libre ')).toEqual({ ok: true, value: ' libre ' });
  });

  it('flags a cell that no longer fits after its column changed type', () => {
    const email: TableColumn = { id: 'e', name: 'E-mail', type: 'email' };
    expect(cellFits(convertCell('Paul', text, email), email)).toBe(false);
    expect(cellFits('paul@exemple.fr', email)).toBe(true);
    expect(cellFits('', email)).toBe(true);
    expect(cellFits('Paul', text)).toBe(true);
  });
});

describe('media and code', () => {
  it('picks a block for a file and writes its size', () => {
    expect(mediaKindFor('image/png')).toBe('image');
    expect(mediaKindFor('image/svg+xml')).toBe('file');
    expect(mediaKindFor('video/mp4')).toBe('video');
    expect(mediaKindFor('application/pdf')).toBe('pdf');
    expect(formatBytes(512)).toBe('512\u00a0o');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2,5\u00a0Mo');
  });

  it('plays known video sites in a frame', () => {
    expect(videoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42');
    expect(videoEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbedUrl('https://vimeo.com/76979871')).toBe('https://player.vimeo.com/video/76979871');
    expect(videoEmbedUrl('https://www.dailymotion.com/video/x7tgad0')).toBe('https://www.dailymotion.com/embed/video/x7tgad0');
    expect(videoEmbedUrl('https://exemple.fr/film.mp4')).toBeNull();
  });

  it('finds a language by key, name or alias', () => {
    expect(languageFromFence('ts')).toBe('typescript');
    expect(languageFromFence('Python')).toBe('python');
    expect(languageFromFence('klingon')).toBeNull();
    expect(codeLanguage('klingon').key).toBe('plain');
  });
});

describe('page search', () => {
  const column: TableColumn = { id: 'c1', name: 'Poste', type: 'text' };

  function library() {
    const list = [
      block('lisbonne', 'page', null, { text: 'Voyage à Lisbonne', editedAt: 5 }),
      block('intro', 'text', 'lisbonne', { text: 'Hôtel près du quartier de l’Alfama.', editedAt: 9 }),
      block('budget', 'table', 'lisbonne', { columns: [column] }),
      block('row1', 'row', 'budget', { cells: { c1: 'Dîner fado' } }),
      block('toggle', 'toggle', 'lisbonne', { text: 'Adresses' }),
      block('tram', 'text', 'toggle', { text: 'Prendre le tram 28 tôt le matin' }),
      block('sub', 'page', 'lisbonne', { text: 'Restaurants à tester' }),
      block('subtext', 'text', 'sub', { text: 'Une tasca près de l’Alfama' }),
      block('photo', 'image', 'lisbonne', { fileName: 'miradouro.jpg', caption: 'Vue depuis Santa Luzia' }),
      block('binned', 'page', null, { text: 'Alfama, brouillon', trashedAt: 1 }),
    ];
    const blocks = Object.fromEntries(list.map(entry => [entry.id, entry]));
    const children: Record<string, string[]> = {};
    for (const entry of list) (children[entry.parentId ?? ROOT] ??= []).push(entry.id);
    return buildPageDocuments(blocks, children as ChildIndex, () => '');
  }

  it('finds a page by the words of its blocks, tables and toggles included, accents folded', () => {
    const docs = library();
    expect(searchPageDocuments(docs, 'alfama').map(hit => hit.pageId)).toEqual(['lisbonne', 'sub']);
    const tram = searchPageDocuments(docs, 'TRAM')[0]!;
    expect(tram).toMatchObject({ pageId: 'lisbonne', blockId: 'tram' });
    expect(tram.snippet).toContain('tram 28');
    expect(searchPageDocuments(docs, 'diner fado')[0]).toMatchObject({ pageId: 'lisbonne', blockId: 'budget' });
  });

  it('finds a page by a caption', () => {
    const hit = searchPageDocuments(library(), 'santa luzia')[0]!;
    expect(hit).toMatchObject({ pageId: 'lisbonne', blockId: 'photo' });
    expect(hit.snippet).toContain('Vue depuis Santa Luzia');
  });

  it('keeps a sub-page’s words to itself, skips the bin, and ranks title hits first', () => {
    const docs = library();
    expect(searchPageDocuments(docs, 'tasca').map(hit => hit.pageId)).toEqual(['sub']);
    expect(searchPageDocuments(docs, 'brouillon')).toEqual([]);
    // "Lisbonne" is in a title: the page opens at its head, its first words stand for it.
    expect(searchPageDocuments(docs, 'lisbonne')[0]).toMatchObject({ pageId: 'lisbonne', blockId: null });
    expect(searchPageDocuments(docs, 'lisbonne')[0]!.snippet).toContain('Alfama');
    expect(searchPageDocuments(docs, '  ')).toEqual([]);
  });
});
