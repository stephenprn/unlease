/** The first run from Pages' web app: Pages stays on, Carnet is the person's to keep or not. */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminStatus } from '@unlease/core/sync/admin';
import type { AppId } from '@unlease/core/apps';
import type { BackupSettings, ServerSettings } from '@unlease/core/sync/settings';

import { freshLibrary } from '@test/library';
import { resetSettings } from '@shared/app/store/settings';
import { setServerSettings } from '@shared/app/store/serverSettings';
import { stopSync } from '@shared/app/sync/loop';
import { SetupScreen } from '@shared/ui/screens/SetupScreen';

const NO_S3: BackupSettings = { configured: false, endpoint: '', region: '', bucket: '', prefix: '', accessKeyId: '', secretHint: null, recurrence: 'off', keep: 30, storageClass: 'STANDARD' };
const SNAPSHOT = 'carnet-2026-10-25T03-00-00Z.tar.gz';

const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

const status = (notes: number): AdminStatus => ({
  server: { version: '0.1.0', notes, pages: 0, contacts: 0, events: 0, files: 0, fileBytes: 0 },
  backup: { running: false, last: null, lastSuccessAt: null, nextAt: null },
  drive: { running: false, files: 0, bytes: 0, waiting: 0, lastPassAt: null, error: null },
  restore: { running: false, startedAt: null, finishedAt: null, error: null, report: null, thawing: false },
});

/**
 * A server (new and empty, or holding `notes` and set up already when `done`): its health, settings
 * that PUT changes (S3 set daily, as the real one; the apps; the setup done), the status, a
 * snapshot, restores.
 */
function fakeServer(notes = 0, done = notes > 0) {
  let backup = NO_S3;
  let apps: AppId[] = ['notes', 'pages'];
  let setupDone = done;
  const sent: { method: string; path: string; body: unknown }[] = [];
  const view = (): ServerSettings => ({
    apps: { enabled: apps },
    setup: { done: setupDone },
    analysis: { enabled: false, keySource: null, keyHint: null, model: 'claude-opus-5-5', budgetUsd: 15 },
    pages: { enabled: false, everywhere: true, web: true, reach: 'medium' },
    backup,
    drive: { provider: null, url: '', folder: '/Unlease', library: null, tokenHint: null, leaving: false },
    calendar: { holidays: { country: null, region: null }, publishPath: null, ask: false },
    seerr: { url: '', keyHint: null },
    immich: { url: '', keyHint: null },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const { pathname, search } = new URL(url);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : init?.body;
      sent.push({ method, path: `${pathname}${search}`, body });
      if (pathname === '/api/health') return json({ ok: true, version: '0.1.0', apiVersion: 1, apps, setup: setupDone, analysis: false });
      if (pathname === '/api/settings' && method === 'PUT') {
        const patch = body as { backup?: Partial<BackupSettings>; apps?: AppId[]; setupDone?: true };
        if (patch.backup) backup = { ...backup, ...patch.backup, configured: true, recurrence: 'daily', secretHint: '…1234' };
        if (patch.apps) apps = patch.apps;
        if (patch.setupDone) setupDone = true;
        return json(view());
      }
      if (pathname === '/api/settings') return json(view());
      if (pathname === '/api/admin') return json(status(notes));
      if (pathname === '/api/admin/backups') return json({ snapshots: [{ name: SNAPSHOT, at: Date.parse('2026-10-25T03:00:00Z'), bytes: 180_000 }] });
      if (pathname === '/api/admin/restore') return json({ ...status(notes), restore: { running: true, startedAt: Date.now(), finishedAt: null, error: null, report: null, thawing: false } }, 202);
      if (pathname === '/api/sync') return json({ records: [], cursor: 0, more: false, serverTime: Date.now(), epoch: 'e1' });
      return json({ error: 'not found' }, 404);
    }),
  );
  return { sent, puts: () => sent.filter(request => request.path === '/api/settings' && request.method === 'PUT').map(request => request.body) };
}

describe('the first run in Pages', () => {
  beforeEach(async () => {
    await freshLibrary();
    resetSettings();
    setServerSettings(null);
  });

  afterEach(() => {
    stopSync();
    vi.unstubAllGlobals();
  });

  it('keeps Pages on, saves Carnet off at once, and leaves Carnet’s rows to Carnet', async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    render(<SetupScreen />);
    expect(screen.getByRole('heading', { level: 1, name: 'Pages' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Adresse du serveur'), 'https://unlease.test');
    await user.type(screen.getByLabelText('Jeton'), 'jeton');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    await screen.findByRole('heading', { name: 'Vos applications' });
    const pages = await screen.findByRole('checkbox', { name: /^Pages/ });
    expect(pages).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('checkbox', { name: /^Carnet/ }));
    await waitFor(() => expect(server.puts().at(-1)).toEqual({ apps: ['pages'] }));

    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    await screen.findByRole('heading', { name: 'Votre serveur' });
    const rows = within(screen.getByRole('list', { name: 'Votre serveur' })).getAllByRole('button');
    expect(rows.map(row => row.textContent)).not.toContainEqual(expect.stringMatching(/Seerr/));

    // Claude once, then what Pages asks of it.
    await user.click(screen.getByRole('button', { name: /^Claude/ }));
    expect(await screen.findByText(/Pages : des questions sur vos pages/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Questions sur les pages' })).toBeInTheDocument();
  });
});
