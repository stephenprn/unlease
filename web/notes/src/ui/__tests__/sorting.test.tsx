import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INBOX_ID } from '@unlease/notes/models/entities';
import type { SortMove, SortRequest } from '@unlease/notes/sync/sorting';

import { freshLibrary } from '../../test/library';
import { addLink, createLine, createNote, moveLink, updateLink } from '../../app/store/actions';
import { toggleSelected } from '../../app/store/board';
import { useLibraryStore } from '../../app/store/library';
import { setOnboarded, setServer } from '../../app/store/settings';
import { useUiStore } from '../../app/store/ui';
import { stopSync } from '../../app/sync/loop';
import { App } from '../App';
import { NewLineDialog } from '../features/lines/LineDialogs';
import { initHistory } from '../router';
import { LineScreen } from '../screens/LineScreen';

const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const state = () => useLibraryStore.getState();
const snack = () => useUiStore.getState().snack;

/** `POST /api/sort` answered by `answer`, every request kept. */
function sortServer(answer: (request: SortRequest) => { moves: SortMove[] } | Response) {
  const requests: SortRequest[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (!url.endsWith('/api/sort')) return json({}, 404);
      const request = JSON.parse(String(init?.body)) as SortRequest;
      requests.push(request);
      const reply = answer(request);
      return reply instanceof Response ? reply : json(reply);
    }),
  );
  return requests;
}

function readLink(name: string, noteId: string): string {
  const id = addLink(`https://www.exemple.fr/${name}`, { noteId });
  updateLink(id, { status: 'ready', title: name });
  return id;
}

let mode: string;
let films: string;
let veste: string;
let tarte: string;

beforeEach(async () => {
  await freshLibrary();
  setServer({ url: 'https://carnet.test', token: 'jeton' });
  films = createLine({ id: 'line-films', title: 'Films', hint: 'Films à voir' });
  mode = createLine({ id: 'line-mode', title: 'Mode', hint: 'Vêtements à acheter.' });
  veste = readLink('veste', mode);
  tarte = readLink('tarte', mode);
});

afterEach(() => {
  stopSync();
  vi.unstubAllGlobals();
});

async function openMenu(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
}

describe('deleting a collection that holds links', () => {
  it('asks where they go; "Non classé" keeps them, and one "Annuler" brings all back', async () => {
    const user = userEvent.setup();
    render(<LineScreen id={mode} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Supprimer la collection' }));
    const dialog = screen.getByRole('dialog', { name: 'Supprimer Mode' });
    expect(within(dialog).getByText(/^Elle contient 2\sliens\. Où les mettre \?$/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Les mettre dans Non classé' }));

    expect(state().notes[mode]!.trashedAt).not.toBeNull();
    expect(state().links[veste]).toMatchObject({ noteId: INBOX_ID, filedBy: null });
    expect(snack()).toMatchObject({ message: 'Collection supprimée : 2 liens déplacés dans Non classé', action: { label: 'Annuler' } });
    snack()!.action!.run();
    expect(state().notes[mode]!.trashedAt).toBeNull();
    expect(state().links[veste]).toMatchObject({ noteId: mode, filedBy: 'person' });
  });

  it('lets Claude sort them into the collections left, the rest waiting in "Non classé"', async () => {
    const user = userEvent.setup();
    const requests = sortServer(() => ({ moves: [{ link: tarte, to: films }] }));
    render(<LineScreen id={mode} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Supprimer la collection' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Supprimer Mode' })).getByRole('button', { name: /^Les ranger avec Claude/ }));

    await waitFor(() => expect(snack()?.message).toBe('Collection supprimée : 1 lien rangé dans Films, 1 dans Non classé'));
    expect(requests[0]).toMatchObject({ task: 'file', from: null });
    expect(requests[0]!.targets.map(target => target.id)).toEqual([films]);
    expect(state().links[tarte]).toMatchObject({ noteId: films, filedBy: 'claude' });
    expect(state().links[veste]!.noteId).toBe(INBOX_ID);
  });

  it('bins an empty collection at once, as before', async () => {
    const user = userEvent.setup();
    const empty = createLine({ title: 'Vide' });
    render(<LineScreen id={empty} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Supprimer la collection' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(snack()?.message).toBe('Collection placée dans la corbeille');
  });
});

describe('deleting a selection on the board', () => {
  it('asks where the links of its collections go, and bins the plain notes with them', async () => {
    const user = userEvent.setup();
    sortServer(() => ({ moves: [] }));
    setOnboarded();
    const note = createNote({ kind: 'text', title: 'Idée' });
    history.replaceState(null, '', '/');
    initHistory();
    render(<App />);
    act(() => {
      toggleSelected(mode);
      toggleSelected(note);
    });
    await user.click(within(screen.getByRole('toolbar', { name: 'Notes sélectionnées' })).getByRole('button', { name: 'Supprimer' }));
    const dialog = screen.getByRole('dialog', { name: 'Supprimer Mode' });
    expect(within(dialog).getByText(/^Elle contient 2\sliens\. Où les mettre \?$/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Les mettre dans Non classé' }));

    expect(state().notes[mode]!.trashedAt).not.toBeNull();
    expect(state().notes[note]!.trashedAt).not.toBeNull();
    expect(state().links[veste]!.noteId).toBe(INBOX_ID);
    expect(snack()).toMatchObject({ message: 'Notes supprimées : 2\u00a0liens déplacés dans Non classé', action: { label: 'Annuler' } });
  });
});

describe('deleting with the keyboard, or with "Non classé" in the selection', () => {
  beforeEach(() => {
    setOnboarded();
    history.replaceState(null, '', '/');
    initHistory();
  });

  it('asks where the links go when "#" deletes a collection holding some', async () => {
    const user = userEvent.setup();
    sortServer(() => ({ moves: [] }));
    render(<App />);
    act(() => toggleSelected(mode));
    await user.keyboard('#');
    expect(screen.getByRole('dialog', { name: 'Supprimer Mode' })).toBeInTheDocument();
    expect(state().notes[mode]!.trashedAt).toBeNull();
  });

  it('never asks about, nor sorts, the links of a pinned "Non classé" picked with a collection', async () => {
    const user = userEvent.setup();
    const pull = readLink('pull', INBOX_ID);
    const requests = sortServer(() => ({ moves: [] }));
    render(<App />);
    act(() => {
      toggleSelected(INBOX_ID);
      toggleSelected(mode);
    });
    await user.click(within(screen.getByRole('toolbar', { name: 'Notes sélectionnées' })).getByRole('button', { name: 'Supprimer' }));
    const dialog = screen.getByRole('dialog', { name: 'Supprimer Mode' });
    expect(within(dialog).getByText(/^Elle contient 2\sliens\. Où les mettre \?$/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /^Les ranger avec Claude/ }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]!.links.map(link => link.id).sort()).toEqual([tarte, veste].sort());
    expect(state().notes[INBOX_ID]!.trashedAt).toBeNull();
    expect(state().links[pull]!.noteId).toBe(INBOX_ID);
  });
});

describe('checking a collection’s links', () => {
  it('lists Claude’s suggestions and moves the ones left ticked, as the person’s choice', async () => {
    const user = userEvent.setup();
    const requests = sortServer(() => ({ moves: [{ link: tarte, to: INBOX_ID }, { link: veste, to: films }] }));
    render(<LineScreen id={mode} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Vérifier les liens' }));
    const dialog = screen.getByRole('dialog', { name: 'Vérifier les liens' });

    const tarteRow = await within(dialog).findByRole('checkbox', { name: 'tarte, vers Non classé' });
    expect(requests[0]).toMatchObject({ task: 'review', from: mode });
    expect(requests[0]!.targets.find(target => target.id === mode)!.examples).toEqual([]);
    await user.click(within(dialog).getByRole('checkbox', { name: 'veste, vers Films' }));
    expect(tarteRow).toHaveAttribute('aria-checked', 'true');
    await user.click(within(dialog).getByRole('button', { name: /^Déplacer 1\slien$/ }));

    expect(state().links[tarte]).toMatchObject({ noteId: INBOX_ID, filedBy: 'person' });
    expect(state().links[veste]!.noteId).toBe(mode);
    expect(snack()).toMatchObject({ message: '1 lien déplacé', action: { label: 'Annuler' } });
  });

  it('says why when Claude could not answer', async () => {
    const user = userEvent.setup();
    sortServer(() => json({ error: 'Budget mensuel atteint' }, 409));
    render(<LineScreen id={mode} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Vérifier les liens' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Claude n’a pas pu relire la collection : Budget mensuel atteint');
  });

  it('offers the check after a rename that is more than a typo', async () => {
    const user = userEvent.setup();
    render(<LineScreen id={mode} />);
    await user.click(screen.getByRole('button', { name: 'Modifier la collection' }));
    const name = within(screen.getByRole('dialog', { name: 'Modifier la collection' })).getByRole('textbox', { name: 'Nom' });
    await user.clear(name);
    await user.type(name, 'Cuisine');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(snack()).toMatchObject({ message: 'Collection modifiée', action: { label: 'Vérifier les liens' } });
  });
});

describe('sorting "Non classé"', () => {
  it('files what nobody put there by hand, with "Annuler"', async () => {
    const user = userEvent.setup();
    const pull = readLink('pull', INBOX_ID);
    const mine = readLink('mine', INBOX_ID);
    moveLink(mine, mode);
    moveLink(mine, INBOX_ID);
    const requests = sortServer(() => ({ moves: [{ link: pull, to: mode }] }));
    render(<LineScreen id={INBOX_ID} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Ranger Non classé' }));

    await waitFor(() => expect(snack()?.message).toBe('1 lien rangé dans Mode'));
    expect(requests[0]!.links.map(link => link.id)).toEqual([pull]);
    expect(state().links[pull]).toMatchObject({ noteId: mode, filedBy: 'claude' });
    snack()!.action!.run();
    expect(state().links[pull]!.noteId).toBe(INBOX_ID);
  });
});

describe('one sort at a time', () => {
  it('does not offer "Ranger Non classé" again before Claude has answered', async () => {
    const user = userEvent.setup();
    readLink('pull', INBOX_ID);
    let answer: (response: Response) => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => (answer = resolve))));
    render(<LineScreen id={INBOX_ID} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Ranger Non classé' }));
    expect(snack()).toMatchObject({ message: 'Claude range Non classé…', sticky: true });

    await openMenu(user);
    expect(screen.queryByRole('menuitem', { name: 'Ranger Non classé' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    answer(json({ moves: [] }));
    await waitFor(() => expect(snack()?.message).toBe('Rien dans Non classé ne va clairement dans une collection'));
    expect(useUiStore.getState().sorting).toBe(false);
  });
});

describe('a new collection', () => {
  it('takes what belongs in it from "Non classé", unless the box is unticked', async () => {
    const user = userEvent.setup();
    const recette = readLink('recette', INBOX_ID);
    const requests = sortServer(request => ({ moves: [{ link: recette, to: request.targets[0]!.id }] }));
    const made: string[] = [];
    const { rerender } = render(<NewLineDialog open onDismiss={() => {}} onCreated={id => made.push(id)} />);
    const box = screen.getByRole('checkbox', { name: /^Y ranger les liens de Non classé/ });
    expect(box).toHaveAttribute('aria-checked', 'true');
    await user.type(screen.getByRole('textbox', { name: 'Nom' }), 'Recettes');
    await user.click(screen.getByRole('button', { name: 'Créer la collection' }));

    await waitFor(() => expect(snack()?.message).toBe('1 lien rangé dans Recettes'));
    expect(requests[0]!.targets).toEqual([{ id: made[0], title: 'Recettes', hint: '', examples: [] }]);
    expect(state().links[recette]).toMatchObject({ noteId: made[0], filedBy: 'claude' });

    readLink('autre', INBOX_ID);
    rerender(<NewLineDialog open={false} onDismiss={() => {}} onCreated={id => made.push(id)} />);
    rerender(<NewLineDialog open onDismiss={() => {}} onCreated={id => made.push(id)} />);
    await user.click(await screen.findByRole('checkbox', { name: /^Y ranger les liens de Non classé/ }));
    await user.type(screen.getByRole('textbox', { name: 'Nom' }), 'Cadeaux');
    await user.click(screen.getByRole('button', { name: 'Créer la collection' }));
    expect(made).toHaveLength(2);
    expect(requests).toHaveLength(1);
  });
});
