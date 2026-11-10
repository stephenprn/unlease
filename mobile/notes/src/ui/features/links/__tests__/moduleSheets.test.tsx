/**
 * The link modules' sheets as the web's dialogs: their actions pinned at the foot (« Chercher à
 * nouveau », « Ouvrir la page »; « Annuler » where a choice is made), and the kitchen's timers as
 * pills of the slip, « Terminé » once rung.
 */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { useSettingsStore } from '@shared/app/store/settingsStore';
import { ThemeProvider } from '@shared/ui/theme/ThemeProvider';
import { addLink, createLine, ensureInbox, updateLink } from '@app/store/actions';
import { startTimer, stopTimer, useKitchenStore } from '@app/store/kitchen';
import { loadLibrary, resetLibrary } from '@app/store/libraryStore';
import { CoverageSheet } from '@ui/features/links/CoverageSheet';
import { KitchenTimers } from '@ui/features/links/KitchenTimers';
import { RecapSheet } from '@ui/features/links/RecapSheet';

const answer = (body: unknown, code = 200) => ({ ok: code < 400, status: code, headers: { get: () => null }, json: async () => body }) as unknown as Response;

beforeEach(() => {
  closeDatabase();
  resetLibrary();
  openDatabase({ name: 'moduleSheets.sqlite' });
  loadLibrary(1_000);
  ensureInbox();
  useSettingsStore.setState({ server: { url: 'https://carnet.test', token: 'jeton' }, reading: true, locale: 'fr' });
});

let mounted: ReactTestRenderer[] = [];

afterEach(async () => {
  for (const tree of mounted) await act(async () => tree.unmount());
  mounted = [];
  useKitchenStore.getState().timers.forEach(timer => stopTimer(timer.id));
  jest.restoreAllMocks();
});

function link(kind: 'article' | 'series'): string {
  const line = createLine({ title: 'Lectures' });
  const id = addLink('https://journal.example/sujet', { noteId: line });
  updateLink(id, { status: 'ready', kind, title: 'Le sujet' });
  return id;
}

async function render(node: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <GestureHandlerRootView>
        <ThemeProvider>{node}</ThemeProvider>
      </GestureHandlerRootView>,
    );
  });
  mounted.push(tree);
  return tree;
}

const buttons = (tree: ReactTestRenderer) => tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string' && typeof node.props.onPress === 'function', { deep: false });
const labels = (tree: ReactTestRenderer) => buttons(tree).map(node => node.props.accessibilityLabel as string);
const press = async (tree: ReactTestRenderer, label: string) => {
  const button = buttons(tree).find(node => node.props.accessibilityLabel === label)!;
  await act(async () => button.props.onPress());
};
const texts = (tree: ReactTestRenderer) => tree.root.findAll(node => typeof node.props.children === 'string', { deep: true }).map(node => node.props.children as string);

describe('the modules’ sheets', () => {
  it('keep « Chercher à nouveau » and « Ouvrir la page » at the foot, « Réessayer » after a failure', async () => {
    const id = link('article');
    let fail = true;
    jest.spyOn(global, 'fetch').mockImplementation(async () =>
      fail
        ? answer({ error: 'Claude est occupé' }, 503)
        : answer({ story: 'Le sujet en une phrase.', outlets: [{ outlet: 'Le Journal', angle: 'Par les chiffres', adds: 'Un tableau', url: 'https://journal.example/autre' }], note: '', searchedAt: 1_000 }),
    );
    const tree = await render(<CoverageSheet id={id} visible onDismiss={() => undefined} />);
    expect(labels(tree)).toEqual(expect.arrayContaining(['Réessayer', 'Ouvrir la page']));

    fail = false;
    await press(tree, 'Réessayer');
    expect(texts(tree)).toEqual(expect.arrayContaining(['Le sujet en une phrase.', 'Par les chiffres', 'Un tableau']));
    expect(labels(tree)).toEqual(expect.arrayContaining(['Chercher à nouveau', 'Ouvrir la page']));
  });

  it('let the recap’s picker be left with « Annuler »', async () => {
    const id = link('series');
    const dismissed = jest.fn();
    const tree = await render(<RecapSheet id={id} visible onDismiss={dismissed} />);
    expect(labels(tree)).toEqual(expect.arrayContaining(['Annuler', 'Résumer']));
    await press(tree, 'Annuler');
    expect(dismissed).toHaveBeenCalled();
  });
});

describe('the kitchen’s timers', () => {
  it('count down on a pill, then say « Terminé » until dismissed', async () => {
    const id = link('article');
    const running = startTimer(id, 'Étape 2', 600);
    const tree = await render(<KitchenTimers linkId={id} />);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Étape 2', '10:00']));
    expect(labels(tree)).toContain('Arrêter le minuteur');

    await act(async () => {
      stopTimer(running.id);
      startTimer(id, 'Étape 3', 60, Date.now() - 120_000);
    });
    expect(texts(tree)).toContain('Terminé');
    expect(labels(tree)).toContain('Fermer le minuteur');
  });
});
