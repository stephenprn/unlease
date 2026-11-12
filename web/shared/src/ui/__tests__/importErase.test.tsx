/**
 * The shell's parts of an app's import and of « Effacer des données », with a stand-in app: the first
 * run's import step (offered while the app holds nothing, its foot hidden while the wizard runs,
 * « Plus tard » or « Continuer » once something came in), Réglages' rows, and the erase page's
 * guards (the parts, the word, the token checked by the server, the backup first).
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ErasePart } from '@unlease/core/services/erase';
import type { AdminStatus } from '@unlease/core/sync/admin';
import type { AppId } from '@unlease/core/apps';
import type { BackupSettings, ServerSettings } from '@unlease/core/sync/settings';

import { freshLibrary } from '@test/library';
import type * as Modules from '../../modules';
import type { ImportWizardProps } from '../../modules';

type ModulesModule = typeof Modules;
import { resetSettings, setServer, useSettingsStore } from '../../app/store/settings';
import { setServerSettings } from '../../app/store/serverSettings';
import { stopSync } from '../../app/sync/loop';
import { EraseScreen } from '../screens/EraseScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SetupScreen } from '../screens/SetupScreen';

const stand = vi.hoisted(() => ({
  parts: [] as ErasePart[],
  erased: [] as string[][],
}));

/** A wizard of two moments: its first step, then « Importer » once something is chosen. */
function StandInWizard({ embedded, onFlow, onImported }: ImportWizardProps) {
  return (
    <div>
      <p>{embedded ? 'Assistant intégré' : 'Assistant'}</p>
      <button type="button" onClick={() => onFlow?.(true)}>
        Lire le fichier
      </button>
      <button
        type="button"
        onClick={() => {
          onImported?.();
          onFlow?.(false);
        }}
      >
        Tout importer
      </button>
    </div>
  );
}

vi.mock('../../modules', async importOriginal => {
  const actual = await importOriginal<ModulesModule>();
  return {
    ...actual,
    theApp: () => ({
      ...actual.theApp(),
      importer: { source: () => 'Google Keep', meta: () => 'L’export de Google Keep', Wizard: StandInWizard },
      erase: {
        parts: () => stand.parts,
        run: (chosen: ReadonlySet<string>) => {
          stand.erased.push([...chosen].sort());
          return stand.parts.filter(part => chosen.has(part.id)).reduce((sum, part) => sum + part.count, 0);
        },
      },
    }),
  };
});

const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const NO_S3: BackupSettings = { configured: false, endpoint: '', region: '', bucket: '', prefix: '', accessKeyId: '', secretHint: null, recurrence: 'off', keep: 30, storageClass: 'STANDARD' };
const S3: BackupSettings = { ...NO_S3, configured: true, endpoint: 'https://s3.example.org', region: 'fr-par', bucket: 'sauvegardes', recurrence: 'daily', secretHint: '…1234' };

const status = (notes: number, backup: AdminStatus['backup'] = { running: false, last: null, lastSuccessAt: null, nextAt: null }): AdminStatus => ({
  server: { version: '0.1.0', notes, pages: 0, contacts: 0, events: 0, files: 0, fileBytes: 0 },
  backup,
  drive: { running: false, files: 0, bytes: 0, waiting: 0, lastPassAt: null, error: null },
  restore: { running: false, startedAt: null, finishedAt: null, error: null, report: null, thawing: false },
});

const settingsView = (backup: BackupSettings, done: boolean): ServerSettings => ({
  apps: { enabled: ['notes'] as AppId[] },
  setup: { done },
  analysis: { enabled: false, keySource: null, keyHint: null, model: 'claude-opus-5-5', budgetUsd: 15 },
  pages: { enabled: false, everywhere: true, web: true, reach: 'medium' },
  backup,
  drive: { provider: null, url: '', folder: '/Unlease', library: null, tokenHint: null, leaving: false },
  calendar: { holidays: { country: null, region: null }, publishPath: null, ask: false },
  seerr: { url: '', keyHint: null },
});

/** A server whose token is `bon-jeton`, holding `notes`, its backup to S3 when `backup`. */
function fakeServer({ notes = 0, done = true, backup = false }: { notes?: number; done?: boolean; backup?: boolean } = {}) {
  const sent: { method: string; path: string; token: string | null }[] = [];
  let backups = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const { pathname } = new URL(url);
      const method = init?.method ?? 'GET';
      const token = new Headers(init?.headers).get('authorization')?.replace(/^Bearer /, '') ?? null;
      sent.push({ method, path: pathname, token });
      if (pathname === '/api/health') return json({ ok: true, version: '0.1.0', apiVersion: 1, apps: ['notes'], setup: done, analysis: false });
      if (token !== 'bon-jeton') return json({ error: 'Jeton refusé' }, 401);
      if (pathname === '/api/settings') return json(settingsView(backup ? S3 : NO_S3, done));
      if (pathname === '/api/admin/backups' && method === 'POST') {
        backups += 1;
        return json(status(notes, { running: false, last: { startedAt: Date.now(), finishedAt: Date.now() + 1, ok: true, error: null, snapshot: 's.tar.gz', bytes: 10, filesSent: 0, trigger: 'manual' }, lastSuccessAt: Date.now(), nextAt: null }));
      }
      if (pathname === '/api/admin') return json(status(notes));
      if (pathname === '/api/sync') return json({ records: [], cursor: 0, more: false, serverTime: Date.now(), epoch: 'e1' });
      return json({ error: 'not found' }, 404);
    }),
  );
  return { sent, backups: () => backups };
}

beforeEach(async () => {
  await freshLibrary();
  resetSettings();
  setServerSettings(null);
  stand.parts = [
    { id: 'notes', title: 'Notes', detail: '12 notes', count: 12, glyph: 'note' },
    { id: 'collections', title: 'Collections', detail: '3 collections, 40 liens', count: 43, glyph: 'collections' },
    { id: 'labels', title: 'Labels', detail: 'Aucun', count: 0, glyph: 'tag' },
  ];
  stand.erased = [];
});

afterEach(() => {
  stopSync();
  vi.unstubAllGlobals();
});

describe('the first run offers the import', () => {
  it('in a browser keeping everything to itself: the wizard in the step, its foot hidden while it runs, « Continuer » once imported', async () => {
    const user = userEvent.setup();
    render(<SetupScreen />);
    await user.click(screen.getByRole('button', { name: 'Tout garder dans ce navigateur' }));
    await screen.findByRole('heading', { name: 'Vos données' });
    expect(screen.getByText(/Vous arrivez de Google Keep/)).toBeInTheDocument();
    expect(screen.getByText('Assistant intégré')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plus tard' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lire le fichier' }));
    expect(screen.queryByRole('button', { name: 'Plus tard' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tout importer' }));
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    await screen.findByRole('heading', { name: 'Apparence' });
    await user.click(screen.getByRole('button', { name: 'Retour' }));
    expect(await screen.findByRole('heading', { name: 'Vos données' })).toBeInTheDocument();
  });

  it('joining a server whose app holds nothing yet, and not when it holds something', async () => {
    const user = userEvent.setup();
    fakeServer({ notes: 0 });
    const { unmount } = render(<SetupScreen />);
    await user.type(screen.getByLabelText('Adresse du serveur'), 'https://unlease.test');
    await user.type(screen.getByLabelText('Jeton'), 'bon-jeton');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    await screen.findByRole('heading', { name: 'Vos données' });
    unmount();

    resetSettings();
    setServerSettings(null);
    fakeServer({ notes: 5 });
    render(<SetupScreen />);
    await user.type(screen.getByLabelText('Adresse du serveur'), 'https://unlease.test');
    await user.type(screen.getByLabelText('Jeton'), 'bon-jeton');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    await screen.findByRole('heading', { name: 'Apparence' });
    expect(screen.queryByRole('heading', { name: 'Vos données' })).not.toBeInTheDocument();
  });
});

describe('Réglages › Données', () => {
  it('opens with the import and ends with « Effacer des données »', async () => {
    render(<SettingsScreen />);
    expect(screen.getByRole('button', { name: /^Importer/ })).toHaveTextContent('L’export de Google Keep');
    expect(screen.getByRole('button', { name: /^Effacer des données/ })).toBeInTheDocument();
  });
});

describe('« Effacer des données »', () => {
  it('without a server: every part holding something ticked, the word asked, then one batch', async () => {
    const user = userEvent.setup();
    render(<EraseScreen />);
    expect(screen.getByRole('checkbox', { name: /^Notes/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: /^Labels/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('checkbox', { name: /^Labels/ })).toHaveTextContent('Rien à effacer');
    expect(screen.queryByLabelText('Jeton du serveur')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /^Collections/ }));
    expect(screen.getByRole('button', { name: /^Effacer 12.éléments$/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Effacer 12.éléments$/ }));
    expect(await screen.findByText('Tapez SUPPRIMER pour confirmer.')).toBeInTheDocument();
    expect(stand.erased).toEqual([]);
    await user.type(screen.getByLabelText('Pour confirmer, tapez SUPPRIMER'), 'supprimer');
    await user.click(screen.getByRole('button', { name: /^Effacer 12.éléments$/ }));
    expect(await screen.findByText('Tapez SUPPRIMER en capitales.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Pour confirmer, tapez SUPPRIMER'));
    await user.type(screen.getByLabelText('Pour confirmer, tapez SUPPRIMER'), 'SUPPRIMER');
    await user.click(screen.getByRole('button', { name: /^Effacer 12.éléments$/ }));
    await waitFor(() => expect(stand.erased).toEqual([['notes']]));
  });

  it('nothing ticked says so, and erases nothing', async () => {
    const user = userEvent.setup();
    render(<EraseScreen />);
    await user.click(screen.getByRole('checkbox', { name: /^Notes/ }));
    await user.click(screen.getByRole('checkbox', { name: /^Collections/ }));
    await user.type(screen.getByLabelText('Pour confirmer, tapez SUPPRIMER'), 'SUPPRIMER');
    await user.click(screen.getByRole('button', { name: /^Effacer$/ }));
    expect(await screen.findByText('Cochez au moins une partie à effacer.')).toBeInTheDocument();
    expect(stand.erased).toEqual([]);
  });

  it('with a server: the token typed again and checked by it, a wrong one said under the field, then the backup first', async () => {
    const user = userEvent.setup();
    const server = fakeServer({ notes: 12, backup: true });
    act(() => setServer({ url: 'https://unlease.test', token: 'bon-jeton' }));
    setServerSettings(settingsView(S3, true));
    render(<EraseScreen />);
    expect(screen.getByRole('switch', { name: /Sauvegarder avant d’effacer/ })).toHaveAttribute('aria-checked', 'true');
    await user.type(screen.getByLabelText('Jeton du serveur'), 'mauvais');
    await user.type(screen.getByLabelText('Pour confirmer, tapez SUPPRIMER'), 'SUPPRIMER');
    await user.click(screen.getByRole('button', { name: /^Effacer 55.éléments$/ }));
    expect(await screen.findByText('Jeton refusé par le serveur')).toBeInTheDocument();
    expect(stand.erased).toEqual([]);
    await user.clear(screen.getByLabelText('Jeton du serveur'));
    await user.type(screen.getByLabelText('Jeton du serveur'), 'bon-jeton');
    await user.click(screen.getByRole('button', { name: /^Effacer 55.éléments$/ }));
    await waitFor(() => expect(stand.erased).toEqual([['collections', 'notes']]));
    expect(server.backups()).toBe(1);
    expect(useSettingsStore.getState().server?.token).toBe('bon-jeton');
  });
});
