import { parseRich } from '@unlease/core/services/richText';
import type { Block, BlockKind } from '../../models/blocks';
import { blockFields, blockFromRecord } from '../../sync/entities';
import { ROOT, type ChildIndex } from '../blocks';
import { exportDay, importChanges, importContainerTitle, importCountLines, importReportLines, importUndoChanges, notionPageIcon, parseCsv, planImport, previewEntries, readExport, type ExportFile, type ImportChoices, type ImportLibrary } from '../importing';
import { blocksFromMarkdown, type BlockDraft } from '../pageText';

const ID = (n: number): string => n.toString(16).padStart(32, '0');
const V = ID(1); // Voyage
const L = ID(2); // Lisbonne
const B = ID(3); // Budget (a database)
const F = ID(4); // Vols (a row with words)
const H = ID(5); // Hôtel (a row with its properties alone)
const T = ID(6); // Tâches (a database with no row of words)

/** A Notion export as its « Markdown & CSV » zip holds it, inside the folder of the archive. */
function notionExport(): ExportFile[] {
  const files: [string, string | null, number?][] = [
    [
      `Export-abc/Voyage ${V}.md`,
      [
        '# 🌍 Voyage',
        '',
        'Notre voyage au **Portugal**, voir [Lisbonne](Voyage%20' + V + '/Lisbonne%20' + L + '.md).',
        '',
        '[Tâches](Voyage%20' + V + '/T%C3%A2ches%20' + T + '.csv)',
        '',
        '<aside>',
        '💡 Penser aux billets',
        '',
        '</aside>',
        '',
        '<details>',
        '<summary>Idées</summary>',
        '',
        '- Musée',
        '',
        '</details>',
        '',
        '![carte.png](Voyage%20' + V + '/carte.png)',
        '',
        '![](Voyage%20' + V + '/absente.png)',
        '',
        '[Lisbonne](Voyage%20' + V + '/Lisbonne%20' + L + '.md)',
      ].join('\n'),
    ],
    [`Export-abc/Voyage ${V}/carte.png`, null, 2048],
    [`Export-abc/Voyage ${V}/Lisbonne ${L}.md`, `# Lisbonne\n\n- [ ] Réserver\n- [x] Partir\n\nRetour à [Voyage](https://www.notion.so/Voyage-${V}?pvs=21) et [ailleurs](../Ailleurs%20${ID(9)}.md).`],
    [`Export-abc/Voyage ${V}/Budget ${B}.csv`, 'Name,Montant\nOld,1\n'],
    [`Export-abc/Voyage ${V}/Budget ${B}_all.csv`, '\uFEFFName,Montant,Payé,Catégorie,Quand\nVols,186,Yes,Transport,"November 12, 2026"\nHôtel,"1 200",No,Logement,"November 13, 2026"\nTrain,30,No,Transport,\nRepas,45,Yes,Logement,\n'],
    [`Export-abc/Voyage ${V}/Budget ${B}/Vols ${F}.md`, '# Vols\n\nMontant: 186\nPayé: Yes\n\nAller le 12, retour le 20.'],
    [`Export-abc/Voyage ${V}/Budget ${B}/Hôtel ${H}.md`, '# Hôtel\n\nMontant: 1 200\nPayé: No\n'],
    [`Export-abc/Voyage ${V}/Tâches ${T}.csv`, 'Name,Fait\nValise,Yes\n'],
    [`Export-abc/Vide ${ID(7)}.md`, '   \n'],
    [`Export-abc/Guide ${ID(8)}.html`, '<html></html>'],
    ['Export-abc/.DS_Store', null, 10],
  ];
  return files.map(([path, text, bytes]) => ({ path, ...(text !== null ? { text } : {}), bytes: bytes ?? text?.length ?? 0 }));
}

let counter = 0;
const mint = (): string => `id${(counter += 1)}`;

const choices = (patch: Partial<ImportChoices> = {}): ImportChoices => ({ placement: 'new', containerTitle: 'Import Notion du 12 novembre', insideId: null, private: false, off: new Set(), ...patch });

const EMPTY: ImportLibrary = { blocks: {}, blocksByParent: {} };

/** A library from blocks (parent and position given), with its children index. */
function library(list: readonly [id: string, kind: BlockKind, parentId: string | null, text: string, position?: string][]): ImportLibrary {
  const blocks: Record<string, Block> = {};
  const children: Record<string, string[]> = {};
  for (const [id, kind, parentId, text, position = 'a0'] of list) {
    blocks[id] = blockFromRecord({ type: 'block', id, fields: blockFields({ kind, parentId, position, text, createdAt: 0 }), clocks: {} });
    (children[parentId ?? ROOT] ??= []).push(id);
  }
  return { blocks, blocksByParent: children as ChildIndex };
}

/** What the changes write, as blocks to look at. */
function written(changes: readonly { id: string; patch: Readonly<Record<string, unknown>> }[]): Record<string, Block> {
  return Object.fromEntries(changes.map(change => [change.id, blockFromRecord({ type: 'block', id: change.id, fields: { ...change.patch }, clocks: {} })]));
}

describe('a Notion export read as pages', () => {
  beforeEach(() => {
    counter = 0;
  });

  it('nests pages by their folders, titles them by their heading without Notion’s id, and takes a leading emoji as the icon', () => {
    const read = readExport(notionExport(), { mint });
    expect(read.kind).toBe('notion');
    expect(read.root).toBe('Export-abc');
    expect(read.top.map(key => read.pages[key]!.title)).toEqual(['Voyage']);
    const voyage = read.pages[read.top[0]!]!;
    expect(voyage.icon).toBe('🌍');
    expect(voyage.children.map(key => read.pages[key]!.title)).toEqual(['Lisbonne', 'Budget']);
  });

  it('reads Notion’s callouts, toggles, pictures and links, a sub-page where its parent links to it on its own line', () => {
    const read = readExport(notionExport(), { mint });
    const voyage = read.pages[read.top[0]!]!;
    const kinds = voyage.drafts.map(draft => draft.kind);
    expect(kinds).toEqual(['text', 'table', 'callout', 'toggle', 'image', 'image', 'page', 'page']);
    const lisbonne = read.pages[voyage.children[0]!]!;
    // The link in the words: a mention of the page.
    expect(parseRich(voyage.drafts[0]!.text).some(run => run.kind === 'mention' && run.target.id === lisbonne.id)).toBe(true);
    expect(voyage.drafts[2]).toMatchObject({ kind: 'callout', text: 'Penser aux billets', extra: { icon: '💡' } });
    expect(voyage.drafts[3]!.children?.[0]).toMatchObject({ kind: 'bullet', text: 'Musée' });
    expect(voyage.drafts[4]!.extra).toMatchObject({ fileName: 'carte.png', mime: 'image/png', importFile: `Voyage ${V}/carte.png` });
    // A picture the export lacks keeps its place, empty, and is said left out.
    expect(voyage.drafts[5]!.extra).toEqual({ caption: 'absente.png' });
    expect(voyage.counts).toMatchObject({ pictures: 1, missing: 1, tables: 1 });
    expect(read.leftOut.find(item => item.title === 'absente.png')?.why).toMatch(/Absente/);
    // The page linked on its own line sits there; the database (rows with words) follows, a page too.
    expect(voyage.drafts[6]!.extra?.importPage).toBe(lisbonne.key);
  });

  it('turns a link to a Notion page’s address into a mention, and keeps a link to a page the export lacks as its words', () => {
    const read = readExport(notionExport(), { mint });
    const voyage = read.pages[read.top[0]!]!;
    const lisbonne = read.pages[voyage.children[0]!]!;
    const words = lisbonne.drafts[2]!;
    const runs = parseRich(words.text);
    expect(runs.some(run => run.kind === 'mention' && run.target.id === voyage.id)).toBe(true);
    expect(runs.some(run => run.kind === 'text' && run.text.includes('ailleurs'))).toBe(true);
    expect(lisbonne.counts.broken).toBe(1);
    expect(lisbonne.drafts.slice(0, 2)).toMatchObject([
      { kind: 'todo', checked: false },
      { kind: 'todo', checked: true },
    ]);
  });

  it('makes a database a table, its columns typed, its rows with words its sub-pages; one with none stays a table in its parent', () => {
    const read = readExport(notionExport(), { mint });
    const voyage = read.pages[read.top[0]!]!;
    const budget = read.pages[voyage.children[1]!]!;
    expect(budget.rows).toBe(4);
    expect(budget.children.map(key => read.pages[key]!.title)).toEqual(['Vols']);
    const table = budget.drafts[0]!;
    const columns = table.extra?.columns as { name: string; type: string }[];
    expect(columns.map(column => [column.name, column.type])).toEqual([
      ['Name', 'text'],
      ['Montant', 'number'],
      ['Payé', 'checkbox'],
      ['Catégorie', 'select'],
      ['Quand', 'date'],
    ]);
    const cells = table.children!.map(row => row.extra?.cells as Record<string, unknown>);
    expect(cells[1]).toMatchObject({ c0: 'Hôtel', c1: 1200, c2: false, c4: '2026-11-13' });
    // The row's properties stay over its words, its key in bold.
    const vols = read.pages[budget.children[0]!]!;
    expect(vols.drafts.map(draft => draft.kind)).toEqual(['text', 'text', 'text']);
    expect(vols.drafts[0]!.text).toContain('{b:Montant :}');
    // « Tâches »: no row with words, a table where its parent links to it, its name under it.
    expect(voyage.drafts[1]).toMatchObject({ kind: 'table', extra: { caption: 'Tâches' } });
  });

  it('says what it leaves out: an empty note, Notion’s HTML, a picture absent', () => {
    const read = readExport(notionExport(), { mint });
    const why = Object.fromEntries(read.leftOut.map(item => [item.title, item.why]));
    expect(why[`Vide ${ID(7)}.md`]).toMatch(/vide/i);
    expect(why[`Guide ${ID(8)}.html`]).toMatch(/Markdown & CSV/);
    expect(Object.keys(why)).not.toContain('.DS_Store');
  });
});

/** A page as Notion's HTML export writes it: its header (cover, icon, title), then its body. */
function notionHtml(title: string, header: string, body = ''): string {
  return [
    '<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"/><title>' + title + '</title><style>',
    '/* cspell:disable-file */ .page-header-icon { font-size: 78px; } .page-header-icon .icon { display: block; }',
    '</style></head><body><article id="1d0c5e2a-9f3b-4c7e-8a51-0e6f2b7d9c41" class="page sans"><header>' + header + '<h1 class="page-title">' + title + '</h1><p class="page-description"></p></header>',
    '<div class="page-body">' + body + '</div></article><span class="sans" style="font-size:14px;padding-top:2em"></span></body></html>',
  ].join('');
}

const EMOJI_HEADER = (emoji: string): string => `<div class="page-header-icon undefined"><span class="icon">${emoji}</span></div>`;

/**
 * The same workspace exported twice, as Notion's « Markdown & CSV » (no icon anywhere: `# Voyage`)
 * and as its HTML (each page's icon over its title), each archive in its own `Export-…` folder,
 * dropped together.
 */
function notionWithHtml(): ExportFile[] {
  const md = 'Export-3f6b2c1e-8d4a-4f1b-9c2e-5a7d8e9f0a1b';
  const html = 'Export-7c1d9e2f-0b3a-4e5c-8d6f-1a2b3c4d5e6f';
  const files: [string, string | null, number?][] = [
    [`${md}/Voyage ${V}.md`, `# Voyage\n\nNotre voyage.\n\n![carte.png](Voyage%20${V}/carte.png)\n\n[Lisbonne](Voyage%20${V}/Lisbonne%20${L}.md)`],
    [`${md}/Voyage ${V}/carte.png`, null, 2048],
    [`${md}/Voyage ${V}/Lisbonne ${L}.md`, '# Lisbonne\n\nLe tram 28.'],
    [`${md}/Voyage ${V}/Budget ${B}_all.csv`, 'Name,Montant\nVols,186\nHôtel,1200\n'],
    [`${md}/Voyage ${V}/Budget ${B}/Vols ${F}.md`, '# Vols\n\nMontant: 186\n\nAller le 12.'],
    [`${md}/Voyage ${V}/Budget ${B}/Hôtel ${H}.md`, '# Hôtel\n\nMontant: 1200\n'],
    [`${md}/Sans icône ${T}.md`, '# Sans icône\n\nRien.'],
    [`${html}/index.html`, '<html><body><ul><li><a href="Voyage%20' + V + '.html">Voyage</a></li></ul></body></html>'],
    [
      `${html}/Voyage ${V}.html`,
      notionHtml('Voyage', EMOJI_HEADER('🌍'), `<p class="">Notre voyage.</p><figure class="image"><a href="Voyage%20${V}/carte.png"><img style="width:640px" src="Voyage%20${V}/carte.png"/></a></figure><figure id="a1" class="link-to-page"><a href="Voyage%20${V}/Lisbonne%20${L}.html"><span class="icon">🚋</span>Lisbonne</a></figure>`),
    ],
    [`${html}/Voyage ${V}/carte.png`, null, 2048],
    [
      `${html}/Voyage ${V}/Lisbonne ${L}.html`,
      notionHtml('Lisbonne', `<img class="page-cover-image" src="Lisbonne%20${L}/couverture.jpg" style="object-position:center 50%"/><div class="page-header-icon page-header-icon-with-cover"><img class="icon" src="Lisbonne%20${L}/tram.png"/></div>`, '<p class="">Le tram 28.</p>'),
    ],
    [`${html}/Voyage ${V}/Lisbonne ${L}/tram.png`, null, 900],
    [`${html}/Voyage ${V}/Lisbonne ${L}/couverture.jpg`, null, 40_000],
    [`${html}/Voyage ${V}/Budget ${B}.html`, notionHtml('Budget', EMOJI_HEADER('&#x1F4B0;'), '<table class="collection-content"></table>')],
    [`${html}/Voyage ${V}/Budget ${B}/Vols ${F}.html`, notionHtml('Vols', EMOJI_HEADER('✈️'), '<table class="properties"></table><p>Aller le 12.</p>')],
    [`${html}/Voyage ${V}/Budget ${B}/Hôtel ${H}.html`, notionHtml('Hôtel', EMOJI_HEADER('🏨'), '<table class="properties"></table>')],
    [`${html}/Sans icône ${T}.html`, notionHtml('Sans icône', '', '<p>Rien.</p>')],
  ];
  return files.map(([path, text, bytes]) => ({ path, ...(text !== null ? { text } : {}), bytes: bytes ?? text?.length ?? 0 }));
}

describe('the pages’ icons from Notion’s HTML export', () => {
  beforeEach(() => {
    counter = 0;
  });

  it('reads the icon over a page’s title: an emoji, a picture, none (an icon in its body is a sub-page’s)', () => {
    expect(notionPageIcon(notionHtml('Voyage', EMOJI_HEADER('🌍')))).toEqual({ emoji: '🌍' });
    expect(notionPageIcon(notionHtml('Équipe', EMOJI_HEADER('👩🏽‍💻')))).toEqual({ emoji: '👩🏽‍💻' });
    expect(notionPageIcon(notionHtml('Budget', EMOJI_HEADER('&#x1F4B0;')))).toEqual({ emoji: '💰' });
    expect(notionPageIcon(notionHtml('Lisbonne', '<div class="page-header-icon undefined"><img class="icon" src="Lisbonne%20abc/tram.png"/></div>'))).toEqual({ picture: 'Lisbonne%20abc/tram.png' });
    expect(notionPageIcon(notionHtml('Notes', '<div class="page-header-icon undefined"><img class="icon" src="https://www.notion.so/icons/book-closed_gray.svg"/></div>'))).toEqual({ picture: 'https://www.notion.so/icons/book-closed_gray.svg' });
    expect(notionPageIcon(notionHtml('Sans', '', '<figure class="link-to-page"><a href="x.html"><span class="icon">🚋</span>X</a></figure>'))).toBeNull();
  });

  it('gives each Markdown page the icon its HTML page shows, the databases’ and their rows’ too', () => {
    const read = readExport(notionWithHtml(), { mint });
    expect(read.kind).toBe('notion');
    expect(read.top.map(key => read.pages[key]!.title)).toEqual(['Sans icône', 'Voyage']);
    const byTitle = Object.fromEntries(Object.values(read.pages).map(page => [page.title, page]));
    expect(byTitle.Voyage).toMatchObject({ icon: '🌍', iconPicture: false });
    expect(byTitle.Budget).toMatchObject({ icon: '💰' });
    expect(byTitle.Vols).toMatchObject({ icon: '✈️' });
    expect(byTitle['Sans icône']).toMatchObject({ icon: null, iconPicture: false });
    // A custom icon is a picture: a page's icon is an emoji, so it comes without, and says so.
    expect(byTitle.Lisbonne).toMatchObject({ icon: null, iconPicture: true });
    // Nothing else of the HTML is read: the pages hold what their Markdown holds.
    expect(byTitle.Voyage!.drafts.map(draft => draft.kind)).toEqual(['text', 'image', 'page', 'page']);
  });

  it('leaves out nothing it read for an icon, says why of the HTML that matched no page, and attaches pictures from the bytes given', () => {
    const given = notionWithHtml();
    const read = readExport(given, { mint });
    const why = Object.fromEntries(read.leftOut.map(item => [item.title, item.why]));
    expect(Object.keys(why).filter(name => name.endsWith('.html'))).toEqual(['index.html']);
    expect(why['index.html']).toMatch(/icônes/);
    // The custom icon's picture is said on its page, the cover is no page's.
    expect(why['tram.png']).toBeUndefined();
    expect(why['couverture.jpg']).toMatch(/Aucune page/);
    const carte = read.assets[`Voyage ${V}/carte.png`]!;
    expect(given.some(file => file.path === carte.source)).toBe(true);
  });

  it('shows the icon in the preview, says a picture icon is left out, and writes the emoji on the page', () => {
    const read = readExport(notionWithHtml(), { mint });
    const plan = planImport(read, choices(), EMPTY, mint);
    const entries = previewEntries(plan);
    expect(entries.map(entry => entry.title)).toEqual(expect.arrayContaining(['🌍 Voyage', '💰 Budget', '✈️ Vols', 'Lisbonne', 'Sans icône']));
    expect(entries.find(entry => entry.title === 'Lisbonne')?.why).toMatch(/icône est une image/);
    const result = importChanges(plan, EMPTY, 1000, mint);
    const blocks = written(result.changes);
    const voyage = Object.values(read.pages).find(page => page.title === 'Voyage')!;
    expect(blocks[voyage.id]).toMatchObject({ kind: 'page', text: 'Voyage', icon: '🌍' });
    expect(result.iconed).toEqual([]);
  });

  it('imported again over pages that came without icons, gives each its icon and takes it back with the import', () => {
    const made = library([
      ['old', 'page', null, 'Voyage', 'a0'],
      ['oldLis', 'page', 'old', 'Lisbonne', 'a0'],
      ['oldBudget', 'page', 'old', 'Budget', 'a1'],
    ]);
    // A page here with an icon of its own keeps it.
    const here: ImportLibrary = { ...made, blocks: { ...made.blocks, oldBudget: { ...made.blocks.oldBudget!, icon: '📊' } } };
    const plan = planImport(readExport(notionWithHtml(), { mint }), choices({ placement: 'top' }), here, mint);
    expect(plan.pages.filter(page => page.fate === 'same').map(page => [page.title, page.iconAdded])).toEqual([
      ['Voyage', true],
      ['Lisbonne', false],
      ['Budget', false],
    ]);
    expect(plan.totals.icons).toBe(1);
    expect(previewEntries(plan).find(entry => entry.key === plan.pages.find(page => page.title === 'Voyage')!.key)?.why).toMatch(/son icône/);
    expect(importCountLines(plan).some(line => /icône ajoutée/.test(line.text))).toBe(true);
    const result = importChanges(plan, here, 1000, mint);
    expect(result.changes.find(change => change.id === 'old')?.patch).toEqual({ icon: '🌍' });
    expect(result.changes.some(change => change.id === 'oldBudget' && 'icon' in change.patch)).toBe(false);
    expect(result.iconed).toEqual(['old']);
    expect(importReportLines(result, 0, 0)).toContain('1 icône ajoutée à une page déjà là');
    expect(importUndoChanges(result.created, 2000, result.iconed)).toContainEqual({ type: 'block', id: 'old', patch: { icon: null } });
  });
});

describe('Markdown from a folder read as pages', () => {
  const vault: ExportFile[] = [
    { path: 'Coffre/Accueil.md', text: '# Accueil\n\nVoir [[Recettes/Tarte|la tarte]] et [[Inconnue]].\n\n![[photo.jpg]]', bytes: 60 },
    { path: 'Coffre/Recettes/Tarte.md', text: '---\ntags: [dessert]\n---\nUne ligne\net la suivante\n\n    - un point', bytes: 50 },
    { path: 'Coffre/Recettes/Recettes.md', text: 'Le carnet de recettes.', bytes: 22 },
    { path: 'Coffre/Notes/Idée.md', text: 'Rien de plus.', bytes: 13 },
    { path: 'Coffre/attachments/photo.jpg', bytes: 30 * 1024 * 1024 },
    { path: 'Coffre/.obsidian/app.json', text: '{}', bytes: 2 },
  ];

  it('makes each folder a page of its name, its folder note its words, and a vault’s name the new page’s', () => {
    const read = readExport(vault, { mint });
    expect(read.kind).toBe('markdown');
    expect(read.root).toBe('Coffre');
    expect(importContainerTitle(read, new Date(2026, 10, 12).getTime())).toBe('Coffre');
    expect(importContainerTitle({ kind: 'notion', root: 'Export-abc' }, new Date(2026, 10, 12).getTime())).toBe('Import Notion du 12 novembre');
    expect(read.top.map(key => read.pages[key]!.title)).toEqual(['Accueil', 'Notes', 'Recettes']);
    const recettes = read.pages['Recettes/']!;
    expect(recettes.drafts[0]).toMatchObject({ kind: 'text', text: 'Le carnet de recettes.' });
    expect(recettes.children.map(key => read.pages[key]!.title)).toEqual(['Tarte']);
  });

  it('reads a note’s title from its name, its wiki links as mentions (other words kept), its lines as one paragraph, its properties left out', () => {
    const read = readExport(vault, { mint });
    const accueil = read.pages['Accueil.md']!;
    const tarte = read.pages['Recettes/Tarte.md']!;
    const runs = parseRich(accueil.drafts[0]!.text);
    expect(runs.some(run => run.kind === 'mention' && run.target.id === tarte.id)).toBe(true);
    expect(runs.some(run => run.kind === 'text' && run.text.startsWith('Voir la tarte ('))).toBe(true);
    expect(accueil.counts.broken).toBe(1);
    expect(tarte.drafts[0]).toMatchObject({ kind: 'text', text: 'Une ligne\net la suivante' });
    // A picture past the server's limit: its place stays, said why.
    expect(accueil.drafts[1]!.extra?.importFile).toBeUndefined();
    expect(read.leftOut.some(item => item.title === 'photo.jpg' && /25 Mo/.test(item.why))).toBe(true);
  });
});

describe('planning and writing an import', () => {
  beforeEach(() => {
    counter = 0;
  });

  it('lists every page with its path and what it holds, then what is left out', () => {
    const read = readExport(notionExport(), { mint });
    const entries = previewEntries(planImport(read, choices(), EMPTY, mint));
    const lisbonne = entries.find(entry => entry.title === 'Lisbonne')!;
    expect(lisbonne).toMatchObject({ fate: 'new', note: 'Dans Voyage' });
    expect(entries.find(entry => entry.title === '🌍 Voyage')?.detail).toMatch(/bloc.*image.*tableau/);
    expect(entries.filter(entry => entry.fate === 'skip').map(entry => entry.title)).toEqual(expect.arrayContaining(['absente.png']));
  });

  it('writes the pages under a new page of their own, in one batch, files listed to attach after', () => {
    const read = readExport(notionExport(), { mint });
    const plan = planImport(read, choices({ private: true }), EMPTY, mint);
    const result = importChanges(plan, EMPTY, 1000, mint);
    const blocks = written(result.changes);
    const container = blocks[plan.container!.id]!;
    expect(container).toMatchObject({ kind: 'page', parentId: null, text: 'Import Notion du 12 novembre', private: true });
    const voyage = read.pages[read.top[0]!]!;
    expect(blocks[voyage.id]).toMatchObject({ parentId: container.id, icon: '🌍', private: true });
    expect(result.pages).toBe(4);
    expect(result.opened).toBe(container.id);
    expect(result.files.map(file => file.asset.name)).toEqual(['carte.png']);
    expect(blocks[result.files[0]!.blockId]).toMatchObject({ kind: 'image', fileId: null, fileName: 'carte.png' });
    // Every block is in a place that exists in the batch.
    for (const block of Object.values(blocks)) if (block.parentId !== null) expect(blocks[block.parentId]).toBeDefined();
    expect(Object.values(blocks).some(block => 'importFile' in (block as unknown as Record<string, unknown>))).toBe(false);
  });

  it('leaves out a page with what it holds, and names it where another page mentioned it', () => {
    const read = readExport(notionExport(), { mint });
    const voyage = read.pages[read.top[0]!]!;
    const lisbonne = read.pages[voyage.children[0]!]!;
    const plan = planImport(read, choices({ off: new Set([lisbonne.key]) }), EMPTY, mint);
    const result = importChanges(plan, EMPTY, 1000, mint);
    const blocks = written(result.changes);
    expect(blocks[lisbonne.id]).toBeUndefined();
    const first = Object.values(blocks).find(block => block.parentId === voyage.id && block.kind === 'text')!;
    expect(parseRich(first.text).some(run => run.kind === 'mention')).toBe(false);
    expect(first.text).toContain('Lisbonne');
    expect(previewEntries(plan).find(entry => entry.key === lisbonne.key)).toMatchObject({ fate: 'new' });
  });

  it('imported again at the same place, keeps the pages already there and adds only their new sub-pages', () => {
    const read = readExport(notionExport(), { mint });
    const here = library([
      ['old', 'page', null, 'Voyage', 'a0'],
      ['oldLis', 'page', 'old', 'Lisbonne', 'a0'],
    ]);
    const plan = planImport(read, choices({ placement: 'top' }), here, mint);
    expect(plan.pages.map(page => [page.title, page.fate])).toEqual([
      ['Voyage', 'same'],
      ['Lisbonne', 'same'],
      ['Budget', 'new'],
      ['Vols', 'new'],
    ]);
    const result = importChanges(plan, here, 1000, mint);
    const blocks = written(result.changes);
    const budget = Object.values(blocks).find(block => block.kind === 'page' && block.text === 'Budget')!;
    expect(budget.parentId).toBe('old');
    expect(budget.position > 'a0').toBe(true);
    // Kept as it is but for its icon, which it lacked.
    expect(result.changes.filter(change => change.id === 'old')).toEqual([{ type: 'block', id: 'old', patch: { icon: '🌍' } }]);
  });

  it('the same export the same day finds its new page again and adds nothing', () => {
    const read = readExport(notionExport(), { mint });
    const first = importChanges(planImport(read, choices(), EMPTY, mint), EMPTY, 1000, mint);
    const blocks = written(first.changes);
    const children: Record<string, string[]> = {};
    for (const block of Object.values(blocks)) (children[block.parentId ?? ROOT] ??= []).push(block.id);
    const again = planImport(readExport(notionExport(), { mint }), choices(), { blocks, blocksByParent: children }, mint);
    expect(again.container?.fate).toBe('same');
    expect(again.totals.pages).toBe(0);
  });
});

describe('the pieces of an export', () => {
  it('reads a CSV with quotes, line breaks in them and its separator', () => {
    expect(parseCsv('a;b\n"x;1";"deux\nlignes"\n')).toEqual([
      ['a', 'b'],
      ['x;1', 'deux\nlignes'],
    ]);
    expect(parseCsv('\uFEFFName,Note\r\n"Il a dit ""oui""",3\r\n')).toEqual([
      ['Name', 'Note'],
      ['Il a dit "oui"', '3'],
    ]);
  });

  it('reads days as Notion writes them', () => {
    expect(exportDay('November 12, 2026')).toBe('2026-11-12');
    expect(exportDay('November 12, 2026 3:04 PM')).toBe('2026-11-12');
    expect(exportDay('12 novembre 2026')).toBe('2026-11-12');
    expect(exportDay('2026-11-12 → 2026-11-14')).toBe('2026-11-12');
    expect(exportDay('demain')).toBeNull();
  });

  it('reads Markdown from an export beyond a paste: nested paragraphs, `~~~` code, wiki links left as words without a reader', () => {
    const drafts: BlockDraft[] = blocksFromMarkdown('- Point\n\n    Détail\n\n~~~js\nx()\n~~~\n\n[[Page]]', {});
    expect(drafts.map(draft => draft.kind)).toEqual(['bullet', 'code', 'text']);
    expect(drafts[0]!.children?.[0]).toMatchObject({ kind: 'text', text: 'Détail' });
    expect(drafts[1]).toMatchObject({ language: 'javascript', text: 'x()' });
    expect(drafts[2]!.text).toBe('Page');
  });
});
