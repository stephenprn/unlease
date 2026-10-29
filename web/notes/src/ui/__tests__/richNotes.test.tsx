import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { noteLines, type NoteLine } from '@unlease/notes/services/noteBody';
import { formatHlc } from '@unlease/core/sync/hlc';
import { writeFields } from '@unlease/core/sync/record';

import { freshLibrary } from '../../test/library';
import { createNote, updateNote } from '../../app/store/actions';
import { acknowledge, getRecord, mergeRemote, useLibraryStore } from '../../app/store/library';
import { createPage, insertBlock } from '../../app/store/pages';
import { setOnboarded } from '../../app/store/settings';
import { App } from '../App';
import { deleteBackward, deleteForward, insertText, replaceRange, splitLine, textLines } from '../features/note/lineEdits';
import { NoteEditor } from '../features/note/NoteEditor';
import { linesFromHtml, readLines, renderLines, selectionOffsets, setSelectionOffsets } from '../features/note/noteDom';
import { PageView } from '../features/pages/PageView';
import { initHistory } from '../router';

const state = () => useLibraryStore.getState();
const lines = (body: string): NoteLine[] => noteLines(body, true);
const text = (value: string): NoteLine => ({ heading: 0, runs: value ? [{ kind: 'text', text: value, marks: {} }] : [] });

describe('a note’s lines edited by offsets', () => {
  it('splits a heading as the pages do: its end starts text, its middle goes on as text, its start opens a line above', () => {
    const heading = lines('# Titre\nla suite');
    expect(splitLine(heading, 5, 5)).toEqual({ lines: [{ heading: 1, runs: [{ kind: 'text', text: 'Titre', marks: {} }] }, text(''), text('la suite')], caret: 6 });
    expect(splitLine(heading, 2, 2).lines.map(line => line.heading)).toEqual([1, 0, 0]);
    expect(splitLine(heading, 0, 0)).toEqual({ lines: [text(''), heading[0], heading[1]], caret: 1 });
  });

  it('turns a heading back to text with Backspace at its start before joining anything, and joins lines with Delete', () => {
    const body = lines('avant\n## Titre');
    expect(deleteBackward(body, 6)!.lines).toEqual([text('avant'), text('Titre')]);
    expect(deleteBackward(lines('avant\nTitre'), 6)).toEqual({ lines: [text('avantTitre')], caret: 5 });
    expect(deleteBackward(body, 7)).toBeNull();
    // An empty line before a heading goes, the heading stays one.
    expect(deleteForward(lines('\n## Titre'), 0)!.lines).toEqual([{ heading: 2, runs: [{ kind: 'text', text: 'Titre', marks: {} }] }]);
  });

  it('keeps the next line apart when a whole line is replaced (a triple click), and types over a selection in its marks', () => {
    const body = lines('{b:gras}\nsuite');
    expect(replaceRange(body, 0, 5).lines).toEqual([text(''), text('suite')]);
    expect(insertText(body, 0, 4, 'fort', { b: true }).lines[0]).toEqual({ heading: 0, runs: [{ kind: 'text', text: 'fort', marks: { b: true } }] });
    // Pasted lines: a heading at a line's start stays one, the rest of the line follows the last.
    const pasted = replaceRange(lines('ab'), 1, 1, [{ heading: 1, runs: [{ kind: 'text', text: 'x', marks: {} }] }, text('y')]);
    expect(pasted).toEqual({ lines: [text('ax'), text('yb')], caret: 4 });
    expect(replaceRange(lines('ab'), 0, 2).lines).toEqual([text('')]);
    expect(textLines('un\r\ndeux')).toEqual([text('un'), text('deux')]);
  });
});

describe('a note’s lines in the editable', () => {
  it('draws one block per line and reads back what the browser leaves', () => {
    const root = document.createElement('div');
    renderLines(root, lines('# Titre\n{b,u:gras} et {i:penché}\n'));
    expect(root.innerHTML).toBe('<div data-heading="1">Titre</div><div><span data-b="" data-u="">gras</span> et <span data-i="">penché</span></div><div><br></div>');
    root.insertAdjacentHTML('beforeend', '<div>a<b>b</b><br>c</div>');
    expect(readLines(root).map(line => line.runs.map(run => (run.kind === 'text' ? `${run.text}${Object.keys(run.marks).join('')}` : '')).join('|'))).toEqual(['Titre', 'grasbu| et |penchéi', '', 'a|bb', 'c']);
  });

  it('counts offsets across lines, a line break counting one', () => {
    const root = document.createElement('div');
    document.body.append(root);
    renderLines(root, lines('ab\n\n{b:cd}e'));
    setSelectionOffsets(root, 5, 7);
    expect(selectionOffsets(root)).toEqual({ start: 5, end: 7, backward: false });
    expect(window.getSelection()!.toString()).toBe('de');
    root.remove();
  });

  it('keeps a paste’s marks and headings, and leaves words alone to their plain text', () => {
    expect(linesFromHtml('<h2 style="font-weight:700">Courses</h2><p>du <strong>pain</strong> et <em>du</em> <u>lait</u></p>')).toEqual([
      { heading: 2, runs: [{ kind: 'text', text: 'Courses', marks: {} }] },
      {
        heading: 0,
        runs: [
          { kind: 'text', text: 'du ', marks: {} },
          { kind: 'text', text: 'pain', marks: { b: true } },
          { kind: 'text', text: ' et ', marks: {} },
          { kind: 'text', text: 'du', marks: { i: true } },
          { kind: 'text', text: ' ', marks: {} },
          { kind: 'text', text: 'lait', marks: { u: true } },
        ],
      },
    ]);
    // Google Docs wraps a whole copy in a bold tag that says it is not.
    expect(linesFromHtml('<b style="font-weight:normal"><p>simple</p><p>texte</p></b>')).toBeNull();
  });
});

describe('formatting a note', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  const bar = (): HTMLElement => screen.getByRole('toolbar', { name: 'Mise en forme' });
  /** Words selected in the body, as a person would leave them. */
  const select = (body: HTMLElement, start: number, end: number): void =>
    act(() => {
      body.focus();
      setSelectionOffsets(body, start, end);
      document.dispatchEvent(new Event('selectionchange'));
    });

  it('shows the bar over selected words, and formats a plain note for good from it', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'text', title: 'Samedi', body: 'Courses du samedi\npain et lait' });
    render(<NoteEditor id={id} onClose={() => {}} />);
    const body = screen.getByRole('textbox', { name: 'Texte de la note' });
    expect(screen.queryByRole('toolbar', { name: 'Mise en forme' })).toBeNull();

    select(body, 0, 7);
    await user.click(within(bar()).getByRole('button', { name: 'Gras' }));
    expect(state().notes[id]).toMatchObject({ rich: true, body: '{b:Courses} du samedi\npain et lait' });
    expect(within(bar()).getByRole('button', { name: 'Gras' })).toHaveAttribute('aria-pressed', 'true');

    // A heading takes the whole line; its own level again makes it text.
    await user.click(within(bar()).getByRole('button', { name: 'Titre 1' }));
    expect(state().notes[id]!.body).toBe('# {b:Courses} du samedi\npain et lait');
    expect(within(bar()).getByRole('button', { name: 'Titre 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(body.querySelector('[data-heading="1"]')?.textContent).toBe('Courses du samedi');
    await user.click(within(bar()).getByRole('button', { name: 'Titre 1' }));
    expect(state().notes[id]!.body).toBe('{b:Courses} du samedi\npain et lait');

    select(body, 0, 30);
    await user.click(within(bar()).getByRole('button', { name: 'Effacer la mise en forme' }));
    expect(state().notes[id]).toMatchObject({ rich: true, body: 'Courses du samedi\npain et lait' });

    // The bar leaves with the selection.
    act(() => {
      setSelectionOffsets(body, 3);
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(screen.queryByRole('toolbar', { name: 'Mise en forme' })).toBeNull();
  });

  it('formats with Ctrl+B, I and U, undoes with Ctrl+Z and redoes with Ctrl+Maj+Z', () => {
    const id = createNote({ kind: 'text', body: 'un mot' });
    render(<NoteEditor id={id} onClose={() => {}} />);
    const body = screen.getByRole('textbox', { name: 'Texte de la note' });
    select(body, 3, 6);
    fireEvent.keyDown(body, { key: 'b', ctrlKey: true });
    fireEvent.keyDown(body, { key: 'i', metaKey: true });
    fireEvent.keyDown(body, { key: 'u', ctrlKey: true });
    expect(state().notes[id]!.body).toBe('un {b,i,u:mot}');
    fireEvent.keyDown(body, { key: 'z', ctrlKey: true });
    expect(state().notes[id]!.body).toBe('un {b,i:mot}');
    // The words come back selected, so the bar shows what they wear.
    expect(selectionOffsets(body)).toMatchObject({ start: 3, end: 6 });
    fireEvent.keyDown(body, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(state().notes[id]!.body).toBe('un {b,i,u:mot}');
    fireEvent.keyDown(body, { key: 'y', ctrlKey: true });
    expect(state().notes[id]!.body).toBe('un {b,i,u:mot}');
  });

  it('puts the bar away with Escape, leaving the note open', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'text', body: 'trois mots ici' });
    let closed = false;
    render(<NoteEditor id={id} onClose={() => (closed = true)} />);
    const body = screen.getByRole('textbox', { name: 'Texte de la note' });
    select(body, 0, 5);
    expect(bar()).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('toolbar', { name: 'Mise en forme' })).toBeNull();
    expect(closed).toBe(false);
  });

  it('turns Markdown into what it writes as it is typed, and an undo brings the marks typed back', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'text' });
    render(<NoteEditor id={id} onClose={() => {}} />);
    const body = screen.getByRole('textbox', { name: 'Texte de la note' });
    await user.click(body);
    await user.keyboard('## Menu');
    expect(body.querySelector('[data-heading="2"]')?.textContent).toBe('Menu');
    // Enter at the end of a heading starts a line of text.
    await user.keyboard('{Enter}un **plat** et *dessert*');
    expect(body.children[0]).toHaveAttribute('data-heading', '2');
    expect(body.children[1]!.innerHTML.replace('<br>', '')).toBe('un <span data-b="">plat</span> et <span data-i="">dessert</span>');
    await waitFor(() => expect(state().notes[id]).toMatchObject({ rich: true, body: '## Menu\nun {b:plat} et {i:dessert}' }));
    fireEvent.keyDown(body, { key: 'z', ctrlKey: true });
    expect(body.textContent).toBe('Menuun plat et *dessert*');
  });

  it('turns a heading back to text with Backspace at its start', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'text' });
    updateNote(id, { body: 'avant\n# Titre', rich: true });
    render(<NoteEditor id={id} onClose={() => {}} />);
    const body = screen.getByRole('textbox', { name: 'Texte de la note' });
    await user.click(body);
    act(() => setSelectionOffsets(body, 6));
    await user.keyboard('{Backspace}');
    expect(body.innerHTML).toBe('<div>avant</div><div>Titre</div>');
    await user.keyboard('{Backspace}');
    expect(body.innerHTML).toBe('<div>avantTitre</div>');
    await waitFor(() => expect(state().notes[id]!.body).toBe('avantTitre'));
  });

  it('keeps a plain note plain while nothing in it is formatted', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'text', body: 'Lait' });
    render(<NoteEditor id={id} onClose={() => {}} />);
    const body = screen.getByRole('textbox', { name: 'Texte de la note' });
    await user.click(body);
    act(() => setSelectionOffsets(body, 4));
    await user.keyboard('{Enter}{{pain}');
    await waitFor(() => expect(state().notes[id]).toMatchObject({ rich: false, body: 'Lait\n{pain}' }));
  });

  it('keeps a plain note’s first marks when another device’s edit lands at the same moment', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'text', body: 'Lait' });
    acknowledge([getRecord('note', id)!]);
    render(<NoteEditor id={id} onClose={() => {}} />);
    const body = screen.getByRole('textbox', { name: 'Texte de la note' });
    await user.click(body);
    act(() => setSelectionOffsets(body, 4));
    await user.keyboard(' bio');
    // Before the save fires, the phone's edit arrives; then the first word is made bold.
    act(() => void mergeRemote([writeFields(getRecord('note', id)!, { body: 'Lait x2' }, formatHlc(Date.now() + 60_000, 0, 'phone1'))]));
    select(body, 0, 4);
    fireEvent.keyDown(body, { key: 'b', ctrlKey: true });
    await waitFor(() => expect(state().notes[id]).toMatchObject({ rich: true, body: '{b:Lait} x2 bio' }));
    expect(body.querySelector('[data-b]')?.textContent).toBe('Lait');
  });

  it('stands the bar on the keyboard under a finger on a phone-sized window', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(max-width: 719px)' || query === '(max-width: 719px) and (pointer: coarse)', media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }));
    const id = createNote({ kind: 'text', body: 'au doigt' });
    render(<NoteEditor id={id} onClose={() => {}} />);
    const body = screen.getByRole('textbox', { name: 'Texte de la note' });
    select(body, 3, 8);
    expect(bar()).toHaveClass('dockedBar');
    fireEvent.click(within(bar()).getByRole('button', { name: 'Souligné' }));
    expect(state().notes[id]!.body).toBe('au {u:doigt}');
    vi.unstubAllGlobals();
  });

  it('reads a formatted note in the bin as it is, without the bar', () => {
    const id = createNote({ kind: 'text' });
    updateNote(id, { body: '# Titre\n{b:gras}', rich: true, trashedAt: Date.now() });
    render(<NoteEditor id={id} onClose={() => {}} />);
    const body = screen.getByRole('textbox', { name: 'Texte de la note' });
    expect(body).toHaveAttribute('contenteditable', 'false');
    expect(body.querySelector('[data-b]')?.textContent).toBe('gras');
    select(body, 0, 5);
    expect(screen.queryByRole('toolbar', { name: 'Mise en forme' })).toBeNull();
  });
});

describe('a formatted note elsewhere', () => {
  beforeEach(async () => {
    await freshLibrary();
    setOnboarded();
    history.replaceState(null, '', '/');
    initHistory();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows on its card as written at the card’s size, a search marked inside its marks', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'text', title: 'Lyon' });
    updateNote(id, { body: '# Samedi\nla {b:gare} et le {i:marché}', rich: true });
    render(<App />);
    const card = document.querySelector<HTMLElement>(`[data-note-id="${id}"]`)!;
    const body = card.querySelector('p')!;
    // One flow of text, so the clamp counts its lines: a heading is a bold line of the card's size.
    expect(body.textContent).toBe('Samedi\nla gare et le marché');
    expect(within(body).getByText('Samedi')).toHaveClass('heading');
    expect(within(body).getByText('gare')).toHaveClass('b');
    expect(within(body).getByText('marché')).toHaveClass('i');
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher' }), 'gare');
    const found = document.querySelector<HTMLElement>(`[data-note-id="${id}"] p`)!;
    expect(within(found).getByText('gare', { selector: 'mark' }).parentElement).toHaveClass('b');
  });

  it('is typed and formatted in a page’s embed as in its editor', async () => {
    const id = createNote({ kind: 'text', title: 'Valise' });
    updateNote(id, { body: '## Papiers\n{b:Passeport}', rich: true });
    const page = createPage({ title: 'Voyage' });
    insertBlock(page, page, 0, { kind: 'embed', target: { type: 'note', id } });
    render(<PageView id={page} />);
    const body = await screen.findByRole('textbox', { name: 'Texte de la note' });
    expect(body.querySelector('[data-heading="2"]')?.textContent).toBe('Papiers');
    act(() => {
      body.focus();
      setSelectionOffsets(body, 0, 7);
      document.dispatchEvent(new Event('selectionchange'));
    });
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Mise en forme' })).getByRole('button', { name: 'Titre 2' }));
    expect(state().notes[id]!.body).toBe('Papiers\n{b:Passeport}');
  });

  it('is shown in the spotlight’s preview as written', async () => {
    const user = userEvent.setup();
    // A wide window: the chosen result lies beside the list.
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(min-width: 1100px)', media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }));
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: () => {}, configurable: true, writable: true });
    const id = createNote({ kind: 'text', title: 'Lyon' });
    updateNote(id, { body: '# Samedi\nla {b:gare} et le {i:marché}\nsans rien', rich: true });
    render(<App />);
    await user.keyboard('{Control>}p{/Control}');
    const dialog = screen.getByRole('dialog', { name: 'Rechercher' });
    await user.type(within(dialog).getByRole('combobox', { name: 'Rechercher' }), 'gare');
    const preview = within(dialog).getByRole('complementary', { name: 'Aperçu' });
    expect(within(preview).getByText('Samedi')).toHaveAttribute('data-level', 'h1');
    expect(within(preview).getByText('gare', { selector: 'mark' }).parentElement).toHaveClass('b');
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });
});
