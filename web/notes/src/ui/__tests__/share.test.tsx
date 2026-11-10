import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { INBOX_ID } from '@unlease/notes/models/entities';

import { freshLibrary } from '@test/library';
import { useLibraryStore } from '../../app/store/library';
import { setServer } from '@shared/app/store/settings';
import { useNotesUiStore } from '../../app/store/notesUi';
import { handleCaptureRoute } from '../captureRoute';
import { CaptureDialog } from '../features/capture/CaptureDialog';

const links = () => Object.values(useLibraryStore.getState().links);
const noteIds = () => Object.keys(useLibraryStore.getState().notes);

/** The installed app's share target, as any page can open it. */
function arrive(params: Record<string, string>): void {
  history.replaceState(null, '', `/notes/capture/share?${new URLSearchParams(params)}`);
  handleCaptureRoute();
}

describe('a share arriving at its address', () => {
  beforeEach(async () => {
    await freshLibrary();
    history.replaceState(null, '', '/');
    setServer({ url: 'https://carnet.test', token: 'jeton' });
  });

  it('opens the capture dialog on its link and saves nothing until the person files it', async () => {
    const user = userEvent.setup();
    arrive({ title: 'Veste en laine', url: 'https://www.exemple.fr/veste?utm_source=x' });
    expect(links()).toEqual([]);
    expect(location.pathname).not.toContain('capture');
    render(<CaptureDialog />);
    expect(screen.getByRole('textbox', { name: 'Adresse du lien' })).toHaveValue('https://www.exemple.fr/veste?utm_source=x');
    expect(links()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Classer' }));
    expect(links()).toHaveLength(1);
    expect(links()[0]).toMatchObject({ url: 'https://www.exemple.fr/veste', title: 'Veste en laine', autoFile: true, noteId: INBOX_ID });
  });

  it('saves nothing when the person closes the dialog', async () => {
    const user = userEvent.setup();
    arrive({ text: 'https://www.exemple.fr/a https://www.exemple.fr/b' });
    render(<CaptureDialog />);
    await user.keyboard('{Escape}');
    expect(useNotesUiStore.getState().captureOpen).toBe(false);
    expect(links()).toEqual([]);
  });

  it('keeps the first twenty links of a share offering more, and says so before', async () => {
    const user = userEvent.setup();
    arrive({ text: Array.from({ length: 25 }, (_, index) => `https://www.exemple.fr/${index}`).join(' ') });
    render(<CaptureDialog />);
    expect(screen.getByText('Seuls les 20 premiers des 25 liens seront gardés.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Classer' }));
    expect(links().map(link => link.url).sort()).toEqual(Array.from({ length: 20 }, (_, index) => `https://www.exemple.fr/${index}`).sort());
  });

  it('asks before making text without a link a note', async () => {
    const user = userEvent.setup();
    const before = noteIds();
    arrive({ title: 'Courses', text: 'Acheter du pain' });
    render(<CaptureDialog />);
    const question = screen.getByRole('alertdialog', { name: 'Garder ce partage en note ?' });
    expect(within(question).getByText('Courses — Acheter du pain')).toBeInTheDocument();
    expect(noteIds()).toEqual(before);
    await user.click(within(question).getByRole('button', { name: 'Annuler' }));
    expect(noteIds()).toEqual(before);

    arrive({ title: 'Courses', text: 'Acheter du pain' });
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Garder ce partage en note ?' })).getByRole('button', { name: 'Créer la note' }));
    const created = noteIds().filter(id => !before.includes(id));
    expect(created).toHaveLength(1);
    expect(useLibraryStore.getState().notes[created[0]!]).toMatchObject({ kind: 'text', title: 'Courses', body: 'Acheter du pain' });
  });
});
