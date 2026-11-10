/**
 * « Annuler » and « Rétablir » in the note editor (the bar, ⌘Z and ⌘⇧Z anywhere in the sheet, one
 * history for the note), and a colour for several picked notes from the selection bar.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freshLibrary } from '@test/library';
import { TYPING_PAUSE_MS } from '@unlease/notes/services/editHistory';
import { addCheck, createLine, createNote, setPinned } from '../../app/store/actions';
import { useLibraryStore } from '../../app/store/library';
import { setOnboarded } from '@shared/app/store/settings';
import { useUiStore } from '@shared/app/store/ui';
import { App } from '@shared/ui/App';
import { initHistory } from '@shared/ui/router';
import { NoteEditor } from '../features/note/NoteEditor';
import { setSelectionOffsets } from '../features/note/noteDom';

const state = () => useLibraryStore.getState();
const undoButton = () => screen.getByRole('button', { name: 'Annuler' });
const redoButton = () => screen.getByRole('button', { name: 'Rétablir' });

describe('undo and redo in the note editor', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('steps through typing, a pause apart, and a colour, from the bar and the keys', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const id = createNote({ kind: 'text', title: 'Courses' });
    render(<NoteEditor id={id} onClose={() => {}} />);
    // Always in the wide bar, disabled at the ends of the history.
    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeDisabled();

    const title = screen.getByRole('textbox', { name: 'Titre' });
    await user.type(title, ' du samedi');
    await act(async () => {
      vi.advanceTimersByTime(TYPING_PAUSE_MS + 500);
    });
    await user.type(title, ' matin');
    expect(undoButton()).toBeEnabled();

    // ⌘Z in the title: what was typed is saved, then the last stretch goes.
    fireEvent.keyDown(title, { key: 'z', metaKey: true });
    expect(state().notes[id]!.title).toBe('Courses du samedi');
    expect(title).toHaveValue('Courses du samedi');
    await user.click(undoButton());
    expect(state().notes[id]!.title).toBe('Courses');
    expect(undoButton()).toBeDisabled();
    fireEvent.keyDown(title, { key: 'z', metaKey: true, shiftKey: true });
    expect(state().notes[id]!.title).toBe('Courses du samedi');

    // A colour is a step; doing something new forgets what was undone.
    await user.click(screen.getByRole('button', { name: 'Couleur et papier' }));
    await user.click(screen.getByRole('radio', { name: 'Safran' }));
    expect(state().notes[id]!.color).toBe('yellow');
    expect(redoButton()).toBeDisabled();
    await user.click(undoButton());
    expect(state().notes[id]!.color).toBeNull();
    await user.click(redoButton());
    expect(state().notes[id]!.color).toBe('yellow');
  });

  it('takes the body’s own ⌘Z, and an item Enter split off', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'checklist', title: 'Courses' });
    addCheck(id, 'painlait');
    render(<NoteEditor id={id} onClose={() => {}} />);
    const items = () => screen.getAllByRole('textbox', { name: 'Texte de l’élément' }) as HTMLTextAreaElement[];
    const texts = () => (state().checksByNote[id] ?? []).map(cid => state().checks[cid]!.text);
    await user.click(items()[0]!);
    items()[0]!.setSelectionRange(4, 4);
    await user.keyboard('{Enter}');
    expect(texts()).toEqual(['pain', 'lait']);
    await waitFor(() => expect(document.activeElement).toBe(items()[1]));
    // The browser's own undo would know nothing of the split: ⌘Z takes it back whole.
    fireEvent.keyDown(items()[1]!, { key: 'z', ctrlKey: true });
    expect(texts()).toEqual(['painlait']);
    fireEvent.keyDown(items()[0]!, { key: 'y', ctrlKey: true });
    expect(texts()).toEqual(['pain', 'lait']);
  });

  it('takes typing in the body back from the bar, the words shown at once', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'text', title: 'Idées', body: 'Marché' });
    render(<NoteEditor id={id} onClose={() => {}} />);
    const body = screen.getByRole('textbox', { name: 'Texte de la note' });
    await user.click(body);
    act(() => setSelectionOffsets(body, 6));
    await user.keyboard(' le samedi');
    // Not saved yet: the press saves it, then takes it back.
    await user.click(undoButton());
    expect(state().notes[id]!.body).toBe('Marché');
    expect(body.textContent).toBe('Marché');
    await user.click(redoButton());
    expect(body.textContent).toBe('Marché le samedi');
  });

  it('shows the date on a phone-sized window until something is done, then the pair in its place', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(max-width: 719px)', media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }));
    const user = userEvent.setup();
    const id = createNote({ kind: 'text', title: 'Vélo' });
    render(<NoteEditor id={id} onClose={() => {}} />);
    const bar = screen.getByRole('toolbar', { name: 'Actions de la note' });
    expect(within(bar).queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument();
    expect(within(bar).getByText(/^Modifiée/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Épingler' }));
    expect(within(bar).getByRole('button', { name: 'Annuler' })).toBeEnabled();
    expect(within(bar).getByRole('button', { name: 'Rétablir' })).toBeDisabled();
    expect(within(bar).queryByText(/^Modifiée/)).not.toBeInTheDocument();
    await user.click(within(bar).getByRole('button', { name: 'Annuler' }));
    expect(state().notes[id]!.pinned).toBe(false);
    // At the start of the history the pair stays, undo disabled: the bar does not jump.
    expect(within(bar).getByRole('button', { name: 'Annuler' })).toBeDisabled();
  });

  it('leaves a drawing’s bar as it was: its strokes have their own pair', () => {
    const id = createNote({ kind: 'drawing', title: 'Plan' });
    render(<NoteEditor id={id} onClose={() => {}} />);
    const bar = screen.getByRole('toolbar', { name: 'Actions de la note' });
    expect(within(bar).queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument();
  });
});

describe('a colour for several notes', () => {
  beforeEach(async () => {
    await freshLibrary();
    history.replaceState(null, '', '/');
    initHistory();
    setOnboarded();
  });

  it('shows what they share, paints them all, and says when collections kept their own', async () => {
    const user = userEvent.setup();
    const a = createNote({ kind: 'text', title: 'Portail', color: 'yellow' });
    const b = createNote({ kind: 'text', title: 'Recette', color: 'yellow' });
    const films = createLine({ title: 'Films', color: 'blue' });
    setPinned(films, true);
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Sélectionner « Portail »' }));
    await user.click(screen.getByRole('button', { name: 'Sélectionner « Recette »' }));
    const bar = screen.getByRole('toolbar', { name: 'Notes sélectionnées' });
    await user.click(within(bar).getByRole('button', { name: 'Couleur et papier' }));
    expect(screen.getByRole('radio', { name: 'Safran' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Aube' }));
    expect([a, b].map(id => state().notes[id]!.color)).toEqual(['aube', 'aube']);
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Couleur changée', action: { label: 'Annuler' }, tone: 'success' });
    await act(async () => useUiStore.getState().snack!.action!.run());
    expect([a, b].map(id => state().notes[id]!.color)).toEqual(['yellow', 'yellow']);

    // With a collection picked too: the picker says what it takes, none is chosen, and a gradient leaves it as it was.
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Sélectionner « Films »' }));
    await user.click(within(screen.getByRole('toolbar', { name: 'Notes sélectionnées' })).getByRole('button', { name: 'Couleur et papier' }));
    expect(screen.getByText('Les collections ne prennent qu’une couleur, ni dégradé ni papier.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Safran' })).not.toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Lagon' }));
    expect(state().notes[films]!.color).toBe('blue');
    expect(state().notes[a]!.color).toBe('lagon');
    expect(useUiStore.getState().snack?.message).toBe('Couleur changée sur les notes');
  });

  it('gives collections alone their own swatches', async () => {
    const user = userEvent.setup();
    const films = createLine({ title: 'Films', color: 'blue' });
    setPinned(films, true);
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Sélectionner « Films »' }));
    await user.click(within(screen.getByRole('toolbar', { name: 'Notes sélectionnées' })).getByRole('button', { name: 'Couleur' }));
    expect(screen.queryByRole('radio', { name: 'Aube' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Rouge' }));
    expect(state().notes[films]!.color).toBe('red');
    expect(useUiStore.getState().snack?.message).toBe('Couleur changée');
  });
});
