/**
 * The Administration against a stand-in server: what it sends when S3 is changed, when a snapshot
 * is restored, and when Seafile is turned off; and the other services' sheets, from the settings.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { formatMoment } from '@unlease/core/services/admin';
import { PALETTE_COLORS } from '@unlease/design/appearance';
import type { AdminStatus } from '@unlease/core/sync/admin';
import type { ServerSettings } from '@unlease/core/sync/settings';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { resetBootstrap } from '@app/bootstrap';
import { resetLibrary } from '@app/store/libraryStore';
import { setLookShareOpen, setServicesCssOpen, useUiStore } from '@shared/app/store/uiStore';
import { setAppearance, useSettingsStore } from '@shared/app/store/settingsStore';
import { AppProviders } from '@app/providers/AppProviders';
import { navigationRef } from '@ui/navigation/navigationRef';

import { state as clipboard } from '../../../../../shared/__mocks__/NativeUnleaseClipboard';
import { __reset as resetMedia, state as media } from '../../../../../shared/__mocks__/NativeMedia';

jest.useFakeTimers();

const SNAPSHOT_AT = Date.UTC(2026, 9, 26, 3, 0, 0);

const SETTINGS: ServerSettings = {
  apps: { enabled: ['notes', 'pages'] },
  setup: { done: true },
  analysis: { enabled: false, keySource: null, keyHint: null, model: 'claude-opus-5-5', budgetUsd: 15 },
  pages: { enabled: false, everywhere: true, web: true, reach: 'medium' },
  backup: { configured: true, endpoint: 'https://s3.fr-par.scw.cloud', region: 'fr-par', bucket: 'ancien', prefix: 'carnet/', accessKeyId: 'SCWKEY', secretHint: '…k3Xq', recurrence: 'daily', keep: 30, storageClass: 'STANDARD' },
  drive: { provider: 'seafile', url: 'https://drive.exemple.fr', folder: '/Carnet', library: 'Documents', tokenHint: '…ab12', leaving: false },
  calendar: { holidays: { country: null, region: null }, publishPath: null, ask: false },
  seerr: { url: '', keyHint: null },
  immich: { url: '', keyHint: null },
};

function status(notes: number, restoring = false): AdminStatus {
  return {
    server: { version: '0.1.0', notes, pages: 0, contacts: 0, events: 0, files: 2, fileBytes: 2048 },
    backup: { running: false, last: null, lastSuccessAt: null, nextAt: null },
    drive: { running: false, files: 2, bytes: 2048, waiting: 0, lastPassAt: null, error: null },
    restore: { running: restoring, startedAt: restoring ? Date.now() : null, finishedAt: null, error: null, report: null, thawing: false },
  };
}

interface Call {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

let calls: Call[] = [];
const notes = 3;
let settings: ServerSettings = SETTINGS;

const answer = (body: unknown, code = 200) => ({ ok: code < 400, status: code, headers: { get: () => null }, json: async () => body });

/** The server's routes, as the Administration uses them; a sync waits forever (no records come). */
function fakeFetch(input: string, init?: { method?: string; body?: unknown }) {
  const url = new URL(input);
  const method = init?.method ?? 'GET';
  const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null;
  calls.push({ method, path: `${url.pathname}${url.search}`, body });
  if (url.pathname === '/api/sync') return new Promise(() => {});
  if (url.pathname === '/api/health') return Promise.resolve(answer({ ok: true, analysis: false, version: '0.1.0' }));
  if (url.pathname === '/api/settings' && method === 'PUT' && Array.isArray((body as { apps?: unknown })?.apps)) {
    settings = { ...settings, apps: { enabled: (body as { apps: ServerSettings['apps']['enabled'] }).apps } };
    return Promise.resolve(answer(settings));
  }
  if (url.pathname === '/api/settings') return Promise.resolve(answer(settings));
  if (url.pathname === '/api/usage') return Promise.resolve(answer({}));
  if (url.pathname === '/api/admin') return Promise.resolve(answer(status(notes)));
  if (url.pathname === '/api/admin/backups') return Promise.resolve(answer({ snapshots: [{ name: 'carnet-2026-10-26T03-00-00Z.tar.gz', at: SNAPSHOT_AT, bytes: 1200 }] }));
  if (url.pathname === '/api/admin/restore') return Promise.resolve(answer(status(notes, true), 202));
  return Promise.resolve(answer({ error: 'not found' }, 404));
}

let mounted: ReactTestRenderer | null = null;

/** The Administration's home, or one of its sections. */
async function openAdmin(section?: string): Promise<ReactTestRenderer> {
  const previous = mounted;
  if (previous) await act(async () => previous.unmount());
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'admin.sqlite' });
  writePreference('onboarded', true);
  writePreference('server', { url: 'https://carnet.test', token: 'jeton' });
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<AppProviders />);
  });
  await act(async () => {
    (navigationRef.navigate as (...args: unknown[]) => void)('Admin', section ? { section } : undefined);
    jest.advanceTimersByTime(400);
  });
  await settle();
  mounted = tree;
  return tree;
}

async function settle(): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
}

/** Pressable things by their accessible name, outermost first, in the order drawn. */
function pressables(tree: ReactTestRenderer, label: string): ReactTestInstance[] {
  return tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function', { deep: false });
}

async function press(node: ReactTestInstance | undefined): Promise<void> {
  expect(node).toBeDefined();
  await act(async () => {
    node!.props.onPress();
  });
  await settle();
}

beforeEach(() => {
  calls = [];
  settings = SETTINGS;
  global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
});

describe('the Administration', () => {
  it('sends only the S3 fields that changed, tried by the server', async () => {
    const tree = await openAdmin('backup');
    const bucket = tree.root.findAll(node => node.type === TextInput && node.props.value === 'ancien')[0]!;
    await act(async () => {
      bucket.props.onChangeText('nouveau');
    });
    // The S3 section alone on its screen.
    expect(pressables(tree, 'Tester et enregistrer')).toHaveLength(1);
    await press(pressables(tree, 'Tester et enregistrer')[0]);
    const put = calls.find(call => call.method === 'PUT' && call.path === '/api/settings');
    expect(put?.body).toEqual({ backup: { bucket: 'nouveau' } });
  });

  it('asks how to restore a snapshot on a server that holds notes, and sends the choice', async () => {
    const tree = await openAdmin('backup');
    await press(pressables(tree, formatMoment(SNAPSHOT_AT, Date.now()))[0]);
    await press(pressables(tree, 'Restaurer')[0]);
    await press(pressables(tree, 'Revenir à la sauvegarde')[0]);
    const confirm = pressables(tree, 'Restaurer');
    await press(confirm[confirm.length - 1]);
    const restore = calls.find(call => call.path.startsWith('/api/admin/restore'));
    expect(restore).toMatchObject({ method: 'POST', path: '/api/admin/restore?mode=rollback', body: { snapshot: 'carnet-2026-10-26T03-00-00Z.tar.gz' } });
  });

  it('turns Seafile off only once confirmed', async () => {
    const tree = await openAdmin('drive');
    await press(pressables(tree, 'Désactiver Seafile')[0]);
    expect(calls.some(call => call.method === 'PUT')).toBe(false);
    await press(pressables(tree, 'Désactiver')[0]);
    const put = calls.find(call => call.method === 'PUT' && call.path === '/api/settings');
    expect(put?.body).toEqual({ drive: null });
  });

  it('lists its sections on its home, each with its state, every app’s first, then Carnet’s, and opens each on its own screen', async () => {
    const tree = await openAdmin();
    const text = textOf(tree);
    // In this order, each after the one before (the board lies under it in the stack).
    let at = 0;
    for (const words of ['Pour toutes les applications', 'Applications', 'Serveur', 'Claude', 'Sauvegarde sur S3', 'Fichiers sur Seafile', 'Carnet', 'Seerr']) {
      at = text.indexOf(words, at);
      expect(at).toBeGreaterThanOrEqual(0);
    }
    expect(pressables(tree, 'Seerr')[0]!.props.accessibilityValue).toEqual({ text: 'Seerr non relié · Le module Seerr n’apparaît qu’une fois relié.' });
    await press(pressables(tree, 'Seerr')[0]);
    expect(navigationRef.getCurrentRoute()).toMatchObject({ name: 'Admin', params: { section: 'seerr' } });
    expect(textOf(tree)).toContain('Adresse de Seerr');
  });

  it('leaves the other services’ sheets out of its sections', async () => {
    const tree = await openAdmin();
    expect(tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Copier le CSS'))).toHaveLength(0);
  });

  it('is one tap away from the settings', async () => {
    await openAdmin();
    await act(async () => {
      (navigationRef.navigate as (...args: unknown[]) => void)('Settings');
      jest.advanceTimersByTime(400);
    });
    // The settings' row, drawn last (the drawer under the board has one too).
    const rows = pressables(mounted!, 'Administration');
    await press(rows[rows.length - 1]);
    expect(navigationRef.getCurrentRoute()?.name).toBe('Admin');
  });
});

const puts = () => calls.filter(call => call.method === 'PUT' && call.path === '/api/settings').map(call => call.body);
const textOf = (tree: ReactTestRenderer): string => {
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') parts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'children' in node) walk((node as { children: unknown }).children);
  };
  walk(tree.toJSON());
  return parts.join(' ');
};

describe('the apps the server runs', () => {
  it('come first, each ready one with its switch', async () => {
    const tree = await openAdmin('apps');
    expect(pressables(tree, 'Carnet')).toHaveLength(1);
    expect(pressables(tree, 'Pages')).toHaveLength(1);
    expect(pressables(tree, 'Agenda')).toHaveLength(1);
    await press(pressables(tree, 'Pages')[0]);
    expect(puts()).toEqual([{ apps: ['notes'] }]);
    // The web's words: what an app off keeps.
    expect(useUiStore.getState().snack?.message).toBe('Pages désactivé : ses données sont gardées');
    // The last one on stays on.
    expect(pressables(tree, 'Carnet')[0]!.props.disabled).toBe(true);
  });

  it('turns this app off only once confirmed, then says so over everything, and « Activer Carnet » brings it back', async () => {
    const tree = await openAdmin('apps');
    await press(pressables(tree, 'Carnet')[0]);
    expect(puts()).toEqual([]);
    await press(pressables(tree, 'Désactiver')[0]);
    expect(puts()).toEqual([{ apps: ['pages'] }]);
    expect(textOf(tree)).toContain('Carnet n’est pas activé sur ce serveur');
    await press(pressables(tree, 'Activer Carnet')[0]);
    expect(puts()).toEqual([{ apps: ['pages'] }, { apps: ['pages', 'notes'] }]);
    expect(textOf(tree)).not.toContain('Carnet n’est pas activé sur ce serveur');
  });

  it('says so at start when the server does not run Carnet', async () => {
    settings = { ...SETTINGS, apps: { enabled: ['pages'] } };
    const tree = await openAdmin();
    // Heard from the server as the sync started.
    expect(textOf(tree)).toContain('Carnet n’est pas activé sur ce serveur');
    expect(textOf(tree)).toContain('Votre serveur ne fait pas tourner Carnet pour l’instant.');
  });
});

describe('the other services’ sheets', () => {
  /** Réglages' « Apparence » page, where the ground's foot leads to them. */
  async function openSettings(): Promise<ReactTestRenderer> {
    const tree = await openAdmin();
    await act(async () => {
      (navigationRef.navigate as (...args: unknown[]) => void)('Appearance');
      jest.advanceTimersByTime(400);
    });
    await settle();
    return tree;
  }

  it('open from the ground, and copy one', async () => {
    const tree = await openSettings();
    await press(pressables(tree, 'Habiller vos autres services…')[0]);
    expect(useUiStore.getState().servicesCssOpen).toBe(true);
    await press(pressables(tree, 'Copier le CSS pour Seafile')[0]);
    expect(clipboard.text).toContain('[data-bs-theme="dark"] {');
    expect(useUiStore.getState().snack).toMatchObject({ tone: 'success', message: 'CSS pour Seafile copié' });
    await act(async () => setServicesCssOpen(false));
  });

  it('save Seafile’s pictures through Android’s save screen, and say so once saved', async () => {
    resetMedia();
    const tree = await openSettings();
    await press(pressables(tree, 'Habiller vos autres services…')[0]);
    await press(pressables(tree, 'Enregistrer le logo pour Seafile')[0]);
    expect(media.saved.map(file => [file.name, file.mime])).toEqual([['seafile-logo.png', 'image/png']]);
    // A PNG's signature, in base64.
    expect(media.saved[0]!.base64.startsWith('iVBORw0KGgo')).toBe(true);
    expect(useUiStore.getState().snack).toMatchObject({ tone: 'success', message: 'Logo pour Seafile enregistré' });
    // Cancelled on the save screen: nothing to say.
    media.nextSave = { status: 'cancelled', message: '' };
    useUiStore.setState({ snack: null });
    await press(pressables(tree, 'Enregistrer le favicon pour Seafile')[0]);
    expect(media.saved[1]).toMatchObject({ name: 'seafile-favicon.ico', mime: 'image/x-icon' });
    expect(useUiStore.getState().snack).toBeNull();
    await act(async () => setServicesCssOpen(false));
  });

  it('are pointed to once the colours change and stay put, once a session', async () => {
    await openSettings();
    useUiStore.setState({ snack: null });
    await act(async () => setAppearance({ ...useSettingsStore.getState().appearance, ...PALETTE_COLORS.myrtille }));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(useUiStore.getState().snack).toBeNull();
    // The look's own slip comes first (it is this app's, the others can take it); the services' waits for it to go.
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Apparence changée dans Carnet', action: { label: 'Appliquer aux autres' } });
    await act(async () => {
      useUiStore.getState().snack!.action!.run();
      useUiStore.setState({ snack: null });
    });
    expect(useUiStore.getState().lookShareOpen).toBe(true);
    await act(async () => {
      setLookShareOpen(false);
      jest.advanceTimersByTime(300);
    });
    const snack = useUiStore.getState().snack;
    expect(snack).toMatchObject({ message: 'Seafile, Seerr et Immich peuvent aussi prendre ces couleurs.', action: { label: 'Voir' } });
    await act(async () => snack!.action!.run());
    expect(useUiStore.getState().servicesCssOpen).toBe(true);
    await act(async () => {
      setServicesCssOpen(false);
      useUiStore.setState({ snack: null });
      setAppearance({ ...useSettingsStore.getState().appearance, ...PALETTE_COLORS.pivoine });
      jest.advanceTimersByTime(2000);
    });
    expect(useUiStore.getState().snack).toBeNull();
  });
});
