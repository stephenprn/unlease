/** Moving in from Keep in the browser: what the person sees, is asked, and reads at the end. */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';

import { freshLibrary } from '@test/library';
import { useLibraryStore } from '../../app/store/library';
import { setServer } from '@shared/app/store/settings';
import { KeepImport } from '../features/settings/KeepImport';

const keep = (created: number, over: Record<string, unknown>): string =>
  JSON.stringify({ color: 'DEFAULT', isTrashed: false, isPinned: false, isArchived: false, textContent: '', title: '', userEditedTimestampUsec: 1_700_000_000_000_000, createdTimestampUsec: created, ...over });

function takeout(): File {
  const zip = zipSync({
    'Takeout/Keep/Films.json': strToU8(keep(1_690_000_000_001_000, { title: 'Films', textContent: 'Dune https://www.exemple.fr/dune\nhttps://www.exemple.fr/alien' })),
    'Takeout/Keep/Cadeaux.json': strToU8(keep(1_690_000_000_002_000, { title: 'Cadeaux', listContent: [{ text: 'https://www.exemple.fr/lampe', isChecked: true }, { text: 'Livre https://www.exemple.fr/livre', isChecked: false }] })),
    'Takeout/Keep/Idée.json': strToU8(keep(1_690_000_000_003_000, { title: 'Idée', textContent: 'Un vélo', attachments: [{ filePath: 'memo.3gp', mimetype: 'audio/3gpp' }] })),
    'Takeout/Keep/Jeté.json': strToU8(keep(1_690_000_000_004_000, { title: 'Jeté', isTrashed: true })),
  });
  return new File([zip], 'takeout-20261102.zip', { type: 'application/zip' });
}

describe('the Keep import', () => {
  beforeEach(async () => {
    await freshLibrary();
    setServer({ url: 'https://carnet.test', token: 'jeton' });
  });

  it('asks once what the notes made of links become, note by note if wanted, and sums up', async () => {
    const user = userEvent.setup();
    const { container } = render(<KeepImport />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, takeout());

    await screen.findByText('Dans cette archive');
    expect(screen.getByText(/^2\snotes faites de liens$/)).toBeInTheDocument();
    // One switch for them all, on: every list becomes a collection.
    const all = screen.getByRole('switch', { name: 'En faire des collections' });
    expect(all).toHaveAttribute('aria-checked', 'true');
    // Or one by one: keep « Cadeaux » a note.
    await user.click(screen.getByRole('button', { name: 'Choisir une par une' }));
    const choices = screen.getByRole('list', { name: 'Notes faites de liens' });
    expect(within(choices).getAllByText(/^Collection de 2\sliens$/)).toHaveLength(2);
    await user.click(within(choices).getByRole('checkbox', { name: 'Cadeaux en collection' }));
    expect(within(choices).getByText('Note gardée telle quelle')).toBeInTheDocument();
    expect(all).toHaveAttribute('aria-checked', 'false');

    await user.click(screen.getByRole('button', { name: 'Importer' }));
    await screen.findByText('Import terminé');
    expect(screen.getByText(/^2\snotes importées, dont 1\sliste$/)).toBeInTheDocument();
    expect(screen.getByText(/^1\scollection créée$/)).toBeInTheDocument();
    expect(screen.getByText(/^2\sliens ajoutés$/)).toBeInTheDocument();
    expect(screen.getByText('Laissé de côté')).toBeInTheDocument();
    expect(screen.getByText(/^1\snote de la corbeille de Keep$/)).toBeInTheDocument();
    expect(screen.getByText(/^1\senregistrement vocal : seul le texte transcrit est importé$/)).toBeInTheDocument();

    const notes = Object.values(useLibraryStore.getState().notes);
    expect(notes.find(note => note.title === 'Films')?.kind).toBe('links');
    expect(notes.find(note => note.title === 'Cadeaux')?.kind).toBe('checklist');

    // The same archive again: nothing doubled, and it says so first.
    await user.click(screen.getByRole('button', { name: 'Importer une autre archive' }));
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, takeout());
    await screen.findByText(/^3\snotes déjà importées : ignorées, rien ne sera doublé$/);
    await user.click(screen.getByRole('button', { name: 'Importer' }));
    await waitFor(() => expect(screen.getByText('Rien de nouveau dans cette archive.')).toBeInTheDocument());
    expect(Object.values(useLibraryStore.getState().notes).filter(note => note.title === 'Films')).toHaveLength(1);
  });
});
