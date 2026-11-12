/** « Transformer en collection » from the note's ⋯ menu, and « Effacer des données »'s batch: as the person meets them. */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { comparePositions } from '@unlease/core/services/fractionalIndex';
import { INBOX_ID } from '@unlease/notes/models/entities';
import { eraseParts } from '@unlease/notes/services/erase';

import { freshLibrary } from '@test/library';
import { addCheck, addLink, convertToCollection, createLabel, createLine, createNote, ensureInbox, eraseData, setLabels, toggleCheck } from '../../app/store/actions';
import { useLibraryStore } from '../../app/store/library';
import { useUiStore } from '@shared/app/store/ui';
import { NoteEditor } from '../features/note/NoteEditor';

const state = () => useLibraryStore.getState();
const linksOf = (noteId: string) => (state().linksByNote[noteId] ?? []).map(id => state().links[id]!).sort(comparePositions);

describe('« Transformer en collection »', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('makes a checklist of links a collection, sends the note to the bin, and takes it back', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'checklist', title: 'Cadeaux', color: 'green' });
    addCheck(id, 'Lampe https://example.org/lampe');
    addCheck(id, 'https://example.org/livre');
    toggleCheck(state().checksByNote[id]![0]!);
    render(<NoteEditor id={id} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Transformer en collection' }));

    const collection = Object.values(state().notes).find(note => note.kind === 'links' && note.title === 'Cadeaux')!;
    expect(collection).toMatchObject({ color: 'green', trashedAt: null });
    expect(linksOf(collection.id).map(link => [link.url, link.comment, link.done, link.filedBy])).toEqual([
      ['https://example.org/lampe', 'Lampe', true, 'person'],
      ['https://example.org/livre', '', false, 'person'],
    ]);
    expect(state().notes[id]!.trashedAt).not.toBeNull();
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Collection « Cadeaux » créée : 2 liens', action: { label: 'Annuler' }, tone: 'success' });

    act(() => useUiStore.getState().snack!.action!.run());
    expect(state().notes[collection.id]!.deletedAt).not.toBeNull();
    expect(linksOf(collection.id)).toEqual([]);
    expect(state().notes[id]!.trashedAt).toBeNull();
  });

  it('refuses a list with lines that are not links, in a dialog naming them', async () => {
    const user = userEvent.setup();
    const id = createNote({ kind: 'text', title: 'Courses', body: 'https://example.org/pain\ndu lait\ndes œufs' });
    render(<NoteEditor id={id} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Transformer en collection' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Certaines lignes ne sont pas des liens' });
    expect(within(dialog).getByText('du lait')).toBeInTheDocument();
    expect(within(dialog).getByText('des œufs')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(state().notes[id]).toMatchObject({ kind: 'text', trashedAt: null });
    expect(Object.values(state().notes).filter(note => note.kind === 'links' && note.id !== INBOX_ID)).toHaveLength(0);
  });

  it('makes nothing of a list with nothing in it', () => {
    const id = createNote({ kind: 'checklist' });
    expect(convertToCollection(id)).toEqual({ status: 'empty' });
  });
});

describe('« Effacer des données »', () => {
  beforeEach(async () => {
    await freshLibrary();
    ensureInbox();
  });

  it('erases the parts chosen in one batch, « Non classé » kept', () => {
    const note = createNote({ kind: 'text', title: 'Idée' });
    const label = createLabel('perso');
    setLabels(note, [label]);
    const films = createLine({ title: 'Films' });
    addLink('https://example.org/dune', { noteId: films });
    addLink('https://example.org/inbox');
    const parts = eraseParts(state());
    expect(parts.find(part => part.id === 'collections')!.count).toBe(2);
    expect(parts.find(part => part.id === 'inbox')!.count).toBe(1);

    expect(eraseData(new Set(['collections', 'inbox', 'labels']))).toBe(4);
    expect(state().notes[films]!.deletedAt).not.toBeNull();
    expect(Object.values(state().links).every(link => link.deletedAt !== null)).toBe(true);
    expect(state().labels[label]!.deletedAt).not.toBeNull();
    // The note stays, its label taken off; « Non classé » stays.
    expect(state().notes[note]).toMatchObject({ deletedAt: null, labelIds: [] });
    expect(state().notes[INBOX_ID]!.deletedAt).toBeNull();
    expect(eraseParts(state()).find(part => part.id === 'notes')!.count).toBe(1);
  });
});
