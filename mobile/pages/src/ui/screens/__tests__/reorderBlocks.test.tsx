/**
 * « Réorganiser » on the phone: a page's blocks as rows, opened from a block's actions or by holding
 * the bar's arrow; a row held and dragged lands where the line shows, as deep as the finger goes
 * right or left, a block taking what it holds; each move is one step of the page's undo; TalkBack
 * moves a row with its actions; « Terminé » takes the page to the block moved.
 */
import React from 'react';
import { BackHandler, TextInput } from 'react-native';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { resetBootstrap } from '@app/bootstrap';
import { resetLibrary, useLibraryStore } from '@app/store/libraryStore';
import { createPage, insertBlock } from '@app/store/pages';
import { AppProviders } from '@app/providers/AppProviders';
import { navigationRef } from '@ui/navigation/navigationRef';
import { setFocused } from '@ui/features/pages/editorStore';
import { openPageSheet } from '@ui/features/pages/sheetStore';
import { felt } from '../../../../../shared/__mocks__/NativeHaptics';

jest.useFakeTimers();

// The preset's TextInput mock has no caret.
Object.assign((TextInput as unknown as { prototype: object }).prototype, { setSelection: jest.fn() });

/** A row's pitch on the list (48 and the rows' gap of 4). */
const PITCH = 52;

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

const labelled = (tree: ReactTestRenderer, label: string) => outermost(tree, props => props.accessibilityLabel === label);
const pressable = (tree: ReactTestRenderer, label: string) => labelled(tree, label).filter(node => typeof node.props.onPress === 'function');
const order = (parent: string): readonly string[] => useLibraryStore.getState().blocksByParent[parent] ?? [];

async function press(tree: ReactTestRenderer, label: string): Promise<void> {
  const [target] = pressable(tree, label);
  if (!target) throw new Error(`Nothing to press labelled ${label}`);
  await act(async () => {
    target.props.onPress();
    jest.advanceTimersByTime(400);
  });
}

/** The list gets its frame, as Android lays it out. */
async function layOut(tree: ReactTestRenderer): Promise<void> {
  const [frame] = outermost(tree, props => props.testID === 'reorder-frame');
  if (!frame) throw new Error('No list');
  await act(async () => {
    frame.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 412, height: 600 } } });
  });
}

/** A row held, then dragged by (dx, dy) and let go. */
async function drag(id: string, dx: number, dy: number): Promise<void> {
  await act(async () => {
    fireGestureHandler(getByGestureTestId(`reorder:${id}`), [{ translationX: 0, translationY: 0 }, { translationX: dx / 2, translationY: dy / 2 }, { translationX: dx, translationY: dy }]);
    jest.advanceTimersByTime(400);
  });
}

let tree: ReactTestRenderer | null = null;
let backs: Parameters<typeof BackHandler.addEventListener>[1][] = [];
const ids = { page: '', voyage: '', lisbonne: '', alfama: '', fin: '' };

async function boot(): Promise<ReactTestRenderer> {
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'reorderBlocks.sqlite' });
  writePreference('onboarded', true);
  await act(async () => {
    tree = create(<AppProviders />);
  });
  await act(async () => {
    const page = createPage({ title: 'Voyage au Portugal' });
    ids.page = page;
    ids.voyage = insertBlock(page, page, 0, { kind: 'h1', text: 'Voyage' });
    ids.lisbonne = insertBlock(page, page, 1, { kind: 'bullet', text: 'Lisbonne' });
    ids.alfama = insertBlock(page, ids.lisbonne, 0, { kind: 'bullet', text: 'Alfama' });
    ids.fin = insertBlock(page, page, 2, { kind: 'text', text: 'Fin du voyage' });
  });
  await act(async () => {
    jest.advanceTimersByTime(500);
  });
  await act(async () => {
    (navigationRef.navigate as (...args: unknown[]) => void)('Page', { id: ids.page });
    jest.advanceTimersByTime(400);
  });
  return tree!;
}

describe('reordering a page’s blocks', () => {
  beforeAll(async () => {
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      backs.push(handler);
      return { remove: () => (backs = backs.filter(each => each !== handler)) };
    });
    await boot();
  });

  afterAll(async () => {
    const last = tree;
    if (last) await act(async () => last.unmount());
    closeDatabase();
  });

  it('opens from a block’s actions, its rows one under another as they nest', async () => {
    const root = tree!;
    await act(async () => {
      openPageSheet({ kind: 'block', block: ids.fin });
      jest.advanceTimersByTime(400);
    });
    await press(root, 'Réorganiser les blocs');
    expect(textOf(root)).toContain('Maintenez un bloc, puis faites-le glisser.');
    for (const label of ['Titre 1 : Voyage', 'Élément de liste : Lisbonne', 'Élément de liste : Alfama', 'Texte : Fin du voyage']) expect(labelled(root, label)).toHaveLength(1);
    // The block it was opened for stands chosen.
    expect(labelled(root, 'Texte : Fin du voyage')[0]!.props.accessibilityState).toEqual({ selected: true });
    await layOut(root);
  });

  it('moves a row dragged up, in one step of the page’s undo', async () => {
    const root = tree!;
    felt.length = 0;
    // From the fourth row to between the first and the second.
    await drag(ids.fin, 0, -2.5 * PITCH);
    expect(order(ids.page)).toEqual([ids.voyage, ids.fin, ids.lisbonne]);
    expect(felt[0]).toBe('pick');
    expect(felt).toContain('tick');
    await press(root, 'Annuler');
    expect(order(ids.page)).toEqual([ids.voyage, ids.lisbonne, ids.fin]);
    await press(root, 'Rétablir');
    expect(order(ids.page)).toEqual([ids.voyage, ids.fin, ids.lisbonne]);
  });

  it('takes a row out of its list by a move to the left, and back in to the right', async () => {
    // Alfama, last, one step left: after Lisbonne, at the top level.
    await drag(ids.alfama, -26, 0);
    expect(order(ids.page)).toEqual([ids.voyage, ids.fin, ids.lisbonne, ids.alfama]);
    // One step right again: under Lisbonne.
    await drag(ids.alfama, 26, 0);
    expect(order(ids.page)).toEqual([ids.voyage, ids.fin, ids.lisbonne]);
    expect(order(ids.lisbonne)).toEqual([ids.alfama]);
  });

  it('moves a block with what it holds', async () => {
    // Lisbonne (third, holding Alfama) to the top.
    await drag(ids.lisbonne, 0, -2 * PITCH);
    expect(order(ids.page)).toEqual([ids.lisbonne, ids.voyage, ids.fin]);
    expect(order(ids.lisbonne)).toEqual([ids.alfama]);
  });

  it('leaves a row let go over its own place where it is', async () => {
    const before = order(ids.page);
    await drag(ids.voyage, 4, 6);
    expect(order(ids.page)).toEqual(before);
  });

  it('moves a row with TalkBack’s actions', async () => {
    const root = tree!;
    const [row] = labelled(root, 'Texte : Fin du voyage');
    expect(row!.props.accessibilityActions.map((action: { label: string }) => action.label)).toEqual(['Monter le bloc', 'Descendre le bloc', 'Imbriquer le bloc', 'Désimbriquer le bloc']);
    await act(async () => {
      row!.props.onAccessibilityAction({ nativeEvent: { actionName: 'moveUp' } });
    });
    expect(order(ids.page)).toEqual([ids.lisbonne, ids.fin, ids.voyage]);
  });

  it('leaves on « Terminé », the page taken to the block last moved', async () => {
    const root = tree!;
    await press(root, 'Terminé');
    expect(textOf(root)).not.toContain('Maintenez un bloc, puis faites-le glisser.');
    expect((navigationRef.getCurrentRoute()?.params as { block?: string } | undefined)?.block).toBe(ids.fin);
  });

  it('opens by holding the bar’s arrow, and Back leaves it', async () => {
    const root = tree!;
    await act(async () => {
      jest.advanceTimersByTime(3000);
      setFocused(ids.voyage, { start: 2, end: 2 });
    });
    const [up] = labelled(root, 'Monter le bloc').filter(node => typeof node.props.onLongPress === 'function');
    expect(up).toBeDefined();
    felt.length = 0;
    await act(async () => {
      up!.props.onLongPress();
      jest.advanceTimersByTime(400);
    });
    expect(felt).toEqual(['pick']);
    expect(labelled(root, 'Titre 1 : Voyage')[0]!.props.accessibilityState).toEqual({ selected: true });
    await act(async () => {
      backs[backs.length - 1]!({} as Parameters<Parameters<typeof BackHandler.addEventListener>[1]>[0]);
      jest.advanceTimersByTime(400);
    });
    expect(textOf(root)).not.toContain('Maintenez un bloc, puis faites-le glisser.');
  });
});
