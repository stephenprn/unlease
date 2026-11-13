/**
 * « Historique des versions » on the phone: the server's versions listed by day, one opened
 * read-only against the page now, restored as one step with Undo on its slip; without a server it
 * says the history needs one.
 */
import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { snapshotBlocks } from '@unlease/pages/services/versions';
import type { PageVersion } from '@unlease/pages/sync/versions';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { resetBootstrap } from '@app/bootstrap';
import { getRecord, resetLibrary, useLibraryStore } from '@app/store/libraryStore';
import { createPage, insertBlock, updateBlock } from '@app/store/pages';
import { fetchPageVersion, fetchPageVersions } from '@app/sync/transport';
import { useSettingsStore } from '@shared/app/store/settingsStore';
import { useUiStore } from '@shared/app/store/uiStore';
import { AppProviders } from '@app/providers/AppProviders';
import { navigationRef } from '@ui/navigation/navigationRef';

jest.mock('@app/sync/transport', () => ({ ...jest.requireActual('@app/sync/transport'), fetchPageVersions: jest.fn(), fetchPageVersion: jest.fn() }));
jest.useFakeTimers();

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

const pressable = (tree: ReactTestRenderer, match: (props: Record<string, unknown>) => boolean): ReactTestInstance =>
  tree.root.findAll(node => typeof node.props.onPress === 'function' && match(node.props as Record<string, unknown>), { deep: false })[0]!;

let tree: ReactTestRenderer | null = null;

async function boot(server: boolean): Promise<{ root: ReactTestRenderer; page: string; task: string }> {
  if (tree) {
    const previous = tree;
    await act(async () => previous.unmount());
  }
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'versions.sqlite' });
  writePreference('onboarded', true);
  await act(async () => {
    tree = create(<AppProviders />);
  });
  let ids = { page: '', task: '' };
  await act(async () => {
    const page = createPage({ title: 'Voyage' });
    const task = insertBlock(page, page, 0, { kind: 'todo', text: 'Passeport' });
    ids = { page, task };
    useSettingsStore.setState({ server: server ? { url: 'https://carnet.example.org', token: 'secret-token' } : null });
  });
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  return { root: tree!, ...ids };
}

describe('a page’s version history on the phone', () => {
  afterAll(async () => {
    const last = tree;
    if (last) await act(async () => last.unmount());
  });

  it('lists the versions, opens one against the page now, and restores it with Undo', async () => {
    const { root, page, task } = await boot(true);
    const { blocksByParent } = useLibraryStore.getState();
    const blocks = snapshotBlocks(page, { fieldsOf: id => getRecord('block', id)?.fields, childrenOf: id => blocksByParent[id] ?? [] })!;
    const at = Date.now() - 60 * 60_000;
    const kept: PageVersion = { id: 4, at, pageId: page, blocks };
    jest.mocked(fetchPageVersions).mockResolvedValue({ versions: [{ id: 4, at, blocks: 1, change: { added: 1, removed: 0, changed: 0 } }] });
    jest.mocked(fetchPageVersion).mockResolvedValue(kept);
    await act(async () => {
      updateBlock(page, task, { checked: true });
      (navigationRef.navigate as (...args: unknown[]) => void)('Versions', { page });
      jest.advanceTimersByTime(400);
    });
    const listed = textOf(root);
    expect(listed).toContain('Versions de Voyage');
    expect(listed).toMatch(/1\s+bloc ajouté/);

    await act(async () => {
      pressable(root, props => typeof props.accessibilityValue === 'object' && /bloc ajouté/.test(String((props.accessibilityValue as { text?: string }).text))).props.onPress();
      jest.advanceTimersByTime(400);
    });
    const shown = textOf(root);
    expect(shown).toContain('Passeport');
    expect(shown).toMatch(/1\s+bloc modifié/);

    await act(async () => {
      pressable(root, props => props.label === 'Restaurer cette version').props.onPress();
      jest.advanceTimersByTime(400);
    });
    expect(useLibraryStore.getState().blocks[task]!.checked).toBe(false);
    expect(useUiStore.getState().snack?.message).toBe('Version restaurée');
    await act(async () => useUiStore.getState().snack!.action!.run());
    expect(useLibraryStore.getState().blocks[task]!.checked).toBe(true);
  });

  it('says the history needs a server without one', async () => {
    const { root, page } = await boot(false);
    jest.mocked(fetchPageVersions).mockClear();
    await act(async () => {
      (navigationRef.navigate as (...args: unknown[]) => void)('Versions', { page });
      jest.advanceTimersByTime(400);
    });
    expect(textOf(root)).toContain('L’historique des versions a besoin de votre serveur : connectez-en un dans les réglages.');
    expect(fetchPageVersions).not.toHaveBeenCalled();
  });
});
