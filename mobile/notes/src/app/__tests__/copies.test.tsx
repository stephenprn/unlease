/**
 * « Garder une copie » now that pages are Pages': the server makes the page (`POST
 * /api/pages/copies`, the link's title with it), the link's `copy` points at it once that syncs, and
 * « Voir la copie » opens it in Pages when it is installed, else on the web. The module shows only
 * once the server says it runs Pages.
 */
import React from 'react';
import { Linking } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { formatHlc } from '@unlease/core/sync/hlc';
import { writeFields } from '@unlease/core/sync/record';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { useSettingsStore } from '@shared/app/store/settingsStore';
import { ThemeProvider } from '@shared/ui/theme/ThemeProvider';
import { ModuleBar } from '@ui/features/links/ModuleBar';

import { keepCopy } from '../modules';
import { addLink, createLine, ensureInbox, updateLink } from '../store/actions';
import { getRecord, loadLibrary, mergeRemote, resetLibrary, useLibraryStore } from '../store/libraryStore';

const PAGE = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const answer = (body: unknown, code = 200) => ({ ok: code < 400, status: code, headers: { get: () => null }, json: async () => body }) as unknown as Response;
let posted: { path: string; body: unknown }[] = [];

beforeEach(() => {
  closeDatabase();
  resetLibrary();
  openDatabase({ name: 'copies.sqlite' });
  loadLibrary(1_000);
  ensureInbox();
  posted = [];
  useSettingsStore.setState({ server: { url: 'https://carnet.test', token: 'jeton' }, reading: true, apps: ['notes', 'pages'], locale: 'fr' });
  jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    posted.push({ path, body: JSON.parse(String(init?.body ?? 'null')) });
    return path === '/api/pages/copies' ? answer({ pageId: PAGE }) : answer({ error: 'not found' }, 404);
  });
});

let mounted: ReactTestRenderer[] = [];

afterEach(async () => {
  for (const tree of mounted) await act(async () => tree.unmount());
  mounted = [];
  jest.restoreAllMocks();
});

function article(): string {
  const line = createLine({ title: 'Lectures' });
  const id = addLink('https://journal.example/article', { noteId: line });
  updateLink(id, { status: 'ready', kind: 'article', title: 'Le titre du lien' });
  return id;
}

const labels = (tree: ReactTestRenderer) => tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && typeof node.props.onPress === 'function', { deep: false }).map(node => node.props.accessibilityLabel as string);

async function render(id: string): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <ThemeProvider>
        <ModuleBar id={id} onOpen={() => undefined} />
      </ThemeProvider>,
    );
  });
  mounted.push(tree);
  return tree;
}

describe('keeping a copy', () => {
  it('asks the server for the page, with the link and its title, and hands back the page', async () => {
    const id = article();
    await expect(keepCopy(id)).resolves.toBe(PAGE);
    expect(posted).toEqual([{ path: '/api/pages/copies', body: { link: { id, url: 'https://journal.example/article' }, lang: 'fr', title: 'Le titre du lien' } }]);
    // Carnet writes nothing itself: the server's change sets `copy`.
    expect(useLibraryStore.getState().links[id]!.copy).toBeNull();
  });

  it('shows only once the server runs Pages', async () => {
    const id = article();
    useSettingsStore.setState({ apps: ['notes'] });
    const tree = await render(id);
    expect(labels(tree)).not.toContain('Garder une copie');
    await act(async () => useSettingsStore.setState({ apps: ['notes', 'pages'] }));
    expect(labels(tree)).toContain('Garder une copie');
  });

  it('opens the copy in Pages when it is installed, else on the web', async () => {
    const id = article();
    // The server's change: the link's copy.
    const record = getRecord('link', id)!;
    await act(async () => {
      mergeRemote([writeFields(record, { copy: PAGE }, formatHlc(Date.now() + 60_000, 0, 'server0000000000'))]);
    });
    const tree = await render(id);
    expect(labels(tree)).toContain('Voir la copie');
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const button = tree.root.findAll(node => node.props.accessibilityLabel === 'Voir la copie' && typeof node.props.onPress === 'function', { deep: false })[0]!;
    await act(async () => {
      button.props.onPress();
    });
    expect(open).toHaveBeenLastCalledWith(`unlease-pages://page/${PAGE}`);

    // Pages not on this phone: the suite's web app.
    open.mockReset();
    open.mockImplementation(async (url: string) => {
      if (url.startsWith('unlease-pages://')) throw new Error('no activity');
    });
    await act(async () => {
      button.props.onPress();
    });
    expect(open).toHaveBeenLastCalledWith(`https://carnet.test/pages/${PAGE}`);
  });
});
