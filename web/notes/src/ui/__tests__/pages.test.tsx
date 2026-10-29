import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { blocksFromText } from '@unlease/notes/services/pageText';

import { freshLibrary } from '../../test/library';
import { addLink, createLine, createNote, setLinkDone, updateLink } from '../../app/store/actions';
import { useLibraryStore } from '../../app/store/library';
import { createPage, insertBlock, insertDrafts, insertTable, setCell, setCollectionView, trashPage } from '../../app/store/pages';
import { setToggleOpen } from '../../app/store/pagesUi';
import { htmlToDrafts, pageMarkdown, readBlocks, writeBlocks } from '../features/pages/clipboard';
import { selectBlocks } from '../features/pages/editorStore';
import { PagesBinSection } from '../features/pages/PagesBin';
import { PageView } from '../features/pages/PageView';
import { findCommands } from '../features/pages/slashCommands';
import { NavList } from '../navigation/NavDrawer';
import { PagesScreen } from '../screens/PagesScreen';

const state = () => useLibraryStore.getState();

/** A page with a heading, a task, a mention of a note and a table. */
function travelPage(): { page: string; todo: string; table: string } {
  const page = createPage({ title: 'Voyage' });
  insertBlock(page, page, 0, { kind: 'h2', text: 'Préparatifs' });
  const todo = insertBlock(page, page, 1, { kind: 'todo', text: 'Réserver l’hôtel', checked: false });
  const note = createNote({ kind: 'text', title: 'Valise', body: 'Passeport' });
  insertBlock(page, page, 2, { kind: 'text', text: `La liste est dans {@note=${note}}.` });
  const table = insertTable(page, { afterId: todo })!;
  return { page, todo, table };
}

describe('a page', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('draws its blocks: headings, tasks, mentions by their current name, typed cells', async () => {
    const user = userEvent.setup();
    const { page, todo, table } = travelPage();
    const columns = state().blocks[table]!.columns;
    const [row] = state().blocksByParent[table]!;
    setCell(page, row!, columns[0]!.id, 'Hôtel');
    render(<PageView id={page} />);
    expect(screen.getByRole('textbox', { name: 'Titre de la page' })).toHaveTextContent('Voyage');
    expect(screen.getByRole('textbox', { name: 'Titre 2' })).toHaveTextContent('Préparatifs');
    expect(screen.getByText('Valise')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByRole('button', { name: 'Nom : Hôtel' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Marquer comme fait' }));
    expect(state().blocks[todo]!.checked).toBe(true);
  });

  it('reads as it is from the bin, with a way to restore it', () => {
    const { page } = travelPage();
    trashPage(page);
    render(<PageView id={page} />);
    expect(screen.getByText(/dans la corbeille/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restaurer' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Titre de la page' })).toHaveAttribute('contenteditable', 'false');
    expect(screen.queryByRole('button', { name: 'Plus d’actions' })).toBeNull();
  });

  it('says when it last changed and has its own menu: a copy, the bin', async () => {
    const user = userEvent.setup();
    const { page } = travelPage();
    render(<PageView id={page} />);
    expect(screen.getByText(/^Modifiée à \d\d:\d\d$/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Ajouter une sous-page', 'Déplacer vers…', 'Dupliquer', 'Copier le lien', 'Exporter en Markdown', 'Mettre à la corbeille']);
    await user.click(screen.getByRole('menuitem', { name: 'Dupliquer' }));
    expect(Object.values(state().blocks).filter(block => block.kind === 'page').map(block => block.text)).toContain('Voyage (copie)');
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Mettre à la corbeille' }));
    expect(state().blocks[page]!.trashedAt).not.toBeNull();
  });

  it('moves from its menu into another page, or back to the top level', async () => {
    const user = userEvent.setup();
    const voyage = createPage({ title: 'Voyage' });
    const day = createPage({ parentId: voyage, title: 'Jour 1' });
    render(<PageView id={day} />);
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Déplacer vers…' }));
    await user.click(await screen.findByRole('button', { name: /Au premier niveau/ }));
    expect(state().blocks[day]!.parentId).toBeNull();
  });
});

describe('a collection embedded in a page', () => {
  let page: string;
  let embed: string;
  let line: string;

  beforeEach(async () => {
    await freshLibrary();
    line = createLine({ id: 'line-films', title: 'Films', code: 'F', color: 'blue', emblem: 'fleur', hint: '' });
    const film = addLink('https://www.allocine.fr/cleo', { noteId: line });
    updateLink(film, { status: 'ready', title: 'Cléo de 5 à 7', kind: 'film', siteName: 'AlloCiné', attributes: [{ label: 'Réalisateur', value: 'Agnès Varda' }, { label: 'Année', value: '1962' }] });
    page = createPage({ title: 'Ciné' });
    embed = insertBlock(page, page, 0, { kind: 'embed', target: { type: 'note', id: line } });
  });

  const heads = (): string[] => within(screen.getByRole('table', { name: 'Liens de Films' })).getAllByRole('columnheader').map(head => head.textContent ?? '');

  it('shows its links as a table of their properties, whose columns move and hide', async () => {
    const user = userEvent.setup();
    render(<PageView id={page} />);
    expect(screen.queryByRole('table')).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Tableau' }));
    expect(state().blocks[embed]!.view).toBe('table');
    expect(heads()).toEqual(['Titre', 'Site', 'Réalisateur', 'Année']);
    expect(screen.getByRole('link', { name: 'Cléo de 5 à 7' })).toBeInTheDocument();
    expect(screen.getByText('Agnès Varda')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Année' }));
    await user.click(screen.getByRole('menuitem', { name: 'Déplacer à gauche' }));
    expect(heads()).toEqual(['Titre', 'Site', 'Année', 'Réalisateur']);
    await user.click(screen.getByRole('button', { name: 'Site' }));
    await user.click(screen.getByRole('menuitem', { name: 'Masquer la colonne' }));
    expect(heads()).toEqual(['Titre', 'Année', 'Réalisateur']);

    // Shown again from « Colonnes »: it comes after the last one shown.
    await user.click(screen.getByRole('button', { name: 'Colonnes' }));
    await user.click(screen.getByRole('switch', { name: 'Afficher Site' }));
    expect(heads()).toEqual(['Titre', 'Année', 'Réalisateur', 'Site']);
    expect(state().blocks[embed]!.viewColumns.filter(column => column.shown).map(column => column.key)).toEqual(['fact:annee', 'fact:realisateur', 'site']);
  });

  it('takes no new row or column: a row is a link added to the collection', async () => {
    const user = userEvent.setup();
    setCollectionView(page, embed, 'table');
    render(<PageView id={page} />);
    expect(screen.queryByRole('button', { name: 'Nouvelle ligne' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ajouter une colonne' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Ajouter un lien' }));
    await user.type(screen.getByRole('textbox', { name: 'Ajouter un lien à Films' }), 'https://www.allocine.fr/peau-d-ane{Enter}');
    expect(state().linksByNote[line]).toHaveLength(2);
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3);
  });

  it('shows its links done too, under « Déjà faits », when asked from its grip', async () => {
    const user = userEvent.setup();
    const done = addLink('https://www.allocine.fr/peau-d-ane', { noteId: line });
    updateLink(done, { status: 'ready', title: 'Peau d’âne', kind: 'film' });
    setLinkDone(done, true);
    render(<PageView id={page} />);
    const grip = (): HTMLElement => within(document.querySelector<HTMLElement>(`[data-select-block="${embed}"]`)!).getByRole('button', { name: 'Déplacer le bloc, ou ouvrir son menu' });
    expect(screen.queryByText('Peau d’âne')).toBeNull();
    await user.click(grip());
    await user.click(screen.getByRole('menuitem', { name: 'Afficher les déjà faits' }));
    expect(state().blocks[embed]!.showDone).toBe(true);
    const rows = within(screen.getByRole('list', { name: 'Liens de Films' })).getAllByRole('listitem');
    expect(rows.map(row => row.textContent)).toEqual([expect.stringContaining('Cléo de 5 à 7'), 'Déjà faits · 1', expect.stringContaining('Peau d’âne')]);

    // As a table: the same rows, the one done put back to do from its end.
    setCollectionView(page, embed, 'table');
    const table = await screen.findByRole('table', { name: 'Liens de Films' });
    expect(within(table).getByRole('rowheader', { name: 'Déjà faits · 1' })).toBeInTheDocument();
    await user.click(within(table).getByRole('button', { name: 'Remettre « Peau d’âne » à faire' }));
    expect(state().links[done]!.done).toBe(false);

    await user.click(grip());
    await user.click(screen.getByRole('menuitem', { name: 'Masquer les déjà faits' }));
    expect(state().blocks[embed]!.showDone).toBe(false);
  });

  it('keeps its look from the bin, without the means to change it', () => {
    setCollectionView(page, embed, 'table');
    trashPage(page);
    render(<PageView id={page} />);
    expect(screen.getByRole('table', { name: 'Liens de Films' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Liste' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ajouter un lien' })).toBeNull();
  });
});

describe('what a page points at', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  const gripOf = (id: string): HTMLElement => within(document.querySelector<HTMLElement>(`[data-select-block="${id}"]`)!).getByRole('button', { name: 'Déplacer le bloc, ou ouvrir son menu' });
  const items = (): string[] => screen.getAllByRole('menuitem').map(item => item.textContent ?? '');

  it('switches from its grip between a mention, a bookmark and an embed', async () => {
    const user = userEvent.setup();
    const note = createNote({ kind: 'text', title: 'Valise', body: 'Passeport' });
    const page = createPage({ title: 'Voyage' });
    const block = insertBlock(page, page, 0, { kind: 'text', text: `{@note=${note}} ` });
    render(<PageView id={page} />);

    await user.click(gripOf(block));
    expect(items()).toEqual(expect.arrayContaining(['Afficher en signet', 'Afficher en intégration']));
    expect(items()).not.toContain('Afficher en mention');
    await user.click(screen.getByRole('menuitem', { name: 'Afficher en signet' }));
    expect(state().blocks[block]).toMatchObject({ kind: 'bookmark', target: { type: 'note', id: note } });
    expect(await screen.findByRole('link', { name: /Valise/ })).toBeInTheDocument();

    await user.click(gripOf(block));
    await user.click(screen.getByRole('menuitem', { name: 'Afficher en intégration' }));
    expect(state().blocks[block]!.kind).toBe('embed');
    expect(await screen.findByRole('textbox', { name: 'Texte de la note' })).toHaveTextContent('Passeport');

    await user.click(gripOf(block));
    await user.click(screen.getByRole('menuitem', { name: 'Afficher en mention' }));
    expect(state().blocks[block]).toMatchObject({ kind: 'text', text: `{@note=${note}}` });
  });

  it('offers no embed of a page, and no switch for a text with more than its mention', async () => {
    const user = userEvent.setup();
    const page = createPage({ title: 'Voyage' });
    const other = createPage({ title: 'Budget' });
    const bookmark = insertBlock(page, page, 0, { kind: 'bookmark', target: { type: 'page', id: other } });
    const sentence = insertBlock(page, page, 1, { kind: 'text', text: `Voir {@page=${other}} avant de partir.` });
    render(<PageView id={page} />);
    await user.click(gripOf(bookmark));
    expect(items()).toContain('Afficher en mention');
    expect(items()).not.toContain('Afficher en intégration');
    await user.keyboard('{Escape}');
    await user.click(gripOf(sentence));
    expect(items().filter(item => item.startsWith('Afficher en'))).toEqual([]);
  });
});

describe('a block reached from a search', () => {
  const scrolled = vi.fn();

  beforeEach(async () => {
    await freshLibrary();
    scrolled.mockClear();
    // jsdom draws nothing, so it has no scrollIntoView.
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: scrolled, configurable: true, writable: true });
  });

  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    window.history.replaceState(null, '', '/');
  });

  it('is shown at #block-<id>: its toggle opened, brought into view, washed a moment, the address cleaned', async () => {
    const page = createPage({ title: 'Voyage' });
    const toggle = insertBlock(page, page, 0, { kind: 'toggle', text: 'Adresses' });
    const inside = insertBlock(page, toggle, 0, { kind: 'text', text: 'Consulat' });
    window.history.replaceState(null, '', `/page/${page}#block-${inside}`);
    render(<PageView id={page} />);
    await waitFor(() => expect(scrolled).toHaveBeenCalledTimes(1));
    const block = document.querySelector(`[data-select-block="${inside}"]`);
    expect(scrolled.mock.contexts[0]).toBe(block);
    expect(block).toHaveAttribute('data-flash');
    expect(window.location.pathname).toBe(`/page/${page}`);
    expect(window.location.hash).toBe('');
  });
});

describe('blocks selected with a box', () => {
  beforeEach(async () => {
    await freshLibrary();
    // jsdom draws nothing, so it has no scrollIntoView.
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: () => {}, configurable: true, writable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  /** One, a toggle holding an item, three, four; jsdom lays nothing out, so each stands 40px tall, 400px wide from x 100, from y 100. */
  function boxPage(): { page: string; one: string; toggle: string; inside: string; three: string; four: string } {
    const page = createPage({ title: 'Voyage' });
    const one = insertBlock(page, page, 0, { kind: 'text', text: 'Un' });
    const toggle = insertBlock(page, page, 1, { kind: 'toggle', text: 'Adresses' });
    const inside = insertBlock(page, toggle, 0, { kind: 'text', text: 'Consulat' });
    const three = insertBlock(page, page, 2, { kind: 'text', text: 'Trois' });
    const four = insertBlock(page, page, 3, { kind: 'text', text: 'Quatre' });
    setToggleOpen(toggle, true);
    const rows: Record<string, readonly [number, number]> = { [one]: [100, 140], [toggle]: [140, 220], [inside]: [180, 220], [three]: [220, 260], [four]: [260, 300] };
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const id = this instanceof HTMLElement ? this.dataset.selectBlock : undefined;
      const [top, bottom] = (id ? rows[id] : undefined) ?? [0, 0];
      const left = top === bottom ? 0 : 100;
      const right = top === bottom ? 0 : 500;
      return { top, bottom, left, right, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => ({}) } as DOMRect;
    });
    return { page, one, toggle, inside, three, four };
  }

  const tail = (): HTMLElement => document.querySelector<HTMLElement>('[data-drop-tail]')!;
  const editor = (): HTMLElement => document.querySelector<HTMLElement>('[data-page-editor]')!;
  const selected = (): string[] => [...document.querySelectorAll<HTMLElement>('[data-selected]')].map(element => element.dataset.selectBlock!);
  const press = (target: Element, x: number, y: number): boolean => fireEvent.pointerDown(target, { button: 0, isPrimary: true, pointerType: 'mouse', clientX: x, clientY: y });
  const drag = (x: number, y: number): boolean => fireEvent.pointerMove(window, { clientX: x, clientY: y });
  const release = (): boolean => fireEvent.pointerUp(window);

  it('selects every block the box touches, with what they hold; then the keys act on them', () => {
    const { page, one, toggle, inside, three, four } = boxPage();
    render(<PageView id={page} />);
    press(tail(), 50, 110);
    drag(150, 150);
    expect(selected()).toEqual([one, toggle, inside]);
    drag(150, 230);
    expect(selected()).toEqual([one, toggle, inside, three]);
    release();
    expect(document.activeElement).toBe(editor());
    fireEvent.keyDown(editor(), { key: 'Backspace' });
    expect(state().blocksByParent[page]).toEqual([four]);
  });

  it('touches a block holding others by its own lines: over a toggle’s item alone, the item alone', () => {
    const { page, inside } = boxPage();
    render(<PageView id={page} />);
    press(tail(), 50, 190);
    drag(150, 210);
    expect(selected()).toEqual([inside]);
  });

  it('starts from the empty space only, and a press that does not move stays a click', () => {
    const { page } = boxPage();
    render(<PageView id={page} />);
    press(screen.getByRole('textbox', { name: 'Titre de la page' }), 50, 50);
    drag(150, 300);
    release();
    expect(selected()).toEqual([]);
    const count = state().blocksByParent[page]!.length;
    press(tail(), 50, 400);
    drag(150, 120);
    release();
    fireEvent.click(tail());
    expect(state().blocksByParent[page]).toHaveLength(count);
    press(tail(), 50, 400);
    release();
    fireEvent.click(tail());
    expect(state().blocksByParent[page]).toHaveLength(count + 1);
  });

  it('keeps the selection under a block’s grip, whose menu then acts on every selected block', async () => {
    const user = userEvent.setup();
    const { page, one, three, four } = boxPage();
    render(<PageView id={page} />);
    press(tail(), 50, 110);
    drag(150, 230);
    release();
    const grip = within(document.querySelector<HTMLElement>(`[data-select-block="${three}"]`)!).getByRole('button', { name: 'Déplacer le bloc, ou ouvrir son menu' });
    await user.click(grip);
    expect(selected()).toContain(one);
    await user.click(screen.getByRole('menuitem', { name: /^Supprimer/ }));
    expect(state().blocksByParent[page]).toEqual([four]);
  });
});

describe('Enter in a page', () => {
  beforeEach(async () => {
    await freshLibrary();
    // jsdom draws nothing: no scrollIntoView, no caret rectangles.
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: () => {}, configurable: true, writable: true });
    Object.defineProperty(Range.prototype, 'getClientRects', { value: () => [], configurable: true, writable: true });
  });

  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    delete (Range.prototype as { getClientRects?: unknown }).getClientRects;
  });

  const kids = (id: string): string[] => [...(state().blocksByParent[id] ?? [])];
  const rich = (id: string): HTMLElement => document.querySelector<HTMLElement>(`[data-rich-block="${id}"]`)!;
  const caretAt = (node: Node, offset: number): void => {
    window.getSelection()!.setBaseAndExtent(node, offset, node, offset);
  };
  /** Words typed into a block, as the browser leaves them: the caret after them, then the input event. */
  const typeIn = (element: HTMLElement, value: string): void => {
    element.textContent = value;
    caretAt(element.firstChild!, value.length);
    fireEvent.input(element);
  };

  it('goes on from the title in a new paragraph at the top, which takes what follows the caret', async () => {
    const page = createPage({ title: 'Voyage à Lisbonne' });
    const day = insertBlock(page, page, 0, { kind: 'text', text: 'Jour 1' });
    render(<PageView id={page} />);
    const title = screen.getByRole('textbox', { name: 'Titre de la page' });
    caretAt(title.firstChild!, 6);
    fireEvent.keyDown(title, { key: 'Enter' });
    const top = kids(page)[0]!;
    expect(kids(page)).toEqual([top, day]);
    expect(state().blocks[page]!.text).toBe('Voyage');
    expect(state().blocks[top]!.text).toBe(' à Lisbonne');
    await waitFor(() => expect(document.activeElement).toBe(rich(top)));
  });

  it('goes on in a new paragraph, the « / » and « @ » of a sentence left to it', async () => {
    const page = createPage({ title: 'Voyage' });
    const block = insertBlock(page, page, 0, { kind: 'text', text: '' });
    render(<PageView id={page} />);
    typeIn(rich(block), 'Le /');
    expect(screen.getByRole('listbox', { name: 'Blocs' })).toBeInTheDocument();
    typeIn(rich(block), 'Le / texte');
    expect(screen.queryByRole('listbox', { name: 'Blocs' })).not.toBeInTheDocument();
    fireEvent.keyDown(rich(block), { key: 'Enter' });
    expect(state().blocks[block]!.text).toBe('Le / texte');
    const next = kids(page)[1]!;
    await waitFor(() => expect(document.activeElement).toBe(rich(next)));
    // Nothing to pick in the menu: Enter goes on, and the menu goes.
    typeIn(rich(next), 'Paris /');
    typeIn(rich(next), 'Paris /Lyon');
    expect(screen.getByText('Aucun bloc ne correspond.')).toBeInTheDocument();
    fireEvent.keyDown(rich(next), { key: 'Enter' });
    expect(screen.queryByText('Aucun bloc ne correspond.')).not.toBeInTheDocument();
    expect(kids(page)).toHaveLength(3);
    expect(state().blocks[next]!.text).toBe('Paris /Lyon');
  });

  it('brings an empty paragraph out of the toggle it is in', () => {
    const page = createPage({ title: 'Voyage' });
    const toggle = insertBlock(page, page, 0, { kind: 'toggle', text: 'Adresses' });
    const inside = insertBlock(page, toggle, 0, { kind: 'text', text: '' });
    setToggleOpen(toggle, true);
    render(<PageView id={page} />);
    fireEvent.keyDown(rich(inside), { key: 'Enter' });
    expect(kids(page)).toEqual([toggle, inside]);
    expect(kids(toggle)).toEqual([]);
  });

  it('goes on in a new paragraph after a selected block with no text, and leaves a code block for one', async () => {
    const page = createPage({ title: 'Voyage' });
    const first = insertBlock(page, page, 0, { kind: 'text', text: 'Budget' });
    const table = insertTable(page, { afterId: first })!;
    const code = insertBlock(page, page, 2, { kind: 'code', text: 'npm start', language: 'plain' });
    render(<PageView id={page} />);
    const editor = document.querySelector<HTMLElement>('[data-page-editor]')!;
    act(() => selectBlocks([table]));
    editor.focus();
    fireEvent.keyDown(editor, { key: 'Enter' });
    const after = kids(page)[2]!;
    expect(kids(page)).toEqual([first, table, after, code]);
    expect(state().blocks[after]).toMatchObject({ kind: 'text', text: '' });
    await waitFor(() => expect(document.activeElement).toBe(rich(after)));
    fireEvent.keyDown(screen.getByRole('textbox', { name: /^Code/ }), { key: 'Enter', ctrlKey: true });
    expect(kids(page)).toHaveLength(5);
    expect(kids(page)[3]).toBe(code);
    await waitFor(() => expect(document.activeElement).toBe(rich(kids(page)[4]!)));
  });
});

describe('the pages in the navigation and on their home', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('lists the pages as a tree, sub-pages under a chevron', async () => {
    const user = userEvent.setup();
    const voyage = createPage({ title: 'Voyage' });
    createPage({ parentId: voyage, title: 'Jour 1' });
    render(<NavList route={{ name: 'pages' }} />);
    const tree = screen.getByRole('tree', { name: 'Pages' });
    expect(within(tree).getByText('Voyage')).toBeInTheDocument();
    expect(within(tree).queryByText('Jour 1')).toBeNull();
    await user.click(within(tree).getByRole('button', { name: 'Déplier Voyage' }));
    expect(within(tree).getByText('Jour 1')).toBeInTheDocument();
  });

  it('lists the top-level pages, says what a page holds while they are few, and points to the bin', () => {
    const kept = createPage({ title: 'Recettes' });
    insertBlock(kept, kept, 0, { kind: 'text', text: 'Les crêpes de {b:mamie}' });
    createPage({ parentId: kept, title: 'Crêpes' });
    const thrown = createPage({ title: 'Brouillon' });
    act(() => void trashPage(thrown));
    render(<PagesScreen />);
    // Two pages: the home still says what a page can hold, and shows them at a glance without "Récentes".
    expect(screen.getByText(/une page peut en contenir d’autres/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Récentes' })).toBeNull();
    const all = screen.getByRole('region', { name: 'Toutes les pages' });
    expect(within(all).getAllByRole('link')).toHaveLength(1);
    expect(within(all).getByRole('link')).toHaveTextContent(/Recettes.*1 sous-page · Modifiée à/);
    expect(screen.queryByText('Brouillon')).toBeNull();
    // `plural` keeps the count and its word together with a no-break space.
    expect(screen.getByRole('link', { name: '1\u00a0page dans la corbeille' })).toHaveAttribute('href', '/trash');
  });

  it('starts from the pages changed last once there are enough of them, a sub-page saying where it sits', () => {
    const base = Date.now();
    for (const [index, title] of ['Voyage', 'Lectures', 'Maison'].entries()) createPage({ title }, base + index * 1000);
    const kept = createPage({ title: 'Recettes' }, base + 4000);
    insertBlock(kept, kept, 0, { kind: 'text', text: 'Les crêpes de {b:mamie}' }, base + 5000);
    createPage({ parentId: kept, title: 'Crêpes' }, base + 6000);
    render(<PagesScreen />);
    // Five pages, a few: one row of three sheets, the latest first.
    const recent = screen.getByRole('region', { name: 'Récentes' });
    expect(within(recent).getAllByRole('link').map(link => link.getAttribute('aria-label'))).toEqual(['Crêpes', 'Recettes', 'Maison']);
    expect(within(recent).getByRole('link', { name: 'Recettes' })).toHaveTextContent('Les crêpes de mamie');
    expect(within(recent).getByRole('link', { name: 'Crêpes' })).toHaveTextContent('Recettes');
    expect(screen.queryByText(/une page peut en contenir d’autres/)).toBeNull();
  });

  it('lists the pages in the bin for the Corbeille, to restore or delete for good', async () => {
    const user = userEvent.setup();
    const thrown = createPage({ title: 'Brouillon' });
    const { container } = render(<PagesBinSection />);
    expect(container).toBeEmptyDOMElement();
    act(() => void trashPage(thrown));
    expect(screen.getByRole('heading', { name: 'Pages · 1' })).toBeInTheDocument();
    expect(screen.getByText('Brouillon')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restaurer' }));
    expect(state().blocks[thrown]!.trashedAt).toBeNull();
    expect(container).toBeEmptyDOMElement();
    act(() => void trashPage(thrown));
    await user.click(screen.getByRole('button', { name: 'Supprimer définitivement' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }));
    expect(state().blocks[thrown]?.deletedAt).not.toBeNull();
  });

  it('keeps to its rows inside the Corbeille, whose head empties the bin', () => {
    act(() => void trashPage(createPage({ title: 'Brouillon' })));
    render(<PagesBinSection embedded />);
    expect(screen.getByRole('heading', { name: 'Pages · 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer les pages' })).toBeNull();
    expect(screen.queryByText(/jours dans la corbeille/)).toBeNull();
  });
});

describe('the editor’s helpers', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('finds « / » commands by their French name or a Markdown sign', () => {
    expect(findCommands('tit').map(command => command.key)).toEqual(['h1', 'h2', 'h3', 'h4']);
    expect(findCommands('h3').map(command => command.key)).toEqual(['h3']);
    expect(findCommands('tableau').map(command => command.key)).toEqual(['table']);
  });

  it('reads HTML pasted from a web page as blocks, marks and tables included', () => {
    const drafts = htmlToDrafts('<h2>Titre</h2><p>Un <b>mot</b> et un <a href="https://exemple.fr">lien</a></p><ul><li>un<ul><li>sous</li></ul></li></ul><table><tr><th>Ville</th></tr><tr><td>Rome</td></tr></table>');
    expect(drafts.map(draft => draft.kind)).toEqual(['h2', 'text', 'bullet', 'table']);
    expect(drafts[1]!.text).toBe('Un {b:mot} et un {a=https\\://exemple.fr:lien}');
    expect(drafts[2]!.children?.[0]?.text).toBe('sous');
    expect(drafts[3]!.children).toHaveLength(1);
  });

  it('exports a page as Markdown: its title, then its blocks a blank line apart, a sub-page by its title', () => {
    const page = createPage({ title: 'Voyage' });
    insertDrafts(page, blocksFromText('## Préparatifs\n- [ ] Réserver\n- [x] Payer\nUn **mot**'), { parentId: page, index: 0 });
    const day = createPage({ parentId: page, title: 'Jour 1' });
    insertBlock(day, day, 0, { kind: 'text', text: 'Pas ici' });
    expect(pageMarkdown(page)).toBe('# Voyage\n\n## Préparatifs\n\n- [ ] Réserver\n- [x] Payer\n\nUn **mot**\n\nJour 1\n');
  });

  it('copies blocks whole for a page of this app, and as Markdown for anything else', () => {
    const page = createPage({ title: 'Notes' });
    const ids = insertDrafts(page, blocksFromText('# Titre\n- [x] fait'), { parentId: page, index: 0 });
    // jsdom has no DataTransfer: what a clipboard event carries, as far as these use it.
    const store = new Map<string, string>();
    const data = { setData: (type: string, value: string) => store.set(type, value), getData: (type: string) => store.get(type) ?? '' } as unknown as DataTransfer;
    writeBlocks(ids, data);
    expect(data.getData('text/plain')).toBe('# Titre\n- [x] fait');
    expect(readBlocks(data)?.map(draft => draft.kind)).toEqual(['h1', 'todo']);
  });
});
