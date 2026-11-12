/**
 * What Android holds back of the sync with the app closed, told to the person: the rows in Réglages
 * (and the Administration's « Serveur »), each opening the page that fixes it, and a slip once a day.
 */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { useSettingsStore } from '@shared/app/store/settingsStore';
import { useUiStore } from '@shared/app/store/uiStore';
import { backgroundProblems, useBackgroundSyncWarning } from '@shared/app/hooks/useBackgroundHealth';
import { backgroundHealth, openBackgroundSetting, type BackgroundHealth } from '@shared/platform/backgroundSync';
import { BackgroundSyncSection } from '@shared/ui/features/settings/BackgroundSyncRows';
import { ThemeProvider } from '@shared/ui/theme/ThemeProvider';

jest.mock('@shared/platform/backgroundSync', () => ({
  backgroundHealth: jest.fn(),
  openBackgroundSetting: jest.fn(async () => true),
}));

const HEALTHY: BackgroundHealth = { restricted: false, unrestricted: false, dataSaver: false };
const health = (value: Partial<BackgroundHealth>) => (backgroundHealth as jest.Mock).mockResolvedValue({ ...HEALTHY, ...value });

function textOf(tree: ReactTestRenderer): string {
  return tree.root
    .findAll(node => typeof node.props.children === 'string')
    .map(node => node.props.children as string)
    .join('\n');
}

function Warning() {
  useBackgroundSyncWarning();
  return null;
}

let tree: ReactTestRenderer | null = null;

async function render(element: React.ReactElement): Promise<ReactTestRenderer> {
  await act(async () => {
    tree = create(
      <GestureHandlerRootView>
        <ThemeProvider>{element}</ThemeProvider>
      </GestureHandlerRootView>,
    );
  });
  return tree!;
}

beforeEach(() => {
  closeDatabase();
  openDatabase({ name: 'background.sqlite' });
  useSettingsStore.setState({ server: { url: 'https://unlease.test', token: 'jeton' } });
  useUiStore.setState({ snack: null });
  (openBackgroundSetting as jest.Mock).mockClear();
  health({});
});

afterEach(async () => {
  if (tree) await act(async () => tree!.unmount());
  tree = null;
});

describe('what holds the background sync back', () => {
  it('names the battery first, then Data Saver, each with the page that fixes it', () => {
    expect(backgroundProblems(null)).toEqual([]);
    expect(backgroundProblems({ ...HEALTHY, unrestricted: true })).toEqual([]);
    expect(backgroundProblems({ restricted: true, unrestricted: false, dataSaver: true })).toEqual([
      { kind: 'restricted', fix: 'battery' },
      { kind: 'dataSaver', fix: 'data' },
    ]);
  });

  it('says nothing in Réglages while nothing holds it back, or without a server', async () => {
    let view = await render(<BackgroundSyncSection />);
    expect(textOf(view)).not.toContain('Synchronisation en arrière-plan');
    await act(async () => view.unmount());
    health({ restricted: true });
    useSettingsStore.setState({ server: null });
    view = await render(<BackgroundSyncSection />);
    expect(textOf(view)).not.toContain('Synchronisation en arrière-plan');
  });

  it('shows the battery’s « Restreinte » and Data Saver in Réglages, and opens what fixes each', async () => {
    health({ restricted: true, dataSaver: true });
    const view = await render(<BackgroundSyncSection />);
    const text = textOf(view);
    expect(text).toContain('Synchronisation en arrière-plan');
    expect(text).toContain('Batterie « Restreinte »');
    expect(text).toContain('choisissez « Optimisée » ou « Sans restriction »');
    expect(text).toContain('Économiseur de données');
    const rows = view.root.findAll(node => typeof node.props.onPress === 'function' && typeof node.props.title === 'string');
    await act(async () => rows.find(row => row.props.title === 'Batterie « Restreinte »')!.props.onPress());
    expect(openBackgroundSetting).toHaveBeenLastCalledWith('battery');
    await act(async () => rows.find(row => row.props.title === 'Économiseur de données')!.props.onPress());
    expect(openBackgroundSetting).toHaveBeenLastCalledWith('data');
  });

  it('warns with a slip whose button opens the battery’s page, once a day at most', async () => {
    health({ restricted: true });
    let view = await render(<Warning />);
    const snack = useUiStore.getState().snack;
    expect(snack).toMatchObject({ tone: 'warning', action: { label: 'Corriger' } });
    expect(snack!.message).toContain('Android empêche la synchronisation tant que l’application est fermée');
    act(() => snack!.action!.run());
    expect(openBackgroundSetting).toHaveBeenCalledWith('battery');
    // Opened again the same day: Réglages still says it, the slip does not come back.
    await act(async () => view.unmount());
    useUiStore.setState({ snack: null });
    view = await render(<Warning />);
    expect(useUiStore.getState().snack).toBeNull();
  });

  it('does not warn while nothing holds it back', async () => {
    await render(<Warning />);
    expect(useUiStore.getState().snack).toBeNull();
  });
});
