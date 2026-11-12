/** Moving in from Keep in the browser: the wizard's four steps, what the person sees, is asked, and reads at the end. */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { strToU8, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';

import { comparePositions } from '@unlease/core/services/fractionalIndex';

import { freshLibrary } from '@test/library';
import { useLibraryStore } from '../../app/store/library';
import { setServer } from '@shared/app/store/settings';
import { KeepWizard } from '../features/importing/KeepWizard';

const keep = (created: number, over: Record<string, unknown>): string =>
  JSON.stringify({ color: 'DEFAULT', isTrashed: false, isPinned: false, isArchived: false, textContent: '', title: '', userEditedTimestampUsec: 1_700_000_000_000_000, createdTimestampUsec: created, ...over });

function takeout(): File {
  const zip = zipSync({
    // Two addresses and a heading: mostly links, its heading a line to choose for.
    'Takeout/Keep/Films.json': strToU8(keep(1_690_000_000_001_000, { title: 'Films', textContent: 'À voir\nDune https://www.exemple.fr/dune\nhttps://www.exemple.fr/alien' })),
    'Takeout/Keep/Cadeaux.json': strToU8(keep(1_690_000_000_002_000, { title: 'Cadeaux', listContent: [{ text: 'https://www.exemple.fr/lampe', isChecked: true }, { text: 'Livre https://www.exemple.fr/livre', isChecked: false }] })),
    'Takeout/Keep/Idée.json': strToU8(keep(1_690_000_000_003_000, { title: 'Idée', textContent: 'Un vélo', attachments: [{ filePath: 'memo.3gp', mimetype: 'audio/3gpp' }] })),
    'Takeout/Keep/Vieux.json': strToU8(keep(1_690_000_000_005_000, { title: 'Vieux', textContent: 'Rangé', isArchived: true })),
    'Takeout/Keep/Jeté.json': strToU8(keep(1_690_000_000_004_000, { title: 'Jeté', isTrashed: true, textContent: 'x' })),
  });
  return new File([zip], 'takeout-20261102.zip', { type: 'application/zip' });
}

const words = (text: string): RegExp => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s')}$`);

describe('the Keep import', () => {
  beforeEach(async () => {
    await freshLibrary();
    setServer({ url: 'https://carnet.test', token: 'jeton' });
  });

  it('reads the archive, shows every note, asks what the links become, and sums up', async () => {
    const user = userEvent.setup();
    const flow: boolean[] = [];
    let imported = 0;
    const { container } = render(<KeepWizard onFlow={inFlow => flow.push(inFlow)} onImported={() => (imported += 1)} />);
    expect(screen.getByRole('heading', { name: 'Depuis Google Keep' })).toBeInTheDocument();
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, takeout());

    // The preview: counted, then every note with what it becomes, the bin's too.
    await screen.findByRole('heading', { name: 'Ce que contient le fichier' });
    expect(flow).toEqual([true]);
    expect(screen.getByText(words('4 notes'))).toBeInTheDocument();
    expect(screen.getByText(words('2 notes faites de liens'))).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Notes de l’archive' });
    expect(within(list).getAllByText(words('Devient une collection de 2 liens'))).toHaveLength(2);
    expect(within(list).getByText('Dans la corbeille de Keep')).toBeInTheDocument();
    // « Idée » left out by its box.
    await user.click(within(list).getByRole('checkbox', { name: 'Importer Idée' }));
    await user.click(screen.getByRole('button', { name: 'Continuer' }));

    // The choices: the lists as collections, the heading of « Films » made a link, the archive on the board.
    await screen.findByRole('heading', { name: 'Vos choix' });
    expect(screen.getByRole('switch', { name: /2\snotes faites de liens/ })).toHaveAttribute('aria-checked', 'true');
    const line = screen.getByRole('radiogroup', { name: 'Que devient « À voir » ?' });
    expect(within(line).getByRole('radio', { name: 'Joindre' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Ajoutée au commentaire du premier lien, « Dune ».')).toBeInTheDocument();
    await user.click(within(line).getByRole('radio', { name: 'Lien' }));
    await user.click(screen.getByRole('radio', { name: /Sur le tableau/ }));

    // An address missing: said under its field when « Importer » is pressed, nothing written.
    await user.click(screen.getByRole('button', { name: /Importer 3\snotes/ }));
    expect(await screen.findByText('Saisissez l’adresse du lien.')).toBeInTheDocument();
    expect(screen.getByText('Un champ est à corriger.')).toBeInTheDocument();
    expect(Object.values(useLibraryStore.getState().notes).some(note => note.title === 'Films')).toBe(false);
    await user.type(screen.getByLabelText('Adresse du lien'), 'exemple.fr/a-voir');
    await user.click(screen.getByRole('button', { name: /Importer 3\snotes/ }));

    // The report.
    await screen.findByRole('heading', { name: 'Vos notes Keep sont arrivées' });
    expect(screen.getByText(words('2 collections créées'))).toBeInTheDocument();
    expect(screen.getByText(words('5 liens ajoutés'))).toBeInTheDocument();
    expect(screen.getByText(words('1 ligne sans lien remplacée par un lien'))).toBeInTheDocument();
    expect(screen.getByText(words('1 note décochée dans l’aperçu'))).toBeInTheDocument();
    expect(screen.getByText(words('1 note de la corbeille de Keep'))).toBeInTheDocument();
    expect(imported).toBe(1);
    expect(flow).toEqual([true, false]);

    const state = useLibraryStore.getState();
    const notes = Object.values(state.notes);
    const films = notes.find(note => note.title === 'Films')!;
    expect(films.kind).toBe('links');
    const links = (state.linksByNote[films.id] ?? []).map(id => state.links[id]!).sort(comparePositions);
    expect(links.map(link => [link.url, link.comment])).toEqual([
      ['https://exemple.fr/a-voir', 'À voir'],
      ['https://www.exemple.fr/dune', 'Dune'],
      ['https://www.exemple.fr/alien', ''],
    ]);
    expect(notes.find(note => note.title === 'Vieux')?.archived).toBe(false);
    expect(notes.some(note => note.title === 'Idée')).toBe(false);

    // The same archive again: here already, nothing doubled.
    await user.click(screen.getByRole('button', { name: 'Importer un autre fichier' }));
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, takeout());
    await screen.findByRole('heading', { name: 'Ce que contient le fichier' });
    expect(screen.getAllByText('Déjà importée : rien ne sera doublé')).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    await user.click(await screen.findByRole('button', { name: /Importer 1\snote/ }));
    await waitFor(() => expect(screen.getByText(words('1 note importée'))).toBeInTheDocument());
    expect(Object.values(useLibraryStore.getState().notes).filter(note => note.title === 'Films')).toHaveLength(1);
  });

  it('refuses what is not a Takeout archive, under the drop zone', async () => {
    const user = userEvent.setup();
    const { container } = render(<KeepWizard />);
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File([new Uint8Array([1, 2, 3])], 'notes.zip', { type: 'application/zip' }));
    expect(await screen.findByText('Archive illisible : choisissez le fichier .zip téléchargé depuis Google Takeout.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Depuis Google Keep' })).toBeInTheDocument();
  });
});
