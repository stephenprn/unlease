import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freshLibrary } from '../../test/library';
import { addCheck, createNote, trashNotes } from '../../app/store/actions';
import { acknowledge, getRecord, mergeRemote, useLibraryStore } from '../../app/store/library';
import { formatHlc } from '@unlease/core/sync/hlc';
import { writeFields } from '@unlease/core/sync/record';
import { useUiStore } from '../../app/store/ui';
import { NoteEditor } from '../features/note/NoteEditor';
import { selectionOffsets, setSelectionOffsets } from '../features/note/noteDom';

const state = () => useLibraryStore.getState();

describe('the note editor', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('saves the title and text as they are typed, and on the way out', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'text' });
    const onClose = vi.fn();
    render(<NoteEditor id={id} onClose={onClose} />);
    await user.type(screen.getByRole('textbox', { name: 'Titre' }), 'Idées week-end');
    await user.type(screen.getByRole('textbox', { name: 'Texte de la note' }), 'Marché le samedi');
    await waitFor(() => expect(state().notes[id]).toMatchObject({ title: 'Idées week-end', body: 'Marché le samedi' }));
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getAllByText(/^Modifiée/).length).toBeGreaterThan(0);
  });

  it('says so when a paste is longer than a note can hold', () => {
    const id = createNote({ kind: 'text' });
    render(<NoteEditor id={id} onClose={() => {}} />);
    const body = screen.getByRole('textbox', { name: 'Texte de la note' });
    fireEvent.paste(body, { clipboardData: { getData: () => 'x'.repeat(250_000), files: [], items: [], types: ['text/plain'] } });
    expect(useUiStore.getState().snack?.message).toBe('Texte coupé à 200\u202f000 caractères.');
    expect(body.textContent).toHaveLength(200_000);
    act(() => useUiStore.setState({ snack: null }));
    // Undone, the note has room again.
    fireEvent.keyDown(body, { key: 'z', ctrlKey: true });
    expect(body.textContent).toBe('');
    fireEvent.paste(body, { clipboardData: { getData: () => 'quelques mots', files: [], items: [], types: ['text/plain'] } });
    expect(useUiStore.getState().snack).toBeNull();
    expect(body.textContent).toBe('quelques mots');
  });

  it('archives with E and deletes with # when no field has the focus, with "Annuler"', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'text', title: 'Raccourcis' });
    const onClose = vi.fn();
    render(<NoteEditor id={id} onClose={onClose} />);
    await user.click(screen.getByRole('toolbar', { name: 'Actions de la note' }));
    await user.keyboard('e');
    expect(state().notes[id]!.archived).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('edits a checklist with the keyboard: Enter splits, Backspace removes and merges, a paste adds lines', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'checklist', title: 'Courses' });
    addCheck(id, 'painlait');
    render(<NoteEditor id={id} onClose={() => {}} />);
    const items = () => screen.getAllByRole('textbox', { name: 'Texte de l’élément' }) as HTMLTextAreaElement[];
    const texts = () => (state().checksByNote[id] ?? []).map(cid => state().checks[cid]!.text);

    // Enter in the middle splits the item at the caret, and the caret follows.
    await user.click(items()[0]!);
    items()[0]!.setSelectionRange(4, 4);
    await user.keyboard('{Enter}');
    expect(texts()).toEqual(['pain', 'lait']);
    await waitFor(() => expect(document.activeElement).toBe(items()[1]));

    // Backspace at the start of a full item merges it into the one above.
    items()[1]!.setSelectionRange(0, 0);
    await user.keyboard('{Backspace}');
    expect(texts()).toEqual(['painlait']);

    // A paste of several lines makes several items.
    await user.click(items()[0]!);
    items()[0]!.setSelectionRange(8, 8);
    await user.paste('\nbeurre\nœufs');
    expect(texts()).toEqual(['painlait', 'beurre', 'œufs']);

    // Backspace on an empty item removes it and returns to the one above.
    await user.click(items()[2]!);
    await user.clear(items()[2]!);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 350));
    });
    items()[2]!.setSelectionRange(0, 0);
    await user.keyboard('{Backspace}');
    expect(texts()).toEqual(['painlait', 'beurre']);
    await waitFor(() => expect(document.activeElement).toBe(items()[1]));
  });

  it('checks an item: it moves to the struck-through section at the foot', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'checklist', title: 'Valise' });
    const passport = addCheck(id, 'Passeport');
    render(<NoteEditor id={id} onClose={() => {}} />);
    await user.click(screen.getByRole('checkbox', { name: 'Cocher « Passeport »' }));
    expect(state().checks[passport]!.checked).toBe(true);
    const done = screen.getByRole('list', { name: 'Éléments cochés' });
    expect(within(done).getByText('Passeport')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /élément coché/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('puts labels on a note from the toolbar, creating one that does not exist yet', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'text', title: 'Lisbonne' });
    render(<NoteEditor id={id} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Labels' }));
    const picker = await screen.findByRole('dialog', { name: 'Labels' });
    await user.type(within(picker).getByRole('textbox', { name: 'Chercher ou créer un label' }), 'Voyages');
    await user.click(within(picker).getByRole('button', { name: 'Créer « Voyages »' }));
    const label = state().labelOrder[0]!;
    expect(state().labels[label]!.name).toBe('Voyages');
    expect(state().notes[id]!.labelIds).toEqual([label]);
    const box = within(picker).getByRole('checkbox', { name: 'Voyages' });
    expect(box).toBeChecked();
    await user.click(box);
    expect(state().notes[id]!.labelIds).toEqual([]);
  });

  it('discards a new note left empty', async () => {
    const id = createNote({ kind: 'text' });
    const view = render(<NoteEditor id={id} onClose={() => {}} />);
    view.unmount();
    await waitFor(() => expect(state().notes[id]!.deletedAt).not.toBeNull());
  });
});

describe('typing while another device edits', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('keeps a checklist keystroke that lands between a save and the next render', async () => {
    const id = createNote({ kind: 'checklist', title: 'Courses' });
    const item = addCheck(id, 'pain');
    render(<NoteEditor id={id} onClose={() => {}} />);
    const field = () => screen.getAllByRole('textbox', { name: 'Texte de l’élément' })[0] as HTMLTextAreaElement;
    act(() => void fireEvent.change(field(), { target: { value: 'pain x' } }));
    act(() => void fireEvent.change(field(), { target: { value: 'pain' } }));
    // In the same timers phase as the 300 ms save, before React re-renders.
    await new Promise<void>(resolve =>
      setTimeout(() => {
        const element = field();
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(element, 'pain bio');
        element.dispatchEvent(new Event('input', { bubbles: true }));
        resolve();
      }, 300),
    );
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 700));
    });
    expect(state().checks[item]!.text).toBe('pain bio');
  });

  it('merges an edit that lands from the phone while the body is being typed', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'text', body: 'Lait' });
    acknowledge([getRecord('note', id)!]);
    render(<NoteEditor id={id} onClose={() => {}} />);
    const body = screen.getByRole('textbox', { name: 'Texte de la note' });
    await user.click(body);
    act(() => setSelectionOffsets(body, 4));
    await user.keyboard(' demi-écrémé');
    // Before the save fires, the phone's edit arrives.
    act(() => void mergeRemote([writeFields(getRecord('note', id)!, { body: 'Lait x2' }, formatHlc(Date.now() + 60_000, 0, 'phone1'))]));
    await waitFor(() => expect(state().notes[id]!.body).toBe('Lait x2 demi-écrémé'));
  });
});

describe('an edit from another device in the open editor', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('leaves the caret where it was, moved by what was added before it', async () => {
    const id = createNote({ kind: 'text', body: 'Acheter du pain' });
    acknowledge([getRecord('note', id)!]);
    render(<NoteEditor id={id} onClose={() => {}} />);
    const body = screen.getByRole('textbox', { name: 'Texte de la note' });
    act(() => {
      body.focus();
      setSelectionOffsets(body, 8);
    });
    act(() => void mergeRemote([writeFields(getRecord('note', id)!, { body: 'Ne pas oublier : Acheter du pain et du lait' }, formatHlc(Date.now() + 60_000, 0, 'phone1'))]));
    expect(body.textContent).toBe('Ne pas oublier : Acheter du pain et du lait');
    expect(selectionOffsets(body)?.start).toBe(8 + 'Ne pas oublier : '.length);
  });
});

describe('the editor on a phone (under 720px)', () => {
  beforeEach(async () => {
    await freshLibrary();
    // The phone layout's media query matches; nothing else does.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(max-width: 719px)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('takes the phone’s two bars: back and the toggles on top, what to add and change at the foot with the date', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'text', title: 'Balcon', body: 'Jasmin étoilé' });
    const onClose = vi.fn();
    render(<NoteEditor id={id} onClose={onClose} />);
    const foot = screen.getByRole('toolbar', { name: 'Actions de la note' });
    expect(within(foot).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual(['Ajouter', 'Couleur et papier', 'Labels', 'Plus d’actions']);
    expect(within(foot).getByText(/^Modifiée/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fermer' })).toBeNull();
    // Pin, reminder and archive stand in the top bar, once each.
    await user.click(screen.getByRole('button', { name: 'Épingler' }));
    expect(state().notes[id]!.pinned).toBe(true);
    expect(screen.getByRole('button', { name: 'Rappel' })).toHaveAttribute('aria-haspopup', 'dialog');
    expect(within(foot).queryByRole('button', { name: 'Archiver' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retour' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the date and "Supprimer définitivement" at the foot of a note in the bin, and no toggles on top', () => {
    const id = createNote({ kind: 'text', title: 'Brouillon', body: 'Madame, Monsieur' });
    trashNotes([id]);
    render(<NoteEditor id={id} onClose={() => {}} />);
    const foot = screen.getByRole('toolbar', { name: 'Actions de la note' });
    expect(within(foot).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual(['Supprimer définitivement']);
    expect(within(foot).getByText(/^Modifiée/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Épingler' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archiver' })).toBeNull();
  });

  it('leaves looking as it was when it is binned or deleted for good', async () => {
    const user = userEvent.setup();
    const binned = createNote({ kind: 'text', title: 'Facture', body: 'À payer' });
    const { unmount } = render(<NoteEditor id={binned} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await user.click(await screen.findByRole('menuitem', { name: /Supprimer/ }));
    expect(state().notes[binned]!.trashedAt).not.toBeNull();
    expect(screen.queryByText('Une note dans la corbeille ne peut pas être modifiée.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Archiver' })).toBeInTheDocument();
    unmount();

    const gone = createNote({ kind: 'text', title: 'Brouillon', body: 'Madame, Monsieur' });
    trashNotes([gone]);
    render(<NoteEditor id={gone} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Supprimer définitivement' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }));
    expect(useUiStore.getState().snack?.message).toBe('Note supprimée définitivement');
    expect(screen.queryByText('Cette note n’existe plus.')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Texte de la note' })).toHaveTextContent('Madame, Monsieur');
  });

  it('turns the lines into checkboxes from "Ajouter", as the phone does', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'text', title: 'Courses', body: 'pain\nlait' });
    render(<NoteEditor id={id} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    const sheet = await screen.findByRole('dialog', { name: 'Ajouter' });
    expect(within(sheet).getByRole('button', { name: 'Ajouter une image' })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: /^Cases à cocher/ }));
    expect(state().notes[id]!.kind).toBe('checklist');
    expect((state().checksByNote[id] ?? []).map(cid => state().checks[cid]!.text)).toEqual(['pain', 'lait']);
  });

  it('sets a reminder with the phone’s day and time chips', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'text', title: 'Garage' });
    render(<NoteEditor id={id} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Rappel' }));
    const picker = await screen.findByRole('dialog', { name: 'Rappel' });
    await user.click(within(picker).getByRole('button', { name: 'Choisir la date et l’heure' }));
    await user.click(within(picker).getByRole('radio', { name: /^Demain/ }));
    await user.click(within(picker).getByRole('radio', { name: '9 h' }));
    await user.click(within(picker).getByRole('radio', { name: '30 min' }));
    await user.click(within(picker).getByRole('button', { name: 'Enregistrer' }));
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 30, 0, 0);
    expect(state().notes[id]!.reminderAt).toBe(tomorrow.getTime());
  });
});
