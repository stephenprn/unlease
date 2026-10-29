/**
 * "Demander à Claude" on a page, on the phone: hidden until the server offers it, a quiet pebble in
 * the top bar once it does, the sheet with its scope, an answer with its sources, and a private page
 * left without it.
 */
import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { closeDatabase, openDatabase } from '@data/db/database';
import { writePreference } from '@data/repositories/stateRepository';
import { resetBootstrap } from '@app/bootstrap';
import { usePagesAskStore } from '@app/pagesAsk';
import { resetLibrary } from '@app/store/libraryStore';
import { createPage, insertBlock, setPagePrivate } from '@app/store/pages';
import { useSettingsStore } from '@app/store/settingsStore';
import { AppProviders } from '@app/providers/AppProviders';
import { navigationRef } from '@ui/navigation/navigationRef';

jest.useFakeTimers();

function outermost(tree: ReactTestRenderer, match: (props: Record<string, unknown>) => boolean): ReactTestInstance[] {
  return tree.root.findAll(node => match(node.props as Record<string, unknown>), { deep: false });
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

let tree: ReactTestRenderer | null = null;
let ids: { page: string; dates: string; secret: string } = { page: '', dates: '', secret: '' };

async function boot(offered: boolean): Promise<ReactTestRenderer> {
  if (tree) {
    const previous = tree;
    await act(async () => previous.unmount());
  }
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'pagesAsk.sqlite' });
  writePreference('onboarded', true);
  await act(async () => {
    tree = create(<AppProviders />);
  });
  await act(async () => {
    const page = createPage({ title: 'Lisbonne' });
    const dates = insertBlock(page, page, 0, { kind: 'text', text: 'Départ le 3 mai.' });
    const hotels = createPage({ title: 'Hôtels', parentId: page });
    insertBlock(hotels, hotels, 0, { kind: 'text', text: 'Près de l’Alfama.' });
    const secret = createPage({ title: 'Budget perso', parentId: page });
    setPagePrivate(secret, true);
    ids = { page, dates, secret };
    useSettingsStore.setState({
      server: { url: 'https://carnet.example.org', token: 'secret-token' },
      reading: true,
      pagesAsk: offered ? { enabled: true, everywhere: true, web: true, reach: 'medium' } : null,
    });
    usePagesAskStore.setState({ open: null, threads: {} });
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

const askButton = (root: ReactTestRenderer) => outermost(root, props => props.label === 'Demander à Claude' && typeof props.onPress === 'function');

describe('Demander à Claude on a page', () => {
  afterAll(async () => {
    const last = tree;
    if (last) await act(async () => last.unmount());
  });

  it('is not there until the server offers it', async () => {
    const root = await boot(false);
    await openPage(ids.page);
    expect(askButton(root)).toHaveLength(0);
  });

  it('opens a sheet saying what it reads, then shows an answer with its sources', async () => {
    const root = await boot(true);
    await openPage(ids.page);
    expect(askButton(root)).toHaveLength(1);
    await act(async () => {
      askButton(root)[0]!.props.onPress();
      jest.advanceTimersByTime(400);
    });
    const shown = textOf(root);
    expect(shown).toContain('À propos de « Lisbonne »');
    // A count and its word keep together on one line.
    expect(shown).toMatch(/Claude lit cette page et 1\s+sous-page/);
    expect(shown).toMatch(/1\s+page gardée hors de Claude\./);
    expect(shown).toContain('Résume ces pages en quelques points');

    await act(async () => {
      usePagesAskStore.setState(s => ({
        threads: {
          ...s.threads,
          [ids.page]: {
            scope: 'tree',
            web: false,
            turns: [
              {
                id: 1,
                question: 'Quand est-ce que je pars ?',
                scope: 'tree',
                web: false,
                read: 2,
                cut: 0,
                error: null,
                answer: { parts: [{ text: 'Vous partez le 3 mai', cites: [0] }, { text: '.', cites: [] }], citations: [{ pageId: ids.page, blockIds: [ids.dates], quote: 'Départ le **3 mai**.' }], sources: [] },
              },
            ],
          },
        },
      }));
      jest.advanceTimersByTime(400);
    });
    const answered = textOf(root);
    expect(answered).toContain('Quand est-ce que je pars ?');
    expect(answered).toContain('Vous partez le 3 mai');
    // The quote, read without its Markdown.
    expect(answered).toMatch(/«\s+Départ le 3 mai\.\s+»/);
    expect(outermost(root, props => props.accessibilityLabel === 'Source 1 : Lisbonne' && typeof props.onPress === 'function').length).toBeGreaterThan(0);
  });

  it('leaves a private page without it', async () => {
    const root = await boot(true);
    await openPage(ids.secret);
    expect(askButton(root)).toHaveLength(0);
  });
});
