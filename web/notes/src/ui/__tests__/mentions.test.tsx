import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bodyText } from '@unlease/notes/services/noteBody';

import { freshLibrary } from '@test/library';
import { draftOf, emptyDraft } from '@contacts/app/drafts';
import { deleteForever, saveContact } from '@contacts/app/store/actions';
import { useContactsStore } from '@contacts/app/store/library';
import { createNote, updateNote } from '../../app/store/actions';
import { useLibraryStore } from '../../app/store/library';
import { setOnboarded } from '@shared/app/store/settings';
import { App } from '@shared/ui/App';
import { initHistory } from '@shared/ui/router';
import { NoteEditor } from '../features/note/NoteEditor';
import { setSelectionOffsets } from '../features/note/noteDom';

const state = () => useLibraryStore.getState();
const chip = (root: ParentNode): HTMLElement => root.querySelector<HTMLElement>('[data-mention]')!;

function lea(): string {
  return saveContact(null, { ...emptyDraft('Léa Martin'), company: 'Atelier Nord' }, { since: null, typed: '' });
}

function rename(id: string, firstName: string): void {
  act(() => {
    saveContact(id, { ...draftOf(useContactsStore.getState().contacts[id]!), firstName }, { since: '', typed: '' });
  });
}

beforeEach(async () => {
  await freshLibrary();
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true });
});

describe('a person mentioned in a note', () => {
  it('is offered by « @ », and the one picked becomes a mention that makes the note formatted', async () => {
    const user = userEvent.setup();
    const id = lea();
    saveContact(null, emptyDraft('Paul Durand'), { since: null, typed: '' });
    const note = createNote({ kind: 'text', title: 'Gâteau', body: 'Demander à' });
    render(<NoteEditor id={note} onClose={() => {}} />);
    const body = screen.getByRole('textbox', { name: 'Texte de la note' });
    await user.click(body);
    act(() => setSelectionOffsets(body, 10));
    await user.keyboard(' @Lé');
    const list = await screen.findByRole('listbox', { name: 'Contacts et événements' });
    expect(within(list).getAllByRole('option').map(option => option.textContent)).toEqual(['Léa MartinAtelier Nord']);
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('listbox', { name: 'Contacts et événements' })).toBeNull();
    await waitFor(() => expect(state().notes[note]).toMatchObject({ rich: true, body: `Demander à {@contact=${id}} ` }));
    // One character in the text, the person's name on screen.
    expect(chip(body).dataset.name).toBe('Léa Martin');
    expect(chip(body).textContent).toHaveLength(1);
    expect(bodyText(state().notes[note]!)).toBe('Demander à Léa Martin ');
    // Typing goes on after it.
    await user.keyboard('ce soir');
    await waitFor(() => expect(state().notes[note]!.body).toBe(`Demander à {@contact=${id}} ce soir`));
    // A copy keeps the person: their name for anywhere, the mention for a note or a page.
    const data = new Map<string, string>();
    const copy = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(copy, 'clipboardData', { value: { setData: (type: string, value: string) => data.set(type, value) } });
    act(() => setSelectionOffsets(body, 11, 20));
    act(() => {
      body.dispatchEvent(copy);
    });
    expect(data.get('text/plain')).toBe('Léa Martin ce soir');
    expect(data.get('text/html')).toContain(`data-mention="contact:${id}"`);
    // Ctrl+Z takes the mention back to the « @ » typed.
    act(() => setSelectionOffsets(body, 20));
    await user.keyboard('{Control>}z{/Control}');
    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(state().notes[note]!.body).toContain('@Lé'));
  });

  it('shows the name the person has now, and « Contact supprimé » once gone', () => {
    const id = lea();
    const note = createNote({ kind: 'text', title: 'Gâteau' });
    updateNote(note, { body: `Demander à {@contact=${id}}`, rich: true });
    render(<NoteEditor id={note} onClose={() => {}} />);
    const body = screen.getByRole('textbox', { name: 'Texte de la note' });
    expect(chip(body).dataset.name).toBe('Léa Martin');
    rename(id, 'Léonie');
    expect(chip(body).dataset.name).toBe('Léonie Martin');
    act(() => deleteForever([id]));
    expect(chip(body).dataset.name).toBe('Contact supprimé');
    expect(chip(body)).toHaveAttribute('data-gone');
  });

  it('opens the person in Contacts when pressed', async () => {
    const id = lea();
    const note = createNote({ kind: 'text', title: 'Gâteau' });
    updateNote(note, { body: `Voir {@contact=${id}}`, rich: true });
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<NoteEditor id={note} onClose={() => {}} />);
    await userEvent.setup().click(chip(screen.getByRole('textbox', { name: 'Texte de la note' })));
    expect(opened).toHaveBeenCalledWith(`/contacts/contact/${id}`, '_blank', 'noopener');
    opened.mockRestore();
  });

  it('reads as the name on its card and in the search, and a rename shows there too', async () => {
    const user = userEvent.setup();
    const id = lea();
    const note = createNote({ kind: 'text', title: 'Gâteau' });
    updateNote(note, { body: `Demander à {@contact=${id}} pour samedi`, rich: true });
    setOnboarded();
    history.replaceState(null, '', '/notes');
    initHistory();
    render(<App />);
    const card = (): HTMLElement => document.querySelector<HTMLElement>(`[data-note-id="${note}"] p`)!;
    expect(card().textContent).toBe('Demander à Léa Martin pour samedi');
    rename(id, 'Léonie');
    expect(card().textContent).toBe('Demander à Léonie Martin pour samedi');
    await user.type(screen.getByRole('searchbox', { name: 'Rechercher' }), 'Léonie');
    await waitFor(() => expect(document.querySelector(`[data-note-id="${note}"]`)).not.toBeNull());
  });
});
