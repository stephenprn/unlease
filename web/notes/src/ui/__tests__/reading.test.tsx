import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INBOX_ID } from '@unlease/notes/models/entities';
import type { ServerSettings } from '@unlease/core/sync/settings';

import { freshLibrary } from '@test/library';
import { addLink, createLine, createNote, trashNotes, updateLink } from '../../app/store/actions';
import { getRecord } from '@shared/app/store/records';
import { useLibraryStore } from '../../app/store/library';
import { setServer, useSettingsStore } from '@shared/app/store/settings';
import { setReading } from '../../app/store/prefs';
import { useUiStore } from '@shared/app/store/ui';
import { openCapture, useNotesUiStore } from '../../app/store/notesUi';
import { stopSync } from '@shared/app/sync/loop';
import { CaptureDialog } from '../features/capture/CaptureDialog';
import { ClaudeSection } from '@shared/ui/features/settings/ClaudeSection';
import { AdminScreen } from '@shared/ui/screens/AdminScreen';
import { parseRoute } from '@shared/ui/router';
import { SettingsScreen } from '@shared/ui/screens/SettingsScreen';

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
    render(<ClaudeSection server={SERVER} onConnect={() => {}} />);
    expect(await screen.findByText('Claude activé')).toBeInTheDocument();
    // The phone's words: the hint alone for a key set from the apps.
    expect(screen.getByText('Clé …k3Xq')).toBeInTheDocument();
    // The models in the theme's segmented control, the chosen one's cost under it.
    const models = screen.getByRole('radiogroup', { name: 'Modèle' });
    expect(within(models).getAllByRole('radio').map(radio => radio.textContent)).toEqual(['Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5']);
    expect(within(models).getByRole('radio', { name: 'Opus 5.5' })).toHaveAttribute('aria-checked', 'true');
    // Carnet's own count after its costs; the month's spend is every app's (the phone's words).
    expect(await screen.findByText(/^Environ 0,04\s\$ par lien lu, 0,25\s\$ par recherche d’un module sur le web\. Ce mois-ci : 3\sliens lus\.$/)).toBeInTheDocument();
    expect(screen.getByText(/^Ce mois-ci : 0,12\s\$$/)).toBeInTheDocument();
    expect(screen.getByText(/^Sur un budget de 15,00\s\$ · depuis le début 0,40\s\$$/)).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Budget du mois utilisé' })).toHaveAttribute('aria-valuenow', '1');
    // The cache that new links are marked from follows the server.
    expect(useSettingsStore.getState().serverFeatures.claude).toBe(true);
  });

  it('shows the server’s refusal of a key, then saves a good one', async () => {
    const user = userEvent.setup();
    const { puts } = fakeServer(OFF);
    render(<ClaudeSection server={SERVER} onConnect={() => {}} />);
    expect(await screen.findByText('Claude désactivé')).toBeInTheDocument();
    const field = screen.getByLabelText('Clé API Claude');
    expect(field).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Afficher la clé' }));
    expect(field).toHaveAttribute('type', 'text');
    await user.type(field, 'pas-une-cle-de-claude-du-tout');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la clé' }));
    // Said under the key, which takes the focus back, what was typed kept.
    await waitFor(() => expect(field).toHaveAccessibleDescription('Anthropic refuse cette clé : vérifiez qu’elle est complète.'));
    expect(field).toHaveFocus();
    expect(field).toHaveValue('pas-une-cle-de-claude-du-tout');
    await user.clear(field);
    await user.type(field, 'sk-ant-api03-abcdefghijklmnopqrstuvwxyzABCD');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la clé' }));
    expect(await screen.findByText('Claude activé')).toBeInTheDocument();
    expect(screen.getByText('Clé …ABCD')).toBeInTheDocument();
    expect(puts.at(-1)).toEqual({ anthropicApiKey: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyzABCD' });
    expect(useSettingsStore.getState().serverFeatures.claude).toBe(true);
    expect(useUiStore.getState().snack?.message).toBe('Clé enregistrée');
  });

  it('changes the model and the budget, and removes the key after confirming', async () => {
    const user = userEvent.setup();
    const { puts } = fakeServer(ON);
    render(<ClaudeSection server={SERVER} onConnect={() => {}} />);
    await user.click(await screen.findByRole('radio', { name: /Haiku 5\.5/ }));
    await waitFor(() => expect(screen.getByRole('radio', { name: /Haiku 5\.5/ })).toHaveAttribute('aria-checked', 'true'));
    expect(puts).toContainEqual({ model: 'claude-haiku-5-5' });
    expect(screen.getByText(/^Environ 0,001\s\$ par lien lu, 0,05\s\$ par recherche d’un module sur le web\./)).toBeInTheDocument();

    const budget = screen.getByLabelText('Budget mensuel ($)');
    await user.clear(budget);
    await user.type(budget, '7,5');
    await user.click(screen.getByRole('button', { name: 'Appliquer' }));
    await waitFor(() => expect(puts).toContainEqual({ budgetUsd: 7.5 }));

    await user.click(screen.getByRole('button', { name: 'Supprimer la clé' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Supprimer la clé ?' });
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    expect(await screen.findByText('Claude désactivé')).toBeInTheDocument();
    expect(puts.at(-1)).toEqual({ anthropicApiKey: null });
    expect(useSettingsStore.getState().serverFeatures.claude).toBe(false);
  });

  it('offers to read the links kept unread, in one go', async () => {
    const user = userEvent.setup();
    setReading(false);
    addLink('https://www.exemple.fr/a');
    addLink('https://www.exemple.fr/b');
    fakeServer(ON);
    render(<ClaudeSection server={SERVER} onConnect={() => {}} />);
    await user.click(await screen.findByRole('button', { name: /Lire les 2\sliens non lus/ }));
    expect(links().map(link => link.status)).toEqual(['pending', 'pending']);
    expect(useUiStore.getState().snack?.message).toBe('2 liens envoyés en lecture');
  });

  it('without a server, says the key lives on the server and leads to its address', async () => {
    const user = userEvent.setup();
    render(<AdminScreen route={parseRoute('/notes/admin/reading')} />);
    const section = screen.getByRole('region', { name: 'Claude' });
    expect(within(section).getByText('Claude désactivé')).toBeInTheDocument();
    expect(within(section).getByText(/Les appels partent de votre serveur .+, qui garde la clé API/)).toBeInTheDocument();
    // What Claude does for each app, one line each.
    expect(within(section).getByText(/^Carnet : chaque lien enregistré est lu/)).toBeInTheDocument();
    expect(within(section).getByText(/^Pages : des questions sur vos pages/)).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Connecter un serveur' }));
    expect(`${location.pathname}${location.hash}`).toBe('/notes/admin/server#address');
  });

  it('explains the server at the head of its page', () => {
    render(<AdminScreen route={parseRoute('/notes/admin/server')} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Serveur' })).toBeInTheDocument();
    expect(screen.getByText(/^Le serveur garde vos données et les synchronise entre vos appareils, pour toutes les applications\./)).toBeInTheDocument();
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
    render(<AdminScreen route={parseRoute('/notes/admin/server')} />);
    await user.type(screen.getByRole('textbox', { name: 'Adresse' }), 'carnet.test');
    await user.type(screen.getByLabelText('Jeton'), 'jeton');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    await waitFor(() => expect(useSettingsStore.getState().server?.url).toBe('https://carnet.test'));
    expect(useSettingsStore.getState().serverFeatures.claude).toBe(false);
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

  it('empties the app’s bin after confirming', async () => {
    const user = userEvent.setup();
    const notes = [createNote({ kind: 'text', title: 'Brouillon' }), createNote({ kind: 'text', title: 'Ancienne note' })];
    trashNotes(notes);
    render(<SettingsScreen />);
    await user.click(screen.getByRole('button', { name: /^Vider la corbeille/ }));
    const dialog = screen.getByRole('alertdialog', { name: 'Vider la corbeille ?' });
    expect(within(dialog).getByText('Ce qui est dans la corbeille de Carnet sera supprimé définitivement, sur tous vos appareils.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Vider' }));
    expect(useUiStore.getState().snack?.message).toMatch(/^2\séléments supprimés définitivement$/);
    for (const note of notes) expect(getRecord('note', note)!.fields.deletedAt).not.toBeNull();
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
    expect(useNotesUiStore.getState().transfers).toEqual([]);
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

  it('before the server has said whether it reads links, offers no « Automatique » yet, and lets the server decide', async () => {
    const user = userEvent.setup();
    setServer(SERVER);
    createLine({ title: 'Mode', id: 'line-mode' });
    openCapture('https://www.exemple.fr/veste');
    render(<CaptureDialog />);
    const collections = screen.getByRole('radiogroup', { name: 'Collection' });
    expect(within(collections).queryByRole('radio', { name: /Automatique/ })).not.toBeInTheDocument();
    expect(within(collections).getByRole('radio', { name: 'Non classé' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('button', { name: 'Administration' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    // Kept for the server to read, should it have a key.
    expect(links()[0]).toMatchObject({ noteId: INBOX_ID, status: 'pending', autoFile: false });
  });

  it('when the server reads links, files it automatically with the snip, the trackers counted', async () => {
    const user = userEvent.setup();
    setServer(SERVER);
    setReading(true);
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
    expect(useNotesUiStore.getState().transfers).toMatchObject([{ linkId: links()[0]!.id, cleaned: 2 }]);
  });

  it('moves between collections with the arrow keys, and files by hand where it is put', async () => {
    const user = userEvent.setup();
    setServer(SERVER);
    setReading(true);
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
    expect(useNotesUiStore.getState().transfers).toEqual([]);
    expect(useUiStore.getState().snack?.message).toBe('Ajouté à Mode');
  });
});
