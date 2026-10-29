import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INBOX_ID } from '@unlease/notes/models/entities';
import type { ServerSettings } from '@unlease/core/sync/settings';

import { freshLibrary } from '../../test/library';
import { addLink, createLine, createNote, trashNotes, updateLink } from '../../app/store/actions';
import { getRecord, useLibraryStore } from '../../app/store/library';
import { createPage, trashPage } from '../../app/store/pages';
import { setReading, setServer, useSettingsStore } from '../../app/store/settings';
import { openCapture, useUiStore } from '../../app/store/ui';
import { stopSync } from '../../app/sync/loop';
import { CaptureDialog } from '../features/capture/CaptureDialog';
import { ReadingSection } from '../features/settings/ReadingSection';
import { AdminScreen } from '../screens/AdminScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

const SERVER = { url: 'https://carnet.test', token: 'jeton' };
const ON: ServerSettings['analysis'] = { enabled: true, keySource: 'app', keyHint: '…k3Xq', model: 'claude-opus-5-5', budgetUsd: 15 };
const OFF: ServerSettings['analysis'] = { enabled: false, keySource: null, keyHint: null, model: 'claude-opus-5-5', budgetUsd: 15 };

const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const links = () => Object.values(useLibraryStore.getState().links);

/** A server in a function: settings that PUT changes, usage, and a refusal for keys that do not look right. */
function fakeServer(initial: ServerSettings['analysis']) {
  let analysis = initial;
  const puts: unknown[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/usage')) return json({ monthToDate: { analyses: 3, costUsd: 0.12 }, total: { analyses: 10, costUsd: 0.4 }, model: analysis.model, budgetUsd: analysis.budgetUsd });
    if (url.endsWith('/api/settings') && init?.method === 'PUT') {
      const patch = JSON.parse(String(init.body)) as Record<string, unknown>;
      puts.push(patch);
      if (typeof patch.anthropicApiKey === 'string' && !patch.anthropicApiKey.startsWith('sk-ant-')) return json({ error: 'Anthropic refuse cette clé : vérifiez qu’elle est complète.' }, 400);
      if (patch.anthropicApiKey === null) analysis = { ...analysis, enabled: false, keySource: null, keyHint: null };
      else if (typeof patch.anthropicApiKey === 'string') analysis = { ...analysis, enabled: true, keySource: 'app', keyHint: `…${patch.anthropicApiKey.slice(-4)}` };
      if (typeof patch.model === 'string') analysis = { ...analysis, model: patch.model as ServerSettings['analysis']['model'] };
      if (typeof patch.budgetUsd === 'number') analysis = { ...analysis, budgetUsd: patch.budgetUsd };
      return json({ analysis });
    }
    if (url.endsWith('/api/settings')) return json({ analysis });
    return json({}, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { puts };
}

describe('link reading by Claude, in the Administration', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  afterEach(() => {
    stopSync();
    vi.unstubAllGlobals();
  });

  it('shows the state, the key hint, the model and its cost, and the month’s spend', async () => {
    fakeServer(ON);
    render(<ReadingSection server={SERVER} onConnect={() => {}} />);
    expect(await screen.findByText('Lecture activée')).toBeInTheDocument();
    // The phone's words: the hint alone for a key set from the apps.
    expect(screen.getByText('Clé …k3Xq')).toBeInTheDocument();
    // The models in the theme's segmented control, the chosen one's cost under it.
    const models = screen.getByRole('radiogroup', { name: 'Modèle' });
    expect(within(models).getAllByRole('radio').map(radio => radio.textContent)).toEqual(['Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5']);
    expect(within(models).getByRole('radio', { name: 'Opus 5.5' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/^Environ 0,04\s\$ par lien lu, 0,25\s\$ par recherche d’un module sur le web\.$/)).toBeInTheDocument();
    expect(await screen.findByText(/^Ce mois-ci : 3\sliens lus, 0,12\s\$$/)).toBeInTheDocument();
    expect(screen.getByText(/^Sur un budget de 15,00\s\$ · depuis le début 0,40\s\$$/)).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Budget du mois utilisé' })).toHaveAttribute('aria-valuenow', '1');
    // The cache that new links are marked from follows the server.
    expect(useSettingsStore.getState().reading).toBe(true);
  });

  it('shows the server’s refusal of a key, then saves a good one', async () => {
    const user = userEvent.setup();
    const { puts } = fakeServer(OFF);
    render(<ReadingSection server={SERVER} onConnect={() => {}} />);
    expect(await screen.findByText('Lecture désactivée')).toBeInTheDocument();
    const field = screen.getByLabelText('Clé API Claude');
    expect(field).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Afficher la clé' }));
    expect(field).toHaveAttribute('type', 'text');
    await user.type(field, 'pas-une-cle-de-claude-du-tout');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la clé' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Anthropic refuse cette clé : vérifiez qu’elle est complète.');
    await user.clear(field);
    await user.type(field, 'sk-ant-api03-abcdefghijklmnopqrstuvwxyzABCD');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la clé' }));
    expect(await screen.findByText('Lecture activée')).toBeInTheDocument();
    expect(screen.getByText('Clé …ABCD')).toBeInTheDocument();
    expect(puts.at(-1)).toEqual({ anthropicApiKey: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyzABCD' });
    expect(useSettingsStore.getState().reading).toBe(true);
    expect(useUiStore.getState().snack?.message).toBe('Clé enregistrée : les liens seront lus.');
  });

  it('changes the model and the budget, and removes the key after confirming', async () => {
    const user = userEvent.setup();
    const { puts } = fakeServer(ON);
    render(<ReadingSection server={SERVER} onConnect={() => {}} />);
    await user.click(await screen.findByRole('radio', { name: /Haiku 5\.5/ }));
    await waitFor(() => expect(screen.getByRole('radio', { name: /Haiku 5\.5/ })).toHaveAttribute('aria-checked', 'true'));
    expect(puts).toContainEqual({ model: 'claude-haiku-5-5' });
    expect(screen.getByText(/^Environ 0,001\s\$ par lien lu, 0,05\s\$ par recherche d’un module sur le web\.$/)).toBeInTheDocument();

    const budget = screen.getByLabelText('Budget mensuel ($)');
    await user.clear(budget);
    await user.type(budget, '7,5');
    await user.click(screen.getByRole('button', { name: 'Appliquer' }));
    await waitFor(() => expect(puts).toContainEqual({ budgetUsd: 7.5 }));

    await user.click(screen.getByRole('button', { name: 'Supprimer la clé' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Supprimer la clé ?' });
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    expect(await screen.findByText('Lecture désactivée')).toBeInTheDocument();
    expect(puts.at(-1)).toEqual({ anthropicApiKey: null });
    expect(useSettingsStore.getState().reading).toBe(false);
  });

  it('offers to read the links kept unread, in one go', async () => {
    const user = userEvent.setup();
    setReading(false);
    addLink('https://www.exemple.fr/a');
    addLink('https://www.exemple.fr/b');
    fakeServer(ON);
    render(<ReadingSection server={SERVER} onConnect={() => {}} />);
    await user.click(await screen.findByRole('button', { name: /Lire les 2\sliens non lus/ }));
    expect(links().map(link => link.status)).toEqual(['pending', 'pending']);
    expect(useUiStore.getState().snack?.message).toBe('2 liens envoyés en lecture');
  });

  it('without a server, says the key lives on the server and leads to its address', async () => {
    const user = userEvent.setup();
    render(<AdminScreen />);
    const section = screen.getByRole('region', { name: 'Lecture des liens par Claude' });
    expect(within(section).getByText('Lecture désactivée')).toBeInTheDocument();
    expect(within(section).getByText(/Les appels partent de votre serveur .+, qui garde la clé API/)).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Connecter un serveur' }));
    expect(screen.getByRole('textbox', { name: 'Adresse' })).toHaveFocus();
  });

  it('explains the server in a bubble opened from the pebble beside its title, as on the phone', async () => {
    const user = userEvent.setup();
    render(<AdminScreen />);
    const section = screen.getByRole('region', { name: 'Serveur' });
    const pebble = within(section).getByRole('button', { name: 'Comment ça marche' });
    expect(pebble).toHaveAttribute('aria-expanded', 'false');
    await user.click(pebble);
    expect(within(section).getByText(/^Le serveur synchronise vos notes entre vos appareils\. Avec une clé Claude/)).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Masquer l’explication' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('remembers at once, on connecting, whether the server reads links', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/api/health')) return json({ ok: true, analysis: false, version: 'test' });
        if (url.endsWith('/api/sync')) {
          const body = JSON.parse(String(init?.body)) as { wait?: number };
          // The loop's long-poll waits until it is stopped; the token probe answers at once.
          if (body.wait) return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('arrêté', 'AbortError'))));
          return json({ records: [], cursor: 0 });
        }
        // The settings never answer: only the health check can tell.
        return json({}, 503);
      }),
    );
    render(<AdminScreen />);
    await user.type(screen.getByRole('textbox', { name: 'Adresse' }), 'carnet.test');
    await user.type(screen.getByLabelText('Jeton'), 'jeton');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    await waitFor(() => expect(useSettingsStore.getState().server?.url).toBe('https://carnet.test'));
    expect(useSettingsStore.getState().reading).toBe(false);
    expect(useUiStore.getState().snack?.message).toBe('Connecté, mais le serveur n’a pas de clé Claude.');
    // A link saved now is kept plain, not left waiting for a reader.
    const later = addLink('https://www.exemple.fr/c', { autoFile: true });
    expect(useLibraryStore.getState().links[later]).toMatchObject({ status: 'skipped', autoFile: false });
  });

  it('cleans the trackers off saved links, with "Annuler"', async () => {
    const user = userEvent.setup();
    const id = addLink('https://www.exemple.fr/veste');
    updateLink(id, { url: 'https://www.exemple.fr/veste?utm_source=lettre&fbclid=x' });
    render(<SettingsScreen />);
    await user.click(screen.getByRole('button', { name: /Nettoyer les liens enregistrés/ }));
    expect(useLibraryStore.getState().links[id]!.url).toBe('https://www.exemple.fr/veste');
    expect(useUiStore.getState().snack).toMatchObject({ message: '1 lien nettoyé', action: { label: 'Annuler' } });
    expect(screen.queryByRole('button', { name: /Nettoyer les liens enregistrés/ })).not.toBeInTheDocument();
    expect(screen.getByText('Aucun paramètre de suivi dans vos liens : les nouveaux sont nettoyés en arrivant.')).toBeInTheDocument();
  });

  it('empties the one bin of its notes and its pages, after confirming', async () => {
    const user = userEvent.setup();
    const note = createNote({ kind: 'text', title: 'Brouillon' });
    trashNotes([note]);
    const page = createPage({ title: 'Ancienne page' });
    trashPage(page);
    render(<SettingsScreen />);
    await user.click(screen.getByRole('button', { name: /^Vider la corbeille/ }));
    const dialog = screen.getByRole('alertdialog', { name: 'Vider la corbeille ?' });
    expect(within(dialog).getByText('Les notes et les pages de la corbeille seront supprimées définitivement, sur tous vos appareils.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Vider' }));
    expect(useUiStore.getState().snack?.message).toMatch(/^1\snote et 1\spage supprimées définitivement$/);
    expect(getRecord('note', note)!.fields.deletedAt).not.toBeNull();
    expect(getRecord('block', page)!.fields.deletedAt).not.toBeNull();
  });
});

describe('classifying a link', () => {
  beforeEach(async () => {
    await freshLibrary();
  });

  it('without a server, keeps it plain in "Non classé" and leads to the Administration', async () => {
    const user = userEvent.setup();
    createLine({ title: 'Mode', id: 'line-mode' });
    openCapture('https://www.exemple.fr/veste?utm_source=x');
    render(<CaptureDialog />);
    const collections = screen.getByRole('radiogroup', { name: 'Collection' });
    expect(within(collections).queryByRole('radio', { name: /Automatique/ })).not.toBeInTheDocument();
    expect(within(collections).getAllByRole('radio')[0]).toHaveAccessibleName('Non classé');
    expect(within(collections).getByRole('radio', { name: 'Non classé' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/^Sans serveur, le lien est gardé tel quel\. Claude lit les liens depuis votre serveur/)).toBeInTheDocument();
    expect(screen.getByText('Nettoyé : utm_source sera retiré de l’adresse.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Administration' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(links()[0]).toMatchObject({ noteId: INBOX_ID, url: 'https://www.exemple.fr/veste', status: 'skipped', autoFile: false });
    expect(useUiStore.getState().transfers).toEqual([]);
    expect(useUiStore.getState().snack?.message).toBe('Ajouté à Non classé · 1 traceur retiré');
  });

  it('with a server but no key, says a key is missing', () => {
    setServer(SERVER);
    setReading(false);
    openCapture('https://www.exemple.fr/veste');
    render(<CaptureDialog />);
    expect(screen.queryByRole('radio', { name: /Automatique/ })).not.toBeInTheDocument();
    expect(screen.getByText('Le lien est gardé tel quel : ajoutez une clé API Claude dans l’administration pour qu’il soit lu et rangé.')).toBeInTheDocument();
  });

  it('when the server reads links, files it automatically with the snip, the trackers counted', async () => {
    const user = userEvent.setup();
    setServer(SERVER);
    createLine({ title: 'Mode', id: 'line-mode' });
    openCapture('');
    render(<CaptureDialog />);
    const collections = screen.getByRole('radiogroup', { name: 'Collection' });
    expect(within(collections).getByRole('radio', { name: 'Automatique' })).toHaveAttribute('aria-checked', 'true');
    expect(within(collections).queryByRole('radio', { name: 'Non classé' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Classer' })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Adresse du lien' }), 'https://www.exemple.fr/veste?utm_source=x&fbclid=y');
    expect(screen.getByText('Nettoyé : utm_source, fbclid seront retirés de l’adresse.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Administration' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Classer' }));
    expect(links()[0]).toMatchObject({ noteId: INBOX_ID, status: 'pending', autoFile: true });
    expect(useUiStore.getState().transfers).toMatchObject([{ linkId: links()[0]!.id, cleaned: 2 }]);
  });

  it('moves between collections with the arrow keys, and files by hand where it is put', async () => {
    const user = userEvent.setup();
    setServer(SERVER);
    const mode = createLine({ title: 'Mode', id: 'line-mode' });
    openCapture('https://www.exemple.fr/pull');
    render(<CaptureDialog />);
    within(screen.getByRole('radiogroup', { name: 'Collection' })).getByRole('radio', { name: 'Automatique' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Mode' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Mode' })).toHaveFocus();
    expect(screen.getByText('Claude lit la page ; le lien reste dans cette collection.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Classer' }));
    expect(links()[0]).toMatchObject({ noteId: mode, status: 'pending', autoFile: false });
    expect(useUiStore.getState().transfers).toEqual([]);
    expect(useUiStore.getState().snack?.message).toBe('Ajouté à Mode');
  });
});
