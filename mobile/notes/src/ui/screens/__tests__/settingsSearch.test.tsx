/**
 * The board's search finds the settings too: a small group « Réglages » above the notes, three at
 * most until « Tout voir », each row opening Réglages at its section (scrolled to it) or the
 * Administration's section.
 */
import React from 'react';
import { ScrollView } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { APP_WORDS } from '@unlease/core/appWords';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { resetBootstrap } from '@app/bootstrap';
import { createNote } from '@app/store/actions';
import { resetLibrary } from '@app/store/libraryStore';
import { AppProviders } from '@app/providers/AppProviders';
import { navigationRef } from '@ui/navigation/navigationRef';
import { SettingsScroll } from '@shared/ui/features/settings/SettingsScroll';
import type { RootStackParamList } from '@ui/navigation/types';

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

let mounted: ReactTestRenderer | null = null;

async function boot(seed?: () => void): Promise<ReactTestRenderer> {
  const previous = mounted;
  if (previous) await act(async () => previous.unmount());
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'settings-search.sqlite' });
  writePreference('onboarded', true);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<AppProviders />);
  });
  if (seed) await act(async () => seed());
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  mounted = tree;
  return tree;
}

async function go<K extends keyof RootStackParamList>(screen: K, params?: RootStackParamList[K]): Promise<void> {
  await act(async () => {
    (navigationRef.navigate as (...args: unknown[]) => void)(screen, params);
    jest.advanceTimersByTime(400);
  });
}

async function search(tree: ReactTestRenderer, query: string): Promise<void> {
  // Every note's search, or a view's (« Rechercher dans « Archives » »).
  const field = outermost(tree, props => typeof props.placeholder === 'string' && (props.placeholder === APP_WORDS.notes.search || props.placeholder.startsWith('Rechercher dans')) && typeof props.onChangeText === 'function')[0]!;
  await act(async () => {
    (field.props.onChangeText as (text: string) => void)(query);
    jest.advanceTimersByTime(300);
  });
}

/** The settings' rows shown: their titles. */
const settingRows = (tree: ReactTestRenderer): string[] =>
  outermost(tree, props => typeof props.title === 'string' && typeof props.onPress === 'function' && typeof props.supporting === 'string' && /^(Réglages|Administration)/.test(props.supporting)).map(row => row.props.title as string);

async function press(node: ReactTestInstance): Promise<void> {
  await act(async () => {
    (node.props.onPress as () => void)();
    jest.advanceTimersByTime(400);
  });
}

afterAll(async () => {
  const previous = mounted;
  if (previous) await act(async () => previous.unmount());
});

describe('the board’s search', () => {
  it('shows the settings the words name above the notes, and opens Réglages at the section', async () => {
    const tree = await boot(() => {
      createNote({ kind: 'text', title: 'Café en grains' });
    });
    await search(tree, 'grain');
    expect(settingRows(tree)).toEqual(['Grain du papier', 'Grain sur le fond']);
    const text = textOf(tree);
    // The group first, then the count over the notes.
    expect(text.indexOf('Réglages')).toBeLessThan(text.search(/1\srésultat/));
    expect(text.search(/1\srésultat/)).toBeGreaterThan(0);
    // The note's words marked, split around the match.
    expect(text).toMatch(/Café en\s+grain/);
    await press(outermost(tree, props => props.title === 'Grain sur le fond' && typeof props.onPress === 'function')[0]!);
    expect(navigationRef.getCurrentRoute()).toMatchObject({ name: 'Settings', params: { section: 'ground' } });

    // Réglages lands on « Fond » once it is laid out (12 over it, the list's own room), until the person scrolls.
    const landing = tree.root.findByType(SettingsScroll);
    const scroll = landing.findByType(ScrollView).instance as { scrollTo: jest.Mock };
    scroll.scrollTo = jest.fn();
    const ground = tree.root.find(node => node.props.anchor === 'ground').find(node => typeof node.props.onLayout === 'function');
    const layout = (y: number) => ({ nativeEvent: { layout: { x: 0, y, width: 360, height: 400 } } });
    await act(async () => {
      (ground.props.onLayout as (event: unknown) => void)(layout(900));
      jest.advanceTimersByTime(50);
    });
    expect(scroll.scrollTo).toHaveBeenLastCalledWith({ y: 888, animated: false });
    // A section above it settled taller: it follows.
    await act(async () => {
      (ground.props.onLayout as (event: unknown) => void)(layout(960));
      jest.advanceTimersByTime(50);
    });
    expect(scroll.scrollTo).toHaveBeenLastCalledWith({ y: 948, animated: false });
    // Moved by hand: it stays where the person put it.
    await act(async () => {
      (landing.findByType(ScrollView).props.onScrollBeginDrag as (event: unknown) => void)({ nativeEvent: {} });
      (ground.props.onLayout as (event: unknown) => void)(layout(1000));
      jest.advanceTimersByTime(50);
    });
    expect(scroll.scrollTo).toHaveBeenCalledTimes(2);
  });

  it('opens the Administration at its section, keeps three until « Tout voir », and says nothing when no setting answers', async () => {
    const tree = await boot();
    await search(tree, 'budget');
    expect(settingRows(tree)).toEqual(['Budget mensuel']);
    await press(outermost(tree, props => props.title === 'Budget mensuel' && typeof props.onPress === 'function')[0]!);
    expect(navigationRef.getCurrentRoute()).toMatchObject({ name: 'Admin', params: { section: 'reading' } });
    await go('Board', { view: 'notes' });

    await search(tree, 'données');
    expect(settingRows(tree)).toHaveLength(3);
    const all = outermost(tree, props => props.accessibilityLabel === 'Tous les réglages trouvés' && typeof props.onPress === 'function')[0]!;
    await press(all);
    expect(settingRows(tree).length).toBeGreaterThan(3);
    expect(outermost(tree, props => props.accessibilityLabel === 'Tous les réglages trouvés')).toHaveLength(0);

    await search(tree, 'lisbonne');
    expect(settingRows(tree)).toEqual([]);
  });

  it('keeps a view’s search to its own notes', async () => {
    const tree = await boot();
    await go('Board', { view: 'archive' });
    await search(tree, 'grain');
    expect(settingRows(tree)).toEqual([]);
  });
});
