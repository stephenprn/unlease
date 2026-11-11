/**
 * A link's row, as the web's: kept unread while the server can read it, it offers « Lire la page »,
 * which reads it, and a failed reading « Réessayer »; without a server, or before the server said
 * Claude has a key, nothing to press.
 */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { useSettingsStore } from '@shared/app/store/settingsStore';
import { ThemeProvider } from '@shared/ui/theme/ThemeProvider';
import { addLink, createLine, ensureInbox, updateLink } from '@app/store/actions';
import { loadLibrary, resetLibrary, useLibraryStore } from '@app/store/libraryStore';

import { LinkRow } from '../LinkRow';

const answer = (body: unknown, code = 200) => ({ ok: code < 400, status: code, headers: { get: () => null }, json: async () => body }) as unknown as Response;

let mounted: ReactTestRenderer[] = [];

beforeEach(() => {
  closeDatabase();
  resetLibrary();
  openDatabase({ name: 'linkRow.sqlite' });
  loadLibrary(1_000);
  ensureInbox();
  jest.spyOn(global, 'fetch').mockImplementation(async () => answer({ error: 'not found' }, 404));
});

afterEach(async () => {
  for (const tree of mounted) await act(async () => tree.unmount());
  mounted = [];
  useSettingsStore.setState({ server: null, reading: null });
  jest.restoreAllMocks();
});

function skipped(): string {
  const id = addLink('https://boutique.fr/produits/sac-cabas-en-toile', { noteId: createLine({ title: 'Envies' }) });
  updateLink(id, { status: 'skipped' });
  return id;
}

async function render(id: string): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <GestureHandlerRootView>
        <ThemeProvider>
          <LinkRow id={id} onOpen={() => undefined} />
        </ThemeProvider>
      </GestureHandlerRootView>,
    );
  });
  mounted.push(tree);
  return tree;
}

const readButton = (tree: ReactTestRenderer) => tree.root.findAll(node => node.props.accessibilityLabel === 'Lire Sac cabas en toile' && typeof node.props.onPress === 'function', { deep: false });

describe('a link kept unread', () => {
  it('offers « Lire la page » while the server reads links, and reads it', async () => {
    useSettingsStore.setState({ server: { url: 'https://carnet.test', token: 'jeton' }, reading: true });
    const id = skipped();
    const tree = await render(id);
    const [button] = readButton(tree);
    expect(button).toBeDefined();
    await act(async () => button!.props.onPress());
    expect(useLibraryStore.getState().links[id]!.status).toBe('pending');
  });

  it('offers nothing to press without a server', async () => {
    useSettingsStore.setState({ server: null, reading: null });
    const tree = await render(skipped());
    expect(readButton(tree)).toHaveLength(0);
  });

  it('offers nothing to press before the server said Claude has a key, nor once it said it has none', async () => {
    for (const reading of [null, false]) {
      useSettingsStore.setState({ server: { url: 'https://carnet.test', token: 'jeton' }, reading });
      const tree = await render(skipped());
      expect(readButton(tree)).toHaveLength(0);
    }
  });
});

describe('a link that could not be read', () => {
  const retry = (tree: ReactTestRenderer) => tree.root.findAll(node => node.props.accessibilityLabel === 'Relire la page' && typeof node.props.onPress === 'function', { deep: false });
  const failed = (): string => {
    const id = skipped();
    updateLink(id, { status: 'failed', error: 'La page n’a pas pu être lue.' });
    return id;
  };

  it('offers « Réessayer » only once the server said Claude has a key', async () => {
    useSettingsStore.setState({ server: { url: 'https://carnet.test', token: 'jeton' }, reading: null });
    expect(retry(await render(failed()))).toHaveLength(0);
    useSettingsStore.setState({ reading: true });
    expect(retry(await render(failed()))).toHaveLength(1);
  });
});
