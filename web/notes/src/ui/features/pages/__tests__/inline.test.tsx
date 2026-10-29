import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dateWords, isoDayOf, shiftDay } from '@unlease/core/services/dates';
import { dateRun } from '@unlease/core/services/richText';

import { freshLibrary } from '../../../../test/library';
import { useLibraryStore } from '../../../../app/store/library';
import { createPage, insertBlock, trashPage } from '../../../../app/store/pages';
import { htmlToDrafts, pageMarkdown, writeBlocks } from '../clipboard';
import { selectBlocks } from '../editorStore';
import { openFormat } from '../formatState';
import { PageView } from '../PageView';

const state = () => useLibraryStore.getState();
const text = (id: string): string => state().blocks[id]!.text;
const rich = (id: string): HTMLElement => document.querySelector<HTMLElement>(`[data-rich-block="${id}"]`)!;
const caretAt = (node: Node, offset: number): void => {
  window.getSelection()!.setBaseAndExtent(node, offset, node, offset);
};
/** Words typed into a block, as the browser leaves them: the caret after them, then the input event. */
const typeIn = (element: HTMLElement, value: string, caret = value.length): void => {
  element.textContent = value;
  caretAt(element.firstChild!, caret);
  fireEvent.input(element);
};
const scrolled = vi.fn();

beforeEach(async () => {
  await freshLibrary();
  scrolled.mockClear();
  // jsdom draws nothing: no scrollIntoView, no caret rectangles.
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: scrolled, configurable: true, writable: true });
  Object.defineProperty(Range.prototype, 'getClientRects', { value: () => [], configurable: true, writable: true });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { value: () => new DOMRect(), configurable: true, writable: true });
});

afterEach(() => {
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  delete (Range.prototype as { getClientRects?: unknown }).getClientRects;
  delete (Range.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect;
});

describe('a date in a page', () => {
  it('reads relative to today, its day under the pointer, and changes in its editor at once', async () => {
    const user = userEvent.setup();
    const now = Date.now();
    const today = isoDayOf(now);
    const tomorrow = shiftDay(now, 1);
    const page = createPage({ title: 'Voyage' });
    const block = insertBlock(page, page, 0, { kind: 'text', text: `Départ {@date=${tomorrow}} au matin` });
    render(<PageView id={page} />);
    const chip = document.querySelector<HTMLElement>('[data-date]')!;
    expect(chip).toHaveTextContent('Demain');
    expect(chip.dataset.tip).toBe(dateWords(dateRun(tomorrow)!));

    await user.click(chip);
    const editor = await screen.findByRole('dialog', { name: 'Date' });
    expect(within(editor).getByRole('heading').textContent).toBe(dateWords(dateRun(tomorrow)!));
    expect(within(editor).getByRole('button', { name: 'Demain' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(editor).getByRole('button', { name: 'Aujourd’hui' }));
    expect(text(block)).toBe(`Départ {@date=${today}} au matin`);
    expect(within(editor).getByRole('button', { name: 'Aujourd’hui' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(editor).getByRole('switch', { name: 'Heure' }));
    expect(text(block)).toMatch(new RegExp(`^Départ \\{@date=${today}T\\d{4}\\} au matin$`));
    fireEvent.change(within(editor).getByLabelText('Heure'), { target: { value: '14:30' } });
    expect(text(block)).toBe(`Départ {@date=${today}T1430} au matin`);
    expect(document.querySelector('[data-date]')).toHaveTextContent('Aujourd’hui 14:30');

    // Another day of the month: the time stays.
    const other = today.endsWith('-15') ? `${today.slice(0, 8)}16` : `${today.slice(0, 8)}15`;
    const day = within(editor)
      .getAllByRole('button')
      .find(button => button.dataset.day === other)!;
    await user.click(day);
    expect(text(block)).toBe(`Départ {@date=${other}T1430} au matin`);

    await user.click(within(editor).getByRole('button', { name: 'Retirer la date' }));
    // The space it leaves doubled goes too.
    expect(text(block)).toBe('Départ au matin');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Date' })).not.toBeInTheDocument());
  });

  it('moves between days with the arrows, and between months with Page up and down', async () => {
    const user = userEvent.setup();
    const page = createPage({ title: 'Voyage' });
    insertBlock(page, page, 0, { kind: 'text', text: 'Le {@date=2026-03-31}' });
    render(<PageView id={page} />);
    await user.click(document.querySelector<HTMLElement>('[data-date]')!);
    const editor = await screen.findByRole('dialog', { name: 'Date' });
    const chosen = within(editor).getByRole('button', { pressed: true, name: /31/ });
    await waitFor(() => expect(document.activeElement).toBe(chosen));
    fireEvent.keyDown(chosen, { key: 'ArrowRight' });
    // Into April, the month shown with it.
    await waitFor(() => expect((document.activeElement as HTMLElement).dataset.day).toBe('2026-04-01'));
    expect(within(editor).getByText(/avril 2026/)).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    await waitFor(() => expect((document.activeElement as HTMLElement).dataset.day).toBe('2026-03-25'));
    fireEvent.keyDown(document.activeElement!, { key: 'PageDown' });
    await waitFor(() => expect((document.activeElement as HTMLElement).dataset.day).toBe('2026-04-25'));
  });

  it('opens its editor with Entrée once chosen alone, and comes from « / » as today', async () => {
    const page = createPage({ title: 'Voyage' });
    const block = insertBlock(page, page, 0, { kind: 'text', text: '' });
    render(<PageView id={page} />);
    typeIn(rich(block), 'Rappel /');
    typeIn(rich(block), 'Rappel /date');
    fireEvent.keyDown(rich(block), { key: 'Enter' });
    expect(text(block)).toBe(`Rappel {@date=${isoDayOf(Date.now())}} `);
    const editor = await screen.findByRole('dialog', { name: 'Date' });
    fireEvent.keyDown(editor, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Date' })).not.toBeInTheDocument());

    const root = rich(block);
    const index = [...root.childNodes].findIndex(node => node instanceof HTMLElement && node.dataset.date !== undefined);
    act(() => {
      root.focus();
      window.getSelection()!.setBaseAndExtent(root, index, root, index + 1);
    });
    fireEvent.keyDown(root, { key: 'Enter' });
    expect(await screen.findByRole('dialog', { name: 'Date' })).toBeInTheDocument();
    // Entrée opened it: the paragraph did not split.
    expect(state().blocksByParent[page]).toEqual([block]);
  });
});

describe('« @ » and « [[ »', () => {
  it('offers dates in the mention menu: first once typed, last with nothing typed', async () => {
    const now = Date.now();
    const page = createPage({ title: 'Voyage' });
    createPage({ title: 'Valise' });
    const block = insertBlock(page, page, 0, { kind: 'text', text: '' });
    render(<PageView id={page} />);
    typeIn(rich(block), 'RDV @');
    let options = within(screen.getByRole('listbox', { name: 'Pages, notes, collections, liens et dates' })).getAllByRole('option');
    expect(options[0]).toHaveTextContent('Valise');
    expect(options[options.length - 1]).toHaveTextContent(/^Aujourd’hui \d\d:\d\d/);

    typeIn(rich(block), 'RDV @dem');
    options = within(screen.getByRole('listbox', { name: 'Pages, notes, collections, liens et dates' })).getAllByRole('option');
    // « Demain » says which day it is.
    expect(options[0]!.textContent).toBe(`Demain${dateWords(dateRun(shiftDay(now, 1))!)}`);
    fireEvent.keyDown(rich(block), { key: 'Enter' });
    expect(text(block)).toBe(`RDV {@date=${shiftDay(now, 1)}} `);
  });

  it('reads a date and a time typed after « @ »', () => {
    const now = Date.now();
    const page = createPage({ title: 'Voyage' });
    const block = insertBlock(page, page, 0, { kind: 'text', text: '' });
    render(<PageView id={page} />);
    typeIn(rich(block), '@');
    typeIn(rich(block), '@demain 14h');
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options[0]).toHaveTextContent('Demain 14:00');
    fireEvent.keyDown(rich(block), { key: 'Enter' });
    expect(text(block)).toBe(`{@date=${shiftDay(now, 1)}T1400} `);
  });

  it('cites a page with « [[ », a « ]] » after the caret taken with it', () => {
    const page = createPage({ title: 'Voyage' });
    const valise = createPage({ title: 'Valise' });
    const block = insertBlock(page, page, 0, { kind: 'text', text: '' });
    render(<PageView id={page} />);
    typeIn(rich(block), 'Voir [[');
    const list = screen.getByRole('listbox', { name: 'Pages' });
    // Pages only: not the collection every library has, nor this page.
    expect(within(list).getAllByRole('option').map(option => option.textContent)).toEqual(['Valise']);
    typeIn(rich(block), 'Voir [[Val]] ici', 'Voir [[Val'.length);
    fireEvent.keyDown(rich(block), { key: 'Enter' });
    expect(text(block)).toBe(`Voir {@page=${valise}} ici`);
  });

  it('leaves « [[ » as it was typed on Échap, and opens nothing inside a word', () => {
    const page = createPage({ title: 'Voyage' });
    createPage({ title: 'Valise' });
    const block = insertBlock(page, page, 0, { kind: 'text', text: '' });
    render(<PageView id={page} />);
    typeIn(rich(block), 'tableau[[');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    typeIn(rich(block), '[[');
    expect(screen.getByRole('listbox', { name: 'Pages' })).toBeInTheDocument();
    fireEvent.keyDown(rich(block), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(rich(block)).toHaveTextContent('[[');
  });
});

describe('emojis', () => {
  it('offers those a word after « : » names, and puts the one picked in its place', async () => {
    const page = createPage({ title: 'Voyage' });
    const block = insertBlock(page, page, 0, { kind: 'text', text: '' });
    render(<PageView id={page} />);
    typeIn(rich(block), 'Il fait :s');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    typeIn(rich(block), 'Il fait :soleil');
    const list = await screen.findByRole('listbox', { name: 'Emoji pour « soleil »' });
    const options = within(list).getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    expect(options.length).toBeLessThanOrEqual(8);
    const first = options[0]!.querySelector('[aria-hidden]')!.textContent!;
    expect(first).toBe('☀️');
    fireEvent.keyDown(rich(block), { key: 'Enter' });
    expect(text(block)).toBe('Il fait ☀️');
  });

  it('takes the emoji lit when « : » closes the word, and leaves the word as it is on Échap', async () => {
    const page = createPage({ title: 'Voyage' });
    const block = insertBlock(page, page, 0, { kind: 'text', text: '' });
    render(<PageView id={page} />);
    typeIn(rich(block), 'Merci :coeur');
    const lit = (await screen.findByRole('listbox', { name: 'Emoji pour « coeur »' })).querySelector('[data-active] [aria-hidden]')!.textContent!;
    fireEvent.keyDown(rich(block), { key: ':' });
    expect(text(block)).toBe(`Merci ${lit}`);

    typeIn(rich(block), `Merci ${lit} :soleil`);
    await screen.findByRole('listbox', { name: 'Emoji pour « soleil »' });
    fireEvent.keyDown(rich(block), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    // Typed on, the word turned down opens nothing more.
    typeIn(rich(block), `Merci ${lit} :soleils`);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens nothing for an address, a time, or a word nothing answers', async () => {
    const page = createPage({ title: 'Voyage' });
    const block = insertBlock(page, page, 0, { kind: 'text', text: '' });
    render(<PageView id={page} />);
    typeIn(rich(block), 'https://exemple.fr à 10:30');
    typeIn(rich(block), 'Note :zzqx');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens the emoji picker from « / » at the caret', async () => {
    const user = userEvent.setup();
    const page = createPage({ title: 'Voyage' });
    const block = insertBlock(page, page, 0, { kind: 'text', text: '' });
    render(<PageView id={page} />);
    typeIn(rich(block), 'Bravo /');
    typeIn(rich(block), 'Bravo /emoji');
    fireEvent.keyDown(rich(block), { key: 'Enter' });
    const picker = await screen.findByRole('dialog', { name: 'Insérer un emoji' });
    await user.type(within(picker).getByRole('searchbox'), 'fusée{Enter}');
    expect(text(block)).toBe('Bravo 🚀');
  });
});

describe('keyboard keys', () => {
  it('are set from the formatting bar, and typing at their end goes after them', async () => {
    const user = userEvent.setup();
    const page = createPage({ title: 'Voyage' });
    const block = insertBlock(page, page, 0, { kind: 'text', text: 'Appuyez sur Ctrl+K' });
    render(<PageView id={page} />);
    act(() => openFormat({ block, start: 12, end: 18, link: false }));
    await user.click(screen.getByRole('button', { name: 'Touches' }));
    expect(text(block)).toBe('Appuyez sur {k:Ctrl+K}');
    expect(rich(block).querySelector('[data-k]')).toHaveTextContent('Ctrl+K');
  });
});

describe('a table of contents', () => {
  it('lists the headings, further in by depth, live; a press brings one into view and lights it', async () => {
    const user = userEvent.setup();
    const page = createPage({ title: 'Voyage' });
    insertBlock(page, page, 0, { kind: 'toc' });
    const prep = insertBlock(page, page, 1, { kind: 'h2', text: 'Préparatifs' });
    insertBlock(page, page, 2, { kind: 'h3', text: `Avant le {@date=2026-11-12}` });
    const toggle = insertBlock(page, page, 3, { kind: 'toggle', text: 'Adresses' });
    const inside = insertBlock(page, toggle, 0, { kind: 'h3', text: 'Consulat' });
    render(<PageView id={page} />);
    const toc = screen.getByRole('navigation', { name: 'Table des matières' });
    const entries = within(toc).getAllByRole('link');
    expect(entries.map(entry => [entry.textContent, entry.dataset.depth])).toEqual([
      ['Préparatifs', '0'],
      [`Avant le ${dateWords(dateRun('2026-11-12')!)}`, '1'],
      ['Consulat', '1'],
    ]);
    expect(entries[0]).toHaveAttribute('href', `/page/${page}#block-${prep}`);

    await user.click(entries[2]!);
    // Its toggle opened, the heading brought under the header and lit.
    await waitFor(() => expect(scrolled).toHaveBeenCalled());
    const heading = document.querySelector(`[data-select-block="${inside}"]`);
    expect(scrolled.mock.contexts[scrolled.mock.contexts.length - 1]).toBe(heading);
    expect(scrolled).toHaveBeenLastCalledWith(expect.objectContaining({ block: 'start' }));
    expect(heading).toHaveAttribute('data-flash');

    act(() => {
      insertBlock(page, page, 4, { kind: 'h1', text: 'Retour' });
    });
    expect(within(toc).getAllByRole('link').map(entry => [entry.textContent, entry.dataset.depth])).toEqual([
      ['Préparatifs', '1'],
      [`Avant le ${dateWords(dateRun('2026-11-12')!)}`, '2'],
      ['Consulat', '2'],
      ['Retour', '0'],
    ]);
  });

  it('can be duplicated, moved or deleted from its grip, never turned into text', async () => {
    const user = userEvent.setup();
    const page = createPage({ title: 'Voyage' });
    const toc = insertBlock(page, page, 0, { kind: 'toc' });
    render(<PageView id={page} />);
    const block = document.querySelector<HTMLElement>(`[data-select-block="${toc}"]`)!;
    await user.click(within(block).getByRole('button', { name: 'Déplacer le bloc, ou ouvrir son menu' }));
    expect(screen.getAllByRole('menuitem').map(item => item.textContent?.replace(/Ctrl\+D|Suppr$/, ''))).toEqual(['Dupliquer', 'Déplacer vers…', 'Supprimer']);
  });

  it('still leads to the headings of a page in the bin, whose dates are words', async () => {
    const user = userEvent.setup();
    const page = createPage({ title: 'Voyage' });
    insertBlock(page, page, 0, { kind: 'toc' });
    insertBlock(page, page, 1, { kind: 'h2', text: `Départ {@date=${shiftDay(Date.now(), 1)}}` });
    trashPage(page);
    render(<PageView id={page} />);
    await user.click(document.querySelector<HTMLElement>('[data-date]')!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('navigation', { name: 'Table des matières' })).getByRole('link'));
    await waitFor(() => expect(scrolled).toHaveBeenCalled());
  });

  it('says how to fill it while the page has no heading, and is reached from the keyboard once selected', () => {
    const page = createPage({ title: 'Voyage' });
    const toc = insertBlock(page, page, 0, { kind: 'toc' });
    render(<PageView id={page} />);
    expect(screen.getByText('Ajoutez des titres à la page : ils apparaîtront ici.')).toBeInTheDocument();
    act(() => {
      insertBlock(page, page, 1, { kind: 'h2', text: 'Budget' });
      insertBlock(page, page, 2, { kind: 'h2', text: 'Itinéraire' });
    });
    const editor = document.querySelector<HTMLElement>('[data-page-editor]')!;
    act(() => selectBlocks([toc]));
    editor.focus();
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(document.activeElement).toHaveTextContent('Budget');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toHaveTextContent('Itinéraire');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(document.activeElement).toBe(editor);
    expect(document.querySelector(`[data-select-block="${toc}"]`)).toHaveAttribute('data-selected');
  });
});

describe('through the clipboard', () => {
  /** jsdom has no DataTransfer: what a clipboard event carries, as far as these use it. */
  const transfer = (): DataTransfer => {
    const store = new Map<string, string>();
    return { setData: (type: string, value: string) => store.set(type, value), getData: (type: string) => store.get(type) ?? '' } as unknown as DataTransfer;
  };

  it('keeps dates and keys between pages, and writes them as words elsewhere; a table of contents adds nothing', () => {
    const page = createPage({ title: 'Voyage' });
    const toc = insertBlock(page, page, 0, { kind: 'toc' });
    const line = insertBlock(page, page, 1, { kind: 'text', text: 'Départ {@date=2026-11-12T0715}, {k:Ctrl+K}' });
    const data = transfer();
    writeBlocks([toc, line], data);
    const words = dateWords(dateRun('2026-11-12', '07:15')!);
    expect(data.getData('text/plain')).toBe(`Départ ${words}, <kbd>Ctrl+K</kbd>`);
    expect(htmlToDrafts(data.getData('text/html'))).toEqual([{ kind: 'text', text: 'Départ {@date=2026-11-12T0715}, {k:Ctrl+K}' }]);
    expect(JSON.parse(data.getData('application/x-carnet-blocks')).map((draft: { kind: string }) => draft.kind)).toEqual(['toc', 'text']);
    expect(pageMarkdown(page)).toBe(`# Voyage\n\nDépart ${words}, <kbd>Ctrl+K</kbd>\n`);
  });

  it('copies words holding a date as the day they name, never « Demain »', () => {
    const tomorrow = shiftDay(Date.now(), 1);
    const page = createPage({ title: 'Voyage' });
    const block = insertBlock(page, page, 0, { kind: 'text', text: `Départ {@date=${tomorrow}} tôt` });
    render(<PageView id={page} />);
    const root = rich(block);
    act(() => {
      root.focus();
      window.getSelection()!.setBaseAndExtent(root.firstChild!, 0, root.lastChild!, 4);
    });
    const data = transfer();
    const copy = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(copy, 'clipboardData', { value: data });
    root.dispatchEvent(copy);
    expect(copy.defaultPrevented).toBe(true);
    expect(data.getData('text/plain')).toBe(`Départ ${dateWords(dateRun(tomorrow)!)} tôt`);
    expect(htmlToDrafts(data.getData('text/html'))[0]!.text).toBe(`Départ {@date=${tomorrow}} tôt`);
  });
});
