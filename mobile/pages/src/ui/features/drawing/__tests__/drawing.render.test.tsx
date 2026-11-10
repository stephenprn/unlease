/**
 * A page's drawing block, in the real app (split from Carnet's drawing test when Pages left Carnet,
 * the drawing editor still Carnet's, borrowed): it opens its own screen, where what is drawn goes
 * into the page's undo too.
 */
import React from 'react';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { parseDrawing } from '@unlease/notes/services/drawing';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { resetBootstrap } from '@app/bootstrap';
import { resetLibrary, useLibraryStore } from '@app/store/libraryStore';
import { canUndo, undoPage } from '@app/store/pageHistory';
import { createPage, insertBlock } from '@app/store/pages';
import { AppProviders } from '@app/providers/AppProviders';
import { navigationRef } from '@ui/navigation/navigationRef';
import type { RootStackParamList } from '@ui/navigation/types';

jest.useFakeTimers();

/** The canvas is laid out 380 wide: a drawing unit is 0.38 of a dp. */
const WIDTH = 380;
const at = (units: number): number => units * (WIDTH / 1000);

let mounted: ReactTestRenderer | null = null;

async function boot(): Promise<ReactTestRenderer> {
  const previous = mounted;
  if (previous) await act(async () => previous.unmount());
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'drawing.sqlite' });
  writePreference('onboarded', true);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<AppProviders />);
  });
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

function outermost(tree: ReactTestRenderer, match: (props: Record<string, unknown>) => boolean): ReactTestInstance[] {
  return tree.root.findAll(node => match(node.props as Record<string, unknown>), { deep: false });
}

function labelled(tree: ReactTestRenderer, label: string): ReactTestInstance[] {
  return outermost(tree, props => props.accessibilityLabel === label);
}

async function press(tree: ReactTestRenderer, label: string): Promise<void> {
  const [target] = labelled(tree, label).filter(node => typeof node.props.onPress === 'function');
  if (!target) throw new Error(`Nothing to press labelled ${label}`);
  await act(async () => {
    target.props.onPress();
    jest.advanceTimersByTime(300);
  });
}

/** The canvas gets its size, as Android lays it out. */
async function layOut(tree: ReactTestRenderer): Promise<void> {
  const [canvas] = labelled(tree, 'Zone de dessin');
  if (!canvas) throw new Error('No canvas');
  await act(async () => {
    canvas.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: WIDTH, height: 600 } } });
  });
}

/** A finger down at the first point (drawing units), through the others, lifted at the last. */
async function stroke(points: readonly (readonly [number, number])[]): Promise<void> {
  await act(async () => {
    fireGestureHandler(
      getByGestureTestId('drawing'),
      points.map(([x, y]) => ({ x: at(x), y: at(y) })),
    );
    jest.advanceTimersByTime(50);
  });
}

afterAll(async () => {
  const previous = mounted;
  if (previous) await act(async () => previous.unmount());
  closeDatabase();
});

describe('a page’s drawing', () => {
  it('invites a press, opens on its own screen, keeps what is drawn there in the page’s undo, and shows it in the page', async () => {
    const tree = await boot();
    let page = '';
    let block = '';
    await act(async () => {
      page = createPage({ title: 'Croquis' });
      block = insertBlock(page, page, 0, { kind: 'drawing' });
    });
    await go('Page', { id: page });
    await press(tree, 'Touchez pour dessiner');
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await layOut(tree);
    expect(labelled(tree, 'Stylo').length).toBeGreaterThan(0);
    await stroke([[100, 100], [500, 400], [500, 400]]);
    expect(parseDrawing(useLibraryStore.getState().blocks[block]!.drawing)).toHaveLength(1);
    expect(canUndo(page)).toBe(true);

    await act(async () => {
      navigationRef.goBack();
      jest.advanceTimersByTime(400);
    });
    expect(labelled(tree, 'Modifier le dessin').length).toBeGreaterThan(0);
  });

  it('lies on the plain paper until another background is chosen from « Fond », and its frame in the page wears it', async () => {
    const tree = await boot();
    let page = '';
    let block = '';
    await act(async () => {
      page = createPage({ title: 'Croquis' });
      block = insertBlock(page, page, 0, { kind: 'drawing' });
    });
    await go('Page', { id: page });
    await press(tree, 'Touchez pour dessiner');
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    await layOut(tree);
    await stroke([[100, 100], [500, 400], [500, 400]]);
    // None chosen: the plain paper.
    expect(useLibraryStore.getState().blocks[block]!.color).toBeNull();
    await press(tree, 'Fond : Papier');
    await press(tree, 'Olive');
    expect(useLibraryStore.getState().blocks[block]!.color).toBe('olive');
    expect(labelled(tree, 'Fond : Olive').length).toBeGreaterThan(0);
    await press(tree, 'Sans fond');
    expect(useLibraryStore.getState().blocks[block]!.color).toBe('none');
    await press(tree, 'Olive');

    await act(async () => {
      navigationRef.goBack();
      jest.advanceTimersByTime(400);
    });
    const [frame] = labelled(tree, 'Modifier le dessin');
    expect(frame).toBeDefined();
    // The frame holding the drawing in the page is painted with the wash, or the paper; with « Sans fond », it has no paint of its own.
    const paintOf = (): string | undefined => {
      let node: ReactTestInstance | null = labelled(tree, 'Modifier le dessin')[0]!.parent;
      while (node && node.props.outline !== 'frame') node = node.parent;
      const style = ([] as unknown[]).concat(node?.props.style ?? []).flat(4) as ({ backgroundColor?: string } | null)[];
      return style.reduce<string | undefined>((paint, each) => each?.backgroundColor ?? paint, undefined);
    };
    expect(frame).toBeDefined();
    expect(paintOf()).toBeTruthy();
    await act(async () => {
      undoPage(page);
    });
    expect(useLibraryStore.getState().blocks[block]!.color).toBe('none');
    expect(paintOf()).toBeUndefined();
    await act(async () => {
      undoPage(page);
      undoPage(page);
    });
    // Back to none chosen: the paper again.
    expect(useLibraryStore.getState().blocks[block]!.color).toBeNull();
    expect(paintOf()).toBeTruthy();
  });
});
