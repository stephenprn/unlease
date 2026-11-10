/**
 * « Suivi des prix » under a link's price: shown only while its collection watches and the link is
 * something to buy, the change in words, when it was read, and « Vérifier le prix » asking the
 * server and saying what it found in a slip of its tone.
 */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { useSettingsStore } from '@shared/app/store/settingsStore';
import { useUiStore } from '@shared/app/store/uiStore';
import { ThemeProvider } from '@shared/ui/theme/ThemeProvider';
import { addLink, createLine, ensureInbox, setLineModules, updateLink } from '@app/store/actions';
import { loadLibrary, resetLibrary } from '@app/store/libraryStore';
import { PriceWatch } from '@ui/features/links/PriceWatch';

const DAY = 86_400_000;
const answer = (body: unknown, code = 200) => ({ ok: code < 400, status: code, headers: { get: () => null }, json: async () => body }) as unknown as Response;

beforeEach(() => {
  closeDatabase();
  resetLibrary();
  openDatabase({ name: 'priceWatch.sqlite' });
  loadLibrary(1_000);
  ensureInbox();
  useSettingsStore.setState({ server: { url: 'https://carnet.test', token: 'jeton' }, reading: true, locale: 'fr' });
});

let mounted: ReactTestRenderer[] = [];

afterEach(async () => {
  for (const tree of mounted) await act(async () => tree.unmount());
  mounted = [];
  jest.restoreAllMocks();
});

/** A jacket in « Mode », its price watched (or not) and dropped from 215 to 189 three days ago. */
function jacket(watched = true): string {
  const line = createLine({ title: 'Mode' });
  if (watched) setLineModules(line, ['coupons', 'pricewatch']);
  const id = addLink('https://atelier.example/veste', { noteId: line });
  updateLink(id, { status: 'ready', kind: 'product', title: 'Veste', price: 189, currency: 'EUR', priceBefore: 215, priceChangedAt: Date.now() - 3 * DAY, priceCheckedAt: Date.now() - 3 * DAY });
  return id;
}

async function render(id: string): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <GestureHandlerRootView>
        <ThemeProvider>
          <PriceWatch id={id} underPrice />
        </ThemeProvider>
      </GestureHandlerRootView>,
    );
  });
  mounted.push(tree);
  return tree;
}

const texts = (tree: ReactTestRenderer) => tree.root.findAll(node => typeof node.props.children === 'string', { deep: true }).map(node => node.props.children as string);
const button = (tree: ReactTestRenderer) => tree.root.findAll(node => node.props.accessibilityLabel === 'Vérifier le prix' && typeof node.props.onPress === 'function', { deep: false })[0]!;

describe('« Suivi des prix » on the link page', () => {
  it('says the price before and since when, and when it was read', async () => {
    const tree = await render(jacket());
    const shown = texts(tree);
    expect(shown.some(text => /^Avant 215\s€ · en baisse depuis le /.test(text))).toBe(true);
    expect(shown.some(text => text.startsWith('Vérifié le '))).toBe(true);
    expect(shown).toContain('Vérifier le prix');
  });

  it('shows nothing where its collection does not watch, nor without a server', async () => {
    expect(texts(await render(jacket(false)))).toEqual([]);
    const id = jacket();
    useSettingsStore.setState({ server: null });
    expect(texts(await render(id))).toEqual([]);
  });

  it('asks the server, and says what it found in a slip of its tone', async () => {
    const id = jacket();
    const ask = jest.spyOn(global, 'fetch').mockImplementation(async () => answer({ outcome: 'changed', price: 179, currency: 'EUR', before: 189, by: 'page', note: '' }));
    const tree = await render(id);
    await act(async () => button(tree).props.onPress());
    expect(ask).toHaveBeenCalledWith('https://carnet.test/api/notes/price-check', expect.objectContaining({ method: 'POST', body: JSON.stringify({ linkId: id }) }));
    const snack = useUiStore.getState().snack;
    expect(snack).toMatchObject({ message: 'Le prix a baissé : 179 €, contre 189 € avant', tone: 'success' });
  });

  it('takes a refusal for now as a warning', async () => {
    const id = jacket();
    jest.spyOn(global, 'fetch').mockImplementation(async () => answer({ error: 'Prix vérifié à l’instant : réessayez dans une minute.' }, 409));
    const tree = await render(id);
    await act(async () => button(tree).props.onPress());
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Prix vérifié à l’instant : réessayez dans une minute.', tone: 'warning' });
  });
});
