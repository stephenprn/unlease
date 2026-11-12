/**
 * The first run against a stand-in server: connecting (a refusal said under the field it concerns,
 * or a sibling app's connection in one tap), « Vos applications » on a server still to set up
 * (Carnet locked on, Pages ticked or not and saved at once, the announced ones not tickable), "Votre
 * serveur" (S3 from Scaleway in Paris, the newest snapshot brought back, a row left for later), the
 * appearance (kept as it comes, chosen, or a sibling's), « Commencer » marking the server set up; a
 * server already set up joined straight from the appearance, resuming mid-setup; and a phone that
 * keeps everything here, choosing its colours and its ground.
 */
import React from 'react';
import { BackHandler, TextInput } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { DEFAULT_APPEARANCE, PALETTE_COLORS } from '@unlease/design/appearance';
import { restoreSummary } from '@unlease/core/services/admin';
import { keepImportAction } from '@unlease/notes/services/keepImport';
import type { AdminStatus, RestoreReport } from '@unlease/core/sync/admin';
import type { ServerSettings } from '@unlease/core/sync/settings';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';
import { resetBootstrap } from '@app/bootstrap';
import { resetLibrary, useLibraryStore } from '@app/store/libraryStore';
import { useSettingsStore } from '@shared/app/store/settingsStore';
import { AppProviders } from '@app/providers/AppProviders';
import { navigationRef } from '@ui/navigation/navigationRef';

import { state as media, __reset as resetMedia } from '../../../../../shared/__mocks__/NativeMedia';
import { state as suite, __reset as resetSuite } from '../../../../../shared/__mocks__/NativeSuiteLink';

jest.useFakeTimers();

const NEWEST = 'carnet-2026-10-26T03-00-00Z.tar.gz';
const OLDER = 'carnet-2026-10-25T03-00-00Z.tar.gz';

const UNSET: ServerSettings = {
  apps: { enabled: ['notes'] },
  setup: { done: false },
  analysis: { enabled: false, keySource: null, keyHint: null, model: 'claude-opus-5-5', budgetUsd: 15 },
  pages: { enabled: false, everywhere: true, web: true, reach: 'medium' },
  backup: { configured: false, endpoint: '', region: '', bucket: '', prefix: '', accessKeyId: '', secretHint: null, recurrence: 'off', keep: 30, storageClass: 'STANDARD' },
  drive: { provider: null, url: '', folder: '', library: null, tokenHint: null, leaving: false },
  calendar: { holidays: { country: null, region: null }, publishPath: null, ask: false },
  seerr: { url: '', keyHint: null },
};

interface Server {
  settings: ServerSettings;
  notes: number;
  restoring: boolean;
  report: RestoreReport | null;
}

let server: Server;

function status(): AdminStatus {
  return {
    server: { version: '0.1.0', notes: server.notes, pages: 0, contacts: 0, events: 0, files: 0, fileBytes: 0 },
    backup: { running: false, last: null, lastSuccessAt: null, nextAt: null },
    drive: { running: false, files: 0, bytes: 0, waiting: 0, lastPassAt: null, error: null },
    restore: { running: server.restoring, startedAt: null, finishedAt: null, error: null, report: server.report, thawing: false },
  };
}

interface Call {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

let calls: Call[] = [];

const answer = (body: unknown, code = 200) => ({ ok: code < 400, status: code, headers: { get: () => null }, json: async () => body });

/** The server's routes, as the setup uses them; a sync waits forever (no records come). */
function fakeFetch(input: string, init?: { method?: string; body?: unknown }) {
  const url = new URL(input);
  const method = init?.method ?? 'GET';
  const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
  calls.push({ method, path: `${url.pathname}${url.search}`, body });
  if (url.pathname === '/api/sync') return new Promise(() => {});
  if (url.pathname === '/api/health') return Promise.resolve(answer({ ok: true, analysis: false, version: '0.1.0', apps: server.settings.apps.enabled, setup: server.settings.setup.done }));
  if (url.pathname === '/api/settings' && method === 'PUT') {
    if (Array.isArray(body?.apps)) server.settings = { ...server.settings, apps: { enabled: body.apps as ServerSettings['apps']['enabled'] } };
    if (body?.setupDone === true) server.settings = { ...server.settings, setup: { done: true } };
    if (body?.backup) {
      const patch = body.backup as Partial<ServerSettings['backup']> & { secretAccessKey?: string };
      const { secretAccessKey, ...fields } = patch;
      server.settings = { ...server.settings, backup: { ...server.settings.backup, ...fields, configured: true, secretHint: `…${secretAccessKey?.slice(-4)}`, recurrence: 'daily' } };
    }
    return Promise.resolve(answer(server.settings));
  }
  if (url.pathname === '/api/settings') return Promise.resolve(answer(server.settings));
  if (url.pathname === '/api/usage') return Promise.resolve(answer({}));
  if (url.pathname === '/api/admin') return Promise.resolve(answer(status()));
  if (url.pathname === '/api/admin/backups') {
    return Promise.resolve(answer({ snapshots: [{ name: NEWEST, at: Date.UTC(2026, 9, 26, 3), bytes: 1200 }, { name: OLDER, at: Date.UTC(2026, 9, 25, 3), bytes: 1100 }] }));
  }
  if (url.pathname === '/api/admin/restore') {
    server.restoring = true;
    return Promise.resolve(answer(status(), 202));
  }
  return Promise.resolve(answer({ error: 'not found' }, 404));
}

/** Android's Back, to the listeners registered last first, as the platform does. */
let backs: Parameters<typeof BackHandler.addEventListener>[1][] = [];
async function pressBack(): Promise<boolean> {
  let handled = false;
  await act(async () => {
    handled = [...backs].reverse().some(handler => handler(undefined as never) === true);
  });
  await settle();
  return handled;
}

let mounted: ReactTestRenderer | null = null;

async function boot(connected: boolean): Promise<ReactTestRenderer> {
  const previous = mounted;
  if (previous) await act(async () => previous.unmount());
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'setup.sqlite' });
  if (connected) writePreference('server', { url: 'https://carnet.test', token: 'jeton' });
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<AppProviders />);
  });
  await settle();
  mounted = tree;
  return tree;
}

async function settle(ms = 400): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

function textOf(tree: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') parts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'children' in node) walk((node as { children: unknown }).children);
  };
  walk(tree.toJSON());
  return parts.join(' ');
}

/** Pressable things by their accessible name, outermost first, in the order drawn. */
function pressables(tree: ReactTestRenderer, label: string): ReactTestInstance[] {
  return tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function', { deep: false });
}

async function press(tree: ReactTestRenderer, label: string): Promise<void> {
  const node = pressables(tree, label)[0];
  expect(node).toBeDefined();
  await act(async () => {
    node!.props.onPress();
  });
  await settle();
}

const fields = (tree: ReactTestRenderer) => tree.root.findAllByType(TextInput);

async function type(field: ReactTestInstance, text: string): Promise<void> {
  await act(async () => {
    field.props.onChangeText(text);
  });
}

beforeEach(() => {
  calls = [];
  backs = [];
  resetMedia();
  resetSuite();
  server = { settings: UNSET, notes: 0, restoring: false, report: null };
  global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    backs.push(handler);
    return { remove: () => (backs = backs.filter(each => each !== handler)) };
  });
});

const puts = () => calls.filter(call => call.method === 'PUT' && call.path === '/api/settings').map(call => call.body);

async function connect(tree: ReactTestRenderer, address = 'carnet.test'): Promise<void> {
  const [field, token] = fields(tree);
  await type(field!, address);
  await type(token!, 'jeton');
  await press(tree, 'Se connecter');
}

describe('the first run', () => {
  it('sets a new server up: its apps, then its list (S3 from Scaleway in Paris, the newest snapshot restored), the appearance, then the board', async () => {
    const tree = await boot(false);
    // Each field says where its value comes from.
    expect(textOf(tree)).toContain('La valeur de UNLEASE_TOKEN');
    await connect(tree);
    expect(useSettingsStore.getState().server).toEqual({ url: 'https://carnet.test', token: 'jeton' });
    // Not onboarded until the end.
    expect(useSettingsStore.getState().onboarded).toBe(false);

    // The server's apps first: Carnet is this app, locked on; the others ticked or not. The head says whose setup it is, as on the web.
    expect(textOf(tree)).toContain('Mise en route · Étape 2 sur 5');
    expect(textOf(tree)).toContain('Vos applications');
    const carnet = pressables(tree, 'Carnet');
    expect(carnet).toHaveLength(0);
    expect(textOf(tree)).toContain('Cette application');
    expect(pressables(tree, 'Agenda')).toHaveLength(1);
    await press(tree, 'Pages');
    expect(puts()).toContainEqual({ apps: ['notes', 'pages'] });
    await press(tree, 'Continuer');

    expect(textOf(tree)).toContain('Étape 3 sur 5');
    expect(textOf(tree)).toContain('Votre serveur');
    // On a server that held nothing, bringing a backup back comes first; every row waits to be opened.
    for (const row of ['Retrouver vos données', 'Claude', 'Sauvegarde sur S3', 'Fichiers sur Seafile', 'Films et séries avec Seerr']) expect(pressables(tree, row)).toHaveLength(1);
    expect(textOf(tree).indexOf('Retrouver vos données')).toBeLessThan(textOf(tree).indexOf('Sauvegarde sur S3'));

    await press(tree, 'Sauvegarde sur S3');
    // No snapshot list, download or archive restore in the setup.
    expect(textOf(tree)).not.toContain('Télécharger une sauvegarde complète');
    // Scaleway in Paris to start with; another address names its own region.
    const [endpoint, region, bucket, prefix, accessKey, secret] = fields(tree);
    expect(endpoint!.props.value).toBe('https://s3.fr-par.scw.cloud');
    expect(region!.props.value).toBe('fr-par');
    expect(prefix!.props.value).toBe('unlease');
    await type(endpoint!, 'https://s3.eu-west-3.amazonaws.com');
    expect(fields(tree)[1]!.props.value).toBe('eu-west-3');
    await type(bucket!, 'sauvegardes');
    await type(accessKey!, 'AKIA');
    await type(secret!, 'secret-k3Xq');
    expect(pressables(tree, 'Plus tard')).toHaveLength(1);
    await press(tree, 'Tester et enregistrer');
    expect(puts()).toContainEqual({
      backup: { endpoint: 'https://s3.eu-west-3.amazonaws.com', region: 'eu-west-3', bucket: 'sauvegardes', prefix: 'unlease', accessKeyId: 'AKIA', secretAccessKey: 'secret-k3Xq' },
    });

    // Back on the list, the row says what it holds now.
    await press(tree, 'Continuer');
    expect(textOf(tree)).toContain('sauvegardes/unlease · chaque jour');

    await press(tree, 'Retrouver vos données');
    await press(tree, 'Restaurer cette sauvegarde');
    const restore = calls.find(call => call.path.startsWith('/api/admin/restore'));
    expect(restore).toMatchObject({ method: 'POST', path: '/api/admin/restore?mode=merge', body: { snapshot: NEWEST } });
    expect(textOf(tree)).toContain('Restauration en cours…');
    // While it runs, the setup holds still.
    expect(pressables(tree, 'Plus tard')[0]!.props.disabled).toBe(true);

    server.restoring = false;
    server.notes = 12;
    server.report = { mode: 'merge', source: NEWEST, records: 12, files: 3, missingFiles: 0, needDrive: 0, coldFiles: 0 };
    await settle(3_000);
    expect(textOf(tree)).toContain(restoreSummary(server.report));
    await press(tree, 'Continuer');
    expect(textOf(tree)).toContain('Votre serveur');

    // A row opened, Back goes to the list, not out of the app; Claude's form says what each app on asks of it.
    await press(tree, 'Claude');
    expect(textOf(tree)).toContain('Carnet : chaque lien enregistré est lu');
    expect(textOf(tree)).toContain('Pages : des questions sur vos pages');
    expect(await pressBack()).toBe(true);
    expect(pressables(tree, 'Sauvegarde sur S3')).toHaveLength(1);

    // The backup brought the notes back: no Keep import to offer, the appearance comes last.
    await press(tree, 'Continuer');
    expect(textOf(tree)).not.toContain('Depuis Google Keep');
    expect(textOf(tree)).toContain('Étape 4 sur 4');
    expect(textOf(tree)).toContain('Palettes');
    await press(tree, 'Commencer');
    // Set up once for every device.
    expect(puts()).toContainEqual({ setupDone: true });
    expect(useSettingsStore.getState().onboarded).toBe(true);
    expect(useSettingsStore.getState().apps).toEqual(['notes', 'pages']);
    expect(navigationRef.getCurrentRoute()?.name).toBe('Board');
  });

  it('keeps Carnet on a server that ran another app alone, and never asks for an announced one', async () => {
    server.settings = { ...UNSET, apps: { enabled: ['pages'] } };
    const tree = await boot(false);
    await connect(tree);
    expect(textOf(tree)).toContain('Vos applications');
    // This app goes on at once.
    expect(puts()).toContainEqual({ apps: ['pages', 'notes'] });
    // Pages unticked, Carnet stays.
    await press(tree, 'Pages');
    expect(puts()).toContainEqual({ apps: ['notes'] });
    expect(server.settings.apps.enabled).toEqual(['notes']);
  });

  it('joins a server already set up straight from the appearance, and leaves its setup alone', async () => {
    server.notes = 4;
    server.settings = { ...UNSET, setup: { done: true } };
    const tree = await boot(false);
    await connect(tree, 'https://carnet.test');
    expect(textOf(tree)).toContain('Étape 2 sur 2');
    expect(textOf(tree)).not.toContain('Votre serveur');
    expect(textOf(tree)).not.toContain('Vos applications');
    await press(tree, 'Commencer');
    expect(puts()).toEqual([]);
    expect(useSettingsStore.getState().onboarded).toBe(true);
    expect(navigationRef.getCurrentRoute()?.name).toBe('Board');
  });

  it('connects in one tap with the connection of a sibling app on this phone, and starts from its colours', async () => {
    server.settings = { ...UNSET, setup: { done: true } };
    suite.siblings = [{ packageName: 'com.stephenprn.pages', server: 'https://carnet.test', token: 'jeton', appearance: JSON.stringify({ ...DEFAULT_APPEARANCE, ...PALETTE_COLORS.sarcelle }), grain: '', locale: '' }];
    const tree = await boot(false);
    expect(suite.asked[0]).toEqual(['com.stephenprn.pages', 'com.stephenprn.agenda', 'com.stephenprn.contacts']);
    expect(textOf(tree)).toContain('Pages est déjà relié à carnet.test sur ce téléphone.');
    await press(tree, 'Utiliser la connexion de Pages');
    expect(useSettingsStore.getState().server).toEqual({ url: 'https://carnet.test', token: 'jeton' });
    // Nothing typed: the token was the sibling's.
    expect(calls.find(call => call.path === '/api/settings' && call.method === 'GET')).toBeDefined();
    // Carnet holds nothing on that server: its import first, left for later.
    expect(textOf(tree)).toContain('Étape 2 sur 3');
    await press(tree, 'Plus tard');
    expect(textOf(tree)).toContain('Étape 3 sur 3');
    expect(textOf(tree)).toContain('Les couleurs de Pages sur ce téléphone, reprises ici.');
    expect(useSettingsStore.getState().appearance).toMatchObject(PALETTE_COLORS.sarcelle);
    await press(tree, 'Commencer');
    expect(useSettingsStore.getState().onboarded).toBe(true);
    // And this app tells its siblings in turn.
    expect(suite.shared).toMatchObject({ server: 'https://carnet.test', token: 'jeton' });
  });

  it('says a refused token under the token, and keeps what was typed', async () => {
    global.fetch = jest.fn((input: string, init?: { method?: string; body?: unknown }) => {
      if (new URL(input).pathname === '/api/settings') return Promise.resolve(answer({ error: 'unauthorized' }, 401));
      return fakeFetch(input, init);
    }) as unknown as typeof fetch;
    const tree = await boot(false);
    const [address, token] = fields(tree);
    await type(address!, 'carnet.test');
    await type(token!, 'mauvais');
    await press(tree, 'Se connecter');
    expect(textOf(tree)).toContain('Jeton refusé par le serveur');
    expect(useSettingsStore.getState().server).toBeNull();
    expect(fields(tree)[0]!.props.value).toBe('carnet.test');
    expect(fields(tree)[1]!.props.value).toBe('mauvais');
  });

  it('says what is missing under each field first, then goes from the address to the token, whose « OK » connects', async () => {
    const tree = await boot(false);
    let [address, token] = fields(tree);
    // The keyboard's action moves on, then closes it on the last field.
    expect(address!.props.returnKeyType).toBe('next');
    expect(token!.props.returnKeyType).toBe('done');
    // Autofill keeps the pair: the person's own server.
    expect(address!.props.autoComplete).toBe('username');
    expect(token!.props.autoComplete).toBe('password');
    await press(tree, 'Se connecter');
    expect(textOf(tree)).toContain('Saisissez l’adresse de votre serveur.');
    expect(textOf(tree)).toContain('Saisissez le jeton de votre serveur.');
    expect(textOf(tree)).toContain('2 champs sont à corriger.');
    expect(calls.filter(call => call.path === '/api/health')).toEqual([]);
    [address, token] = fields(tree);
    await type(address!, 'carnet.test');
    // Right again at once: its problem goes as it is typed.
    expect(textOf(tree)).not.toContain('Saisissez l’adresse de votre serveur.');
    await type(fields(tree)[1]!, 'jeton');
    await act(async () => {
      fields(tree)[1]!.props.onSubmitEditing({ nativeEvent: { text: 'jeton' } });
    });
    await settle();
    expect(useSettingsStore.getState().server).toEqual({ url: 'https://carnet.test', token: 'jeton' });
  });

  it('resumes after the welcome when reopened mid-setup, and Back returns to it', async () => {
    const tree = await boot(true);
    expect(navigationRef.getCurrentRoute()?.name).toBe('Setup');
    // The server is still to set up: its apps come first.
    expect(textOf(tree)).toContain('Vos applications');
    expect(textOf(tree)).toContain('Étape 2 sur 5');
    expect(await pressBack()).toBe(true);
    expect(textOf(tree)).toContain('Se connecter');
    expect(fields(tree)[0]!.props.value).toBe('https://carnet.test');
    // On the first step, Back leaves the app.
    expect(await pressBack()).toBe(false);
  });

  it('says plainly when there is no S3 to restore from, offers to add it, and restores a file from the phone instead', async () => {
    const tree = await boot(true);
    await press(tree, 'Continuer');
    await press(tree, 'Retrouver vos données');
    expect(textOf(tree)).toContain('Pas de stockage S3');
    await press(tree, 'Ajouter le stockage S3');
    expect(fields(tree)[0]!.props.value).toBe('https://s3.fr-par.scw.cloud');
    await press(tree, 'Plus tard');
    await press(tree, 'Retrouver vos données');
    media.nextFile = { status: 'ok', message: '', path: '/cache/ancien.tar.gz', name: 'ancien.tar.gz', bytes: 4096 };
    await press(tree, 'Restaurer depuis un fichier');
    expect(calls.find(call => call.path.startsWith('/api/admin/restore'))).toMatchObject({ method: 'POST', path: '/api/admin/restore?mode=merge' });
    // The picked copy leaves the cache once sent.
    expect(media.removed).toEqual(['/cache/ancien.tar.gz']);
    expect(textOf(tree)).toContain('Restauration en cours…');
    server.restoring = false;
    await settle(3_000);
    await press(tree, 'Plus tard');
    expect(pressables(tree, 'Claude')).toHaveLength(1);
  });

  it('speaks English from the welcome on', async () => {
    const tree = await boot(false);
    await press(tree, 'English');
    expect(useSettingsStore.getState().locale).toBe('en');
    expect(pressables(tree, 'Keep everything on this phone')).toHaveLength(1);
    await press(tree, 'Français');
    expect(useSettingsStore.getState().locale).toBe('fr');
  });

  it('lets a phone that keeps everything here choose its colours and its ground, then start', async () => {
    const tree = await boot(false);
    await press(tree, 'Tout garder sur ce téléphone');
    // An empty phone is offered the Keep import first.
    expect(textOf(tree)).toContain('Étape 2 sur 3');
    await press(tree, 'Plus tard');
    expect(textOf(tree)).toContain('Étape 3 sur 3');
    expect(textOf(tree)).toContain('Palettes');
    expect(pressables(tree, 'Commencer')).toHaveLength(1);

    // A pair applies at once, and so does a ground.
    await press(tree, 'Sarcelle');
    expect(useSettingsStore.getState().appearance).toMatchObject(PALETTE_COLORS.sarcelle);
    await press(tree, 'Lagon');
    expect(useSettingsStore.getState().appearance.ground).toEqual({ kind: 'preset', key: 'lagon' });
    await press(tree, 'Revenir à l’apparence d’origine');
    expect(useSettingsStore.getState().appearance).toEqual(DEFAULT_APPEARANCE);

    // The primary picked precisely, by its code: nothing changes until it is chosen.
    await press(tree, 'Principale');
    expect(textOf(tree)).toContain('Couleur principale');
    // The line under the preview always holds its place: kept as picked, or moved to read.
    expect(textOf(tree)).toContain('Ajustée la nuit pour rester lisible.');
    const code = fields(tree).find(field => field.props.accessibilityLabel === 'Code hexadécimal');
    expect(code).toBeDefined();
    await type(code!, '#3a7bd5');
    expect(useSettingsStore.getState().appearance.primary).toBe(DEFAULT_APPEARANCE.primary);
    await press(tree, 'Choisir');
    expect(useSettingsStore.getState().appearance.primary).toBe('#3A7BD5');

    await press(tree, 'Commencer');
    expect(useSettingsStore.getState().onboarded).toBe(true);
    expect(navigationRef.getCurrentRoute()?.name).toBe('Board');
    // Kept for the next start.
    expect(readPreferences().appearance).toMatchObject({ primary: '#3A7BD5' });
  });

  it('imports from Keep as a step: the wizard’s own foot while it runs, the setup’s once it is done', async () => {
    const tree = await boot(false);
    await press(tree, 'Tout garder sur ce téléphone');
    expect(textOf(tree)).toContain('Vous arrivez de Google Keep ?');
    media.nextArchive = { status: 'ok', message: '', dir: '/cache/keep', entries: [{ name: 'Takeout/Keep/Idée.json', path: '/cache/keep/Idée.json', bytes: 10 }] };
    media.texts = { '/cache/keep/Idée.json': JSON.stringify({ title: 'Idée', textContent: 'Un vélo cargo', createdTimestampUsec: 1_690_000_000_000_000, userEditedTimestampUsec: 1_700_000_000_000_000 }) };
    await press(tree, 'Choisir l’archive');
    // Past its first step, the wizard leads: no « Plus tard » from the setup.
    expect(textOf(tree)).toContain('Ce que contient le fichier');
    expect(pressables(tree, 'Plus tard')).toHaveLength(0);
    await press(tree, 'Continuer');
    expect(textOf(tree)).toContain('Vos choix');
    await press(tree, keepImportAction(1));
    await settle();
    expect(textOf(tree)).toContain('Vos notes Keep sont arrivées');
    // No way out of the first run from the report: the setup's own foot goes on.
    expect(pressables(tree, 'Voir le tableau')).toHaveLength(0);
    expect(Object.values(useLibraryStore.getState().notes).some(note => note.title === 'Idée')).toBe(true);
    await press(tree, 'Continuer');
    expect(textOf(tree)).toContain('Palettes');
  });
});
