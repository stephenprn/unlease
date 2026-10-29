import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import type { AdminStatus } from '@unlease/core/sync/admin';
import { PALETTE_COLORS } from '@unlease/design/appearance';
import type { BackupSettings, DriveSettings, SeerrSettings, ServerSettings } from '@unlease/core/sync/settings';

import { freshLibrary } from '../../test/library';
import { setAppearance, setServer, useSettingsStore } from '../../app/store/settings';
import { setServicesCssOpen, useUiStore } from '../../app/store/ui';
import { stopSync } from '../../app/sync/loop';
import { ServicesCssDialog } from '../features/appearance/ServicesCssDialog';
import { AdminScreen } from '../screens/AdminScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { initHistory } from '../router';

const SERVER = { url: 'https://carnet.test', token: 'jeton' };
const ANALYSIS: ServerSettings['analysis'] = { enabled: true, keySource: 'app', keyHint: '…k3Xq', model: 'claude-opus-5-5', budgetUsd: 15 };
const S3: BackupSettings = {
  configured: true,
  endpoint: 'https://s3.fr-par.scw.cloud',
  region: 'fr-par',
  bucket: 'sauvegardes',
  prefix: 'notes/',
  accessKeyId: 'SCWACCESSKEY',
  secretHint: '…9f2c',
  recurrence: 'daily',
  keep: 30,
};
const NO_DRIVE: DriveSettings = { provider: null, url: '', folder: '/Notes', library: null, tokenHint: null, leaving: false };
const SEAFILE: DriveSettings = { provider: 'seafile', url: 'https://drive.test', folder: '/Notes', library: 'Documents', tokenHint: '…ab12', leaving: false };

const idle = (notes: number, pages: number): AdminStatus => ({
  server: { version: '0.1.0', notes, pages, files: 3, fileBytes: 2_048 },
  backup: { running: false, last: null, lastSuccessAt: null, nextAt: null },
  drive: { running: false, files: 3, bytes: 2_048, waiting: 0, lastPassAt: null, error: null },
  restore: { running: false, startedAt: null, finishedAt: null, error: null, report: null },
});

const SNAPSHOT = 'carnet-2026-10-25T03-00-00Z.tar.gz';

const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

interface Sent {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

/** A server in a function: settings that PUT changes, the status, the snapshots, restores; `refuse` answers the next PUT with an error. */
function fakeServer({ backup = S3, drive = NO_DRIVE, notes = 5, pages = 2 }: { backup?: BackupSettings; drive?: DriveSettings; notes?: number; pages?: number } = {}) {
  const state = { backup, drive, seerr: { url: '', keyHint: null } as SeerrSettings, refuse: null as { status: number; error: string } | null };
  const sent: Sent[] = [];
  const view = (): ServerSettings => ({ analysis: ANALYSIS, pages: { enabled: false, everywhere: true, web: true, reach: 'medium' }, backup: state.backup, drive: state.drive, seerr: state.seerr });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const { pathname, search } = new URL(url);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : init?.body;
    sent.push({ method, path: `${pathname}${search}`, body });
    if (pathname === '/api/usage') return json({ monthToDate: { analyses: 0, costUsd: 0 }, total: { analyses: 0, costUsd: 0 }, model: ANALYSIS.model, budgetUsd: 15 });
    if (pathname === '/api/settings' && method === 'PUT') {
      if (state.refuse) {
        const { status, error } = state.refuse;
        state.refuse = null;
        return json({ error }, status);
      }
      const patch = body as { backup?: Partial<BackupSettings> | null; drive?: Partial<DriveSettings> | null; seerr?: { url?: string; apiKey?: string } | null };
      if (patch.seerr === null) state.seerr = { url: '', keyHint: null };
      else if (patch.seerr) state.seerr = { url: patch.seerr.url ?? state.seerr.url, keyHint: patch.seerr.apiKey === undefined ? state.seerr.keyHint : patch.seerr.apiKey ? `…${patch.seerr.apiKey.slice(-4)}` : null };
      if (patch.backup !== undefined) state.backup = patch.backup === null ? { ...state.backup, configured: false } : { ...state.backup, ...patch.backup };
      if (patch.drive === null) state.drive = { ...state.drive, leaving: true };
      return json(view());
    }
    if (pathname === '/api/settings') return json(view());
    if (pathname === '/api/admin') return json(idle(notes, pages));
    if (pathname === '/api/admin/backups') return json({ snapshots: [{ name: SNAPSHOT, at: Date.parse('2026-10-25T03:00:00Z'), bytes: 180_000 }] });
    if (pathname === '/api/admin/restore') return json({ ...idle(notes, pages), restore: { running: true, startedAt: Date.now(), finishedAt: null, error: null, report: null } }, 202);
    return json({ error: 'not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { state, sent, puts: () => sent.filter(request => request.path === '/api/settings' && request.method === 'PUT').map(request => request.body) };
}

describe('the Administration', () => {
  beforeEach(async () => {
    await freshLibrary();
    setServer(SERVER);
  });

  afterEach(() => {
    stopSync();
    vi.unstubAllGlobals();
  });

  it('says what the server holds, under its state', async () => {
    fakeServer();
    render(<AdminScreen />);
    const section = screen.getByRole('region', { name: 'Serveur' });
    expect(await within(section).findByText(/^Version 0\.1\.0 · 5\snotes · 2\spages · 3\sfichiers/)).toBeInTheDocument();
  });

  it('sends only the S3 fields that changed, and shows the server’s refusal', async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    render(<AdminScreen />);
    const section = await screen.findByRole('region', { name: 'Sauvegarde sur S3' });
    const save = within(section).getByRole('button', { name: 'Tester et enregistrer' });
    // Nothing changed yet: the secret already set stays on the server.
    expect(save).toBeDisabled();
    expect(within(section).getByLabelText('Remplacer la clé secrète')).toHaveValue('');
    const bucket = within(section).getByRole('textbox', { name: 'Bucket' });
    expect(bucket).toHaveValue('sauvegardes');
    await user.clear(bucket);
    await user.type(bucket, 'archives');
    server.state.refuse = { status: 502, error: 'S3 injoignable : vérifiez l’adresse du service.' };
    await user.click(save);
    expect(await within(section).findByText('S3 injoignable : vérifiez l’adresse du service.')).toBeInTheDocument();
    await user.click(save);
    await waitFor(() => expect(server.puts().at(-1)).toEqual({ backup: { bucket: 'archives' } }));
    expect(useUiStore.getState().snack?.message).toBe('Stockage S3 enregistré');
    expect(within(section).queryByText('S3 injoignable : vérifiez l’adresse du service.')).not.toBeInTheDocument();
  });

  it('asks for the secret on a first S3, then sends the whole connection', async () => {
    const user = userEvent.setup();
    const server = fakeServer({ backup: { ...S3, configured: false, endpoint: '', region: '', bucket: '', prefix: '', accessKeyId: '', secretHint: null } });
    render(<AdminScreen />);
    const section = await screen.findByRole('region', { name: 'Sauvegarde sur S3' });
    expect(within(section).getByText('Sauvegarde désactivée')).toBeInTheDocument();
    await user.type(within(section).getByRole('textbox', { name: 'Adresse du service' }), 'https://s3.fr-par.scw.cloud');
    // The region follows the address.
    expect(within(section).getByRole('textbox', { name: 'Région' })).toHaveValue('fr-par');
    await user.type(within(section).getByRole('textbox', { name: 'Bucket' }), 'sauvegardes');
    await user.type(within(section).getByRole('textbox', { name: 'Clé d’accès' }), 'SCWACCESSKEY');
    const save = within(section).getByRole('button', { name: 'Tester et enregistrer' });
    expect(save).toBeDisabled();
    await user.type(within(section).getByLabelText('Clé secrète'), 'secret-de-test-123');
    await user.click(save);
    await waitFor(() =>
      expect(server.puts().at(-1)).toEqual({ backup: { endpoint: 'https://s3.fr-par.scw.cloud', region: 'fr-par', bucket: 'sauvegardes', accessKeyId: 'SCWACCESSKEY', secretAccessKey: 'secret-de-test-123' } }),
    );
  });

  it('changes how often the server backs up, at once', async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    render(<AdminScreen />);
    const frequency = await screen.findByRole('radiogroup', { name: 'Fréquence des sauvegardes' });
    expect(within(frequency).getAllByRole('radio').map(radio => radio.textContent)).toEqual(['Jamais', '6 h', 'Jour', 'Semaine']);
    expect(within(frequency).getByRole('radio', { name: 'Jour' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(frequency).getByRole('radio', { name: 'Semaine' }));
    await waitFor(() => expect(server.puts()).toContainEqual({ backup: { recurrence: 'weekly' } }));
  });

  it('restores a snapshot after asking how, on a server that holds notes', async () => {
    const user = userEvent.setup();
    const server = fakeServer({ notes: 5 });
    render(<AdminScreen />);
    await screen.findByText(/^Version 0\.1\.0 · 5\snotes/);
    const list = await screen.findByRole('list', { name: 'Sauvegardes sur S3' });
    await user.click(within(list).getByRole('button', { name: 'Restaurer' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Restaurer cette sauvegarde ?' });
    const ways = within(dialog).getByRole('radiogroup', { name: 'Restauration' });
    expect(within(ways).getByRole('radio', { name: /Compléter/ })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(ways).getByRole('radio', { name: /Revenir à la sauvegarde/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Restaurer' }));
    await waitFor(() => expect(server.sent).toContainEqual({ method: 'POST', path: '/api/admin/restore?mode=rollback', body: { snapshot: SNAPSHOT } }));
    expect(await screen.findByText('Restauration en cours…')).toBeInTheDocument();
  });

  it('restores without asking on a server that holds nothing', async () => {
    const user = userEvent.setup();
    const server = fakeServer({ notes: 0, pages: 0 });
    render(<AdminScreen />);
    // The status must have come: until then the server may hold anything.
    await screen.findByText(/^Version 0\.1\.0 · 0\snote/);
    const list = await screen.findByRole('list', { name: 'Sauvegardes sur S3' });
    await user.click(within(list).getByRole('button', { name: 'Restaurer' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Restaurer cette sauvegarde ?' });
    expect(within(dialog).queryByRole('radiogroup', { name: 'Restauration' })).not.toBeInTheDocument();
    expect(within(dialog).getByText('Ses notes, listes, liens et pages reviennent sur le serveur, puis sur vos appareils.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Restaurer' }));
    await waitFor(() => expect(server.sent).toContainEqual({ method: 'POST', path: '/api/admin/restore?mode=merge', body: { snapshot: SNAPSHOT } }));
  });

  it('turns Seafile off after confirming: the files come back first', async () => {
    const user = userEvent.setup();
    const server = fakeServer({ drive: SEAFILE });
    render(<AdminScreen />);
    const section = await screen.findByRole('region', { name: 'Fichiers sur Seafile' });
    expect(within(section).getByText('« Documents », /Notes')).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Désactiver Seafile' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Désactiver Seafile ?' });
    expect(within(dialog).getByText('Vos fichiers reviennent d’abord sur le serveur, puis Seafile n’est plus utilisé. Ils restent aussi dans votre dossier Seafile.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Désactiver' }));
    await waitFor(() => expect(server.puts().at(-1)).toEqual({ drive: null }));
    expect(await within(section).findByText('Retour des fichiers sur le serveur…')).toBeInTheDocument();
    // While the files come back there is nothing to edit.
    expect(within(section).queryByRole('button', { name: 'Tester et enregistrer' })).not.toBeInTheDocument();
  });

  it('links Seafile with a library token, the folder as written', async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    render(<AdminScreen />);
    const section = await screen.findByRole('region', { name: 'Fichiers sur Seafile' });
    expect(within(section).getByText('Fichiers gardés sur le serveur')).toBeInTheDocument();
    await user.type(within(section).getByRole('textbox', { name: 'Adresse de Seafile' }), 'https://drive.test');
    const save = within(section).getByRole('button', { name: 'Tester et enregistrer' });
    expect(save).toBeDisabled();
    await user.type(within(section).getByLabelText('Jeton de la bibliothèque'), 'jeton-de-bibliotheque');
    await user.click(save);
    await waitFor(() => expect(server.puts().at(-1)).toEqual({ drive: { provider: 'seafile', url: 'https://drive.test', folder: '/Notes', token: 'jeton-de-bibliotheque' } }));
  });

  it('links Seerr with its address and key, then unlinks it after confirming', async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    render(<AdminScreen />);
    const section = await screen.findByRole('region', { name: 'Seerr' });
    expect(within(section).getByText('Seerr non relié')).toBeInTheDocument();
    await user.type(within(section).getByRole('textbox', { name: 'Adresse de Seerr' }), 'https://seerr.test');
    await user.type(within(section).getByLabelText('Clé API (facultative)'), 'cle-api-seerr-1234');
    await user.click(within(section).getByRole('button', { name: 'Tester et enregistrer' }));
    await waitFor(() => expect(server.puts().at(-1)).toEqual({ seerr: { url: 'https://seerr.test', apiKey: 'cle-api-seerr-1234' } }));
    expect(await within(section).findByText('Seerr relié')).toBeInTheDocument();
    // The films and series modules show at once.
    expect(useSettingsStore.getState().seerr).toBe('https://seerr.test');

    await user.click(within(section).getByRole('button', { name: 'Délier Seerr' }));
    await user.click(screen.getByRole('button', { name: 'Délier' }));
    await waitFor(() => expect(server.puts().at(-1)).toEqual({ seerr: null }));
    expect(useSettingsStore.getState().seerr).toBe('');
  });

  it('shows only the server and Claude without a server', () => {
    setServer(null);
    render(<AdminScreen />);
    expect(screen.getByRole('region', { name: 'Serveur' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Lecture des liens par Claude' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Sauvegarde sur S3' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Fichiers sur Seafile' })).not.toBeInTheDocument();
  });
});

describe('the settings', () => {
  beforeEach(async () => {
    await freshLibrary();
    history.replaceState(null, '', '/settings');
    initHistory();
  });

  it('lead to the Administration, which holds the server and Claude now', async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);
    expect(screen.queryByRole('region', { name: 'Serveur' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Lecture des liens par Claude' })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('region', { name: 'Administration' })).getByRole('button', { name: /^Administration/ }));
    expect(location.pathname).toBe('/admin');
  });

  it('open the other services’ sheets from the ground, and copy one', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    onTestFinished(() => void delete (navigator as { clipboard?: unknown }).clipboard);
    render(
      <>
        <SettingsScreen />
        <ServicesCssDialog />
      </>,
    );
    await user.click(within(screen.getByRole('region', { name: 'Fond' })).getByRole('button', { name: 'Habiller vos autres services…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Habiller vos autres services' });
    expect(within(dialog).getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual(['Seafile', 'Seerr', 'Immich']);
    const seafile = within(dialog).getByRole('region', { name: 'Seafile' });
    // The sheet is shown as it is copied, to select by hand where there is no clipboard.
    expect((within(seafile).getByRole('textbox') as HTMLTextAreaElement).value).toContain('[data-bs-theme="dark"] {');
    await user.click(within(seafile).getByRole('button', { name: 'Copier' }));
    await waitFor(() => expect(useUiStore.getState().snack).toMatchObject({ tone: 'success', message: 'CSS pour Seafile copié' }));
    expect(writeText.mock.calls[0]![0]).toBe((within(seafile).getByRole('textbox') as HTMLTextAreaElement).value);
  });

  it('say when the browser refuses the clipboard', async () => {
    const user = userEvent.setup();
    // The clipboard refuses (over user-event's own stub), and jsdom has no `execCommand` to fall back on.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => Promise.reject(new Error('refused')) }, configurable: true });
    onTestFinished(() => void delete (navigator as { clipboard?: unknown }).clipboard);
    setServicesCssOpen(true);
    onTestFinished(() => setServicesCssOpen(false));
    render(<ServicesCssDialog />);
    await user.click(within(screen.getByRole('region', { name: 'Immich' })).getByRole('button', { name: 'Copier' }));
    await waitFor(() => expect(useUiStore.getState().snack).toMatchObject({ tone: 'error', message: 'Impossible de copier le CSS' }));
  });

  it('download Seafile’s pictures, and only Seafile’s', async () => {
    const user = userEvent.setup();
    const made: Blob[] = [];
    const downloaded: string[] = [];
    const objectUrl = vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
      made.push(blob as Blob);
      return `blob:picture/${made.length}`;
    });
    onTestFinished(() => objectUrl.mockRestore());
    // A download link's click goes nowhere in jsdom: what it would save is noted instead.
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded.push(this.download);
    });
    onTestFinished(() => click.mockRestore());
    setServicesCssOpen(true);
    onTestFinished(() => setServicesCssOpen(false));
    render(<ServicesCssDialog />);
    const seafile = screen.getByRole('region', { name: 'Seafile' });
    expect(within(seafile).getAllByRole('button').map(button => button.textContent)).toEqual(['Copier', 'Logo', 'Favicon', 'Fond de connexion']);
    expect(within(screen.getByRole('region', { name: 'Immich' })).queryByRole('button', { name: 'Logo' })).not.toBeInTheDocument();
    await user.click(within(seafile).getByRole('button', { name: 'Logo' }));
    await waitFor(() => expect(downloaded).toEqual(['seafile-logo.png']));
    expect(made[0]!.type).toBe('image/png');
    expect([...new Uint8Array(await made[0]!.arrayBuffer()).subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
  });

  it('point to the sheets once the colours change and stay put, once a session', () => {
    vi.useFakeTimers();
    onTestFinished(() => void vi.useRealTimers());
    useUiStore.setState({ snack: null });
    render(<SettingsScreen />);
    act(() => setAppearance({ ...useSettingsStore.getState().appearance, ...PALETTE_COLORS.myrtille }));
    act(() => void vi.advanceTimersByTime(1000));
    expect(useUiStore.getState().snack).toBeNull();
    act(() => void vi.advanceTimersByTime(600));
    const snack = useUiStore.getState().snack;
    expect(snack).toMatchObject({ message: 'Seafile, Seerr et Immich peuvent aussi prendre ces couleurs.', action: { label: 'Voir' } });
    act(() => snack!.action!.run());
    expect(useUiStore.getState().servicesCssOpen).toBe(true);
    act(() => {
      setServicesCssOpen(false);
      useUiStore.setState({ snack: null });
      setAppearance({ ...useSettingsStore.getState().appearance, ...PALETTE_COLORS.pivoine });
      vi.advanceTimersByTime(2000);
    });
    expect(useUiStore.getState().snack).toBeNull();
  });
});
