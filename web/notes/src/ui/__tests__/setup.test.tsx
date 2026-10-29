import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_APPEARANCE, PALETTE_COLORS } from '@unlease/design/appearance';
import type { AdminStatus } from '@unlease/core/sync/admin';
import type { BackupSettings, ServerSettings } from '@unlease/core/sync/settings';

import { freshLibrary } from '../../test/library';
import { resetSettings, useSettingsStore } from '../../app/store/settings';
import { setServerSettings } from '../../app/store/serverSettings';
import { stopSync } from '../../app/sync/loop';
import { SetupScreen } from '../screens/SetupScreen';

const NO_S3: BackupSettings = { configured: false, endpoint: '', region: '', bucket: '', prefix: '', accessKeyId: '', secretHint: null, recurrence: 'off', keep: 30 };
const SNAPSHOT = 'carnet-2026-10-25T03-00-00Z.tar.gz';

const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

const status = (notes: number): AdminStatus => ({
  server: { version: '0.1.0', notes, pages: 0, files: 0, fileBytes: 0 },
  backup: { running: false, last: null, lastSuccessAt: null, nextAt: null },
  drive: { running: false, files: 0, bytes: 0, waiting: 0, lastPassAt: null, error: null },
  restore: { running: false, startedAt: null, finishedAt: null, error: null, report: null },
});

/** A new server (empty, or holding `notes`): its health, settings that PUT changes (S3 set daily, as the real one), the status, a snapshot, restores. */
function fakeServer(notes = 0) {
  let backup = NO_S3;
  const sent: { method: string; path: string; body: unknown }[] = [];
  const view = (): ServerSettings => ({
    analysis: { enabled: false, keySource: null, keyHint: null, model: 'claude-opus-5-5', budgetUsd: 15 },
    pages: { enabled: false, everywhere: true, web: true, reach: 'medium' },
    backup,
    drive: { provider: null, url: '', folder: '/Carnet', library: null, tokenHint: null, leaving: false },
    seerr: { url: '', keyHint: null },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const { pathname, search } = new URL(url);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : init?.body;
      sent.push({ method, path: `${pathname}${search}`, body });
      if (pathname === '/api/health') return json({ ok: true, version: '0.1.0', apiVersion: 1, analysis: false });
      if (pathname === '/api/settings' && method === 'PUT') {
        const patch = (body as { backup: Partial<BackupSettings> }).backup;
        backup = { ...backup, ...patch, configured: true, recurrence: 'daily', secretHint: '…1234' };
        return json(view());
      }
      if (pathname === '/api/settings') return json(view());
      if (pathname === '/api/admin') return json(status(notes));
      if (pathname === '/api/admin/backups') return json({ snapshots: [{ name: SNAPSHOT, at: Date.parse('2026-10-25T03:00:00Z'), bytes: 180_000 }] });
      if (pathname === '/api/admin/restore') return json({ ...status(notes), restore: { running: true, startedAt: Date.now(), finishedAt: null, error: null, report: null } }, 202);
      if (pathname === '/api/sync') return json({ records: [], cursor: 0, more: false, serverTime: Date.now(), epoch: 'e1' });
      return json({ error: 'not found' }, 404);
    }),
  );
  return { sent, puts: () => sent.filter(request => request.path === '/api/settings' && request.method === 'PUT').map(request => request.body) };
}

/** Connected, past the appearance (kept as it comes, "Passer"), on "Votre serveur". */
async function connect(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText('Adresse du serveur'), 'https://carnet.test');
  await user.type(screen.getByLabelText('Jeton'), 'jeton');
  await user.click(screen.getByRole('button', { name: 'Se connecter' }));
  await screen.findByRole('heading', { name: 'Apparence' });
  await user.click(screen.getByRole('button', { name: 'Passer' }));
  await screen.findByRole('heading', { name: 'Votre serveur' });
}

describe('the first run', () => {
  beforeEach(async () => {
    await freshLibrary();
    resetSettings();
    setServerSettings(null);
  });

  afterEach(() => {
    stopSync();
    vi.unstubAllGlobals();
  });

  it('sets a new server up from its list: S3 from Scaleway Paris, then the newest backup brought back', async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    render(<SetupScreen />);
    await connect(user);
    expect(useSettingsStore.getState().onboarded).toBe(false);
    expect(screen.getByText('Étape 3 sur 3', { exact: false })).toBeInTheDocument();
    // On a server that held nothing, bringing a backup back comes first.
    const rows = within(screen.getByRole('list', { name: 'Votre serveur' })).getAllByRole('button');
    expect(rows.map(row => row.textContent)).toEqual([
      expect.stringMatching(/^Retrouver vos données/),
      expect.stringMatching(/^Lecture des liens par Claude/),
      expect.stringMatching(/^Sauvegarde sur S3/),
      expect.stringMatching(/^Fichiers sur Seafile/),
      expect.stringMatching(/^Films et séries avec Seerr/),
    ]);

    await user.click(screen.getByRole('button', { name: /^Sauvegarde sur S3/ }));
    await screen.findByRole('heading', { name: 'Sauvegarde sur S3' });
    expect(screen.getByRole('textbox', { name: 'Adresse du service' })).toHaveValue('https://s3.fr-par.scw.cloud');
    expect(screen.getByRole('textbox', { name: 'Région' })).toHaveValue('fr-par');
    await user.type(screen.getByRole('textbox', { name: 'Bucket' }), 'mes-sauvegardes');
    await user.type(screen.getByRole('textbox', { name: 'Clé d’accès' }), 'SCWACCESSKEY');
    await user.type(screen.getByLabelText('Clé secrète'), 'secret-de-test-1234');
    await user.click(screen.getByRole('button', { name: 'Tester et enregistrer' }));
    await waitFor(() =>
      expect(server.puts().at(-1)).toEqual({ backup: { endpoint: 'https://s3.fr-par.scw.cloud', region: 'fr-par', prefix: 'unlease', bucket: 'mes-sauvegardes', accessKeyId: 'SCWACCESSKEY', secretAccessKey: 'secret-de-test-1234' } }),
    );

    // Back on the list, the row says what it holds now.
    await user.click(await screen.findByRole('button', { name: 'Continuer' }));
    await screen.findByRole('heading', { name: 'Votre serveur' });
    expect(screen.getByText('mes-sauvegardes/unlease · chaque jour')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Retrouver vos données/ }));
    await screen.findByRole('heading', { name: 'Retrouver vos données' });
    expect(await screen.findByRole('radio', { checked: true })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restaurer cette sauvegarde' }));
    await waitFor(() => expect(server.sent.some(request => request.path === '/api/admin/restore?mode=merge' && (request.body as { snapshot: string }).snapshot === SNAPSHOT)).toBe(true));
    expect(await screen.findByText('Restauration en cours…')).toBeInTheDocument();
  });

  it('leaves a row for later, and starts from the list', async () => {
    const user = userEvent.setup();
    fakeServer();
    render(<SetupScreen />);
    await connect(user);
    await user.click(screen.getByRole('button', { name: /^Films et séries avec Seerr/ }));
    await screen.findByRole('heading', { name: 'Films et séries avec Seerr' });
    await user.click(screen.getByRole('button', { name: 'Plus tard' }));
    await screen.findByRole('heading', { name: 'Votre serveur' });
    await user.click(screen.getByRole('button', { name: 'Commencer' }));
    expect(useSettingsStore.getState().onboarded).toBe(true);
  });

  it('joins a server already in use straight from the appearance', async () => {
    const user = userEvent.setup();
    fakeServer(12);
    render(<SetupScreen />);
    await user.type(screen.getByLabelText('Adresse du serveur'), 'https://carnet.test');
    await user.type(screen.getByLabelText('Jeton'), 'jeton');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    await screen.findByRole('heading', { name: 'Apparence' });
    await waitFor(() => expect(screen.getByText('Étape 2 sur 2', { exact: false })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Commencer' }));
    expect(useSettingsStore.getState().onboarded).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Votre serveur' })).not.toBeInTheDocument();
  });

  it('says a refused token under the token, and what to check when nothing answers under the address', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const { hostname, pathname } = new URL(url);
        if (hostname === 'nulle-part.test') throw new TypeError('Failed to fetch');
        if (pathname === '/api/health') return json({ ok: true, version: '0.1.0', apiVersion: 1, analysis: false });
        return json({ error: 'unauthorized' }, 401);
      }),
    );
    render(<SetupScreen />);
    await user.type(screen.getByLabelText('Adresse du serveur'), 'https://carnet.test');
    await user.type(screen.getByLabelText('Jeton'), 'mauvais');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText('Jeton refusé par le serveur')).toBeInTheDocument();
    expect(screen.getByLabelText('Jeton')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Adresse du serveur')).not.toHaveAttribute('aria-invalid');

    await user.clear(screen.getByLabelText('Adresse du serveur'));
    await user.type(screen.getByLabelText('Adresse du serveur'), 'https://nulle-part.test');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText('Serveur injoignable : vérifiez l’adresse, et que le serveur est en marche.')).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse du serveur')).toHaveAttribute('aria-invalid', 'true');
    // What was typed stays.
    expect(screen.getByLabelText('Jeton')).toHaveValue('mauvais');
  });

  it('keeps the notes in this browser: the appearance, then the board', async () => {
    const user = userEvent.setup();
    render(<SetupScreen />);
    await user.click(screen.getByRole('button', { name: 'Garder mes notes dans ce navigateur' }));
    await screen.findByRole('heading', { name: 'Apparence' });
    expect(useSettingsStore.getState().onboarded).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Commencer' }));
    expect(useSettingsStore.getState()).toMatchObject({ onboarded: true, server: null, appearance: DEFAULT_APPEARANCE });
  });

  it('speaks English from the welcome on', async () => {
    const user = userEvent.setup();
    render(<SetupScreen />);
    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(useSettingsStore.getState().locale).toBe('en');
    const back = await screen.findByRole('button', { name: 'Français' });
    expect(back).toHaveAttribute('lang', 'fr');
    expect(screen.getByLabelText('Server address')).toBeInTheDocument();
    // The language is the interface's, kept beyond this test.
    await user.click(back);
    expect(useSettingsStore.getState().locale).toBe('fr');
  });

  it('keeps a look chosen on the way, and can go back to Carnet’s own', async () => {
    const user = userEvent.setup();
    render(<SetupScreen />);
    await user.click(screen.getByRole('button', { name: 'Garder mes notes dans ce navigateur' }));
    await screen.findByRole('heading', { name: 'Apparence' });
    await user.click(screen.getByRole('radio', { name: 'Mimosa' }));
    await user.click(screen.getByRole('radio', { name: 'Opale' }));
    expect(useSettingsStore.getState().appearance).toMatchObject({ ...PALETTE_COLORS.mimosa, ground: { kind: 'preset', key: 'opale' } });
    await user.click(screen.getByRole('button', { name: 'Revenir à l’apparence d’origine' }));
    expect(useSettingsStore.getState().appearance).toEqual(DEFAULT_APPEARANCE);
    await user.click(screen.getByRole('radio', { name: 'Lagon' }));
    await user.click(screen.getByRole('button', { name: 'Commencer' }));
    expect(useSettingsStore.getState()).toMatchObject({ onboarded: true, appearance: { ground: { kind: 'preset', key: 'lagon' } } });
  });
});
