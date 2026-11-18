/**
 * A page behind the suite's lock, on the phone: its title shows, its blocks wait under the lock (and
 * a sub-page's under its parent's); « Protéger par mot de passe » offered on a page that is not.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { resetBootstrap } from '@app/bootstrap';
import { resetLibrary } from '@app/store/libraryStore';
import { createPage, insertBlock, setPageLocked } from '@app/store/pages';
import { useSettingsStore } from '@shared/app/store/settingsStore';
import { AppProviders } from '@app/providers/AppProviders';
import { navigationRef } from '@ui/navigation/navigationRef';

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

let tree: ReactTestRenderer | null = null;
let ids = { trip: '', tickets: '', open: '' };

async function boot(): Promise<ReactTestRenderer> {
  if (tree) {
    const previous = tree;
    await act(async () => previous.unmount());
  }
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'lockedPage.sqlite' });
  writePreference('onboarded', true);
  await act(async () => {
    tree = create(<AppProviders />);
  });
  await act(async () => {
    const trip = createPage({ title: 'Lisbonne' });
    insertBlock(trip, trip, 0, { kind: 'text', text: 'Code du coffre 4471.' });
    const tickets = createPage({ title: 'Billets', parentId: trip });
    insertBlock(tickets, tickets, 0, { kind: 'text', text: 'Siège 12A.' });
    const open = createPage({ title: 'Recettes' });
    setPageLocked(trip, true);
    ids = { trip, tickets, open };
    useSettingsStore.setState({ server: { url: 'https://carnet.example.org', token: 'secret-token' } });
  });
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  return tree!;
}

async function openPage(id: string): Promise<void> {
  await act(async () => {
    (navigationRef.navigate as (...args: unknown[]) => void)('Page', { id });
    jest.advanceTimersByTime(400);
  });
}

describe('a protected page', () => {
  afterAll(async () => {
    const last = tree;
    if (last) await act(async () => last.unmount());
  });

  it('shows its title and the lock, never its blocks, and a sub-page waits behind its parent’s lock', async () => {
    const root = await boot();
    await openPage(ids.trip);
    let shown = textOf(root);
    expect(shown).toContain('Lisbonne');
    expect(shown).toContain('Verrouillé');
    expect(shown).not.toContain('Code du coffre');
    await openPage(ids.tickets);
    shown = textOf(root);
    expect(shown).toContain('Billets');
    expect(shown).not.toContain('Siège 12A');
  });

  it('is offered on a page that is not', async () => {
    const root = await boot();
    await openPage(ids.open);
    await act(async () => {
      root.root.findAll(node => (node.props as { label?: unknown }).label === 'Plus d’actions' && typeof (node.props as { onPress?: unknown }).onPress === 'function', { deep: false })[0]!.props.onPress();
      jest.advanceTimersByTime(400);
    });
    expect(textOf(root)).toContain('Protéger par mot de passe');
  });
});
