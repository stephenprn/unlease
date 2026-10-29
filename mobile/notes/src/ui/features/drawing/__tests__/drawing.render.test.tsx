/**
 * Drawing on the phone, in the real app: a stroke drawn on a note is kept as it is let go; the
 * eraser and « Tout effacer » take strokes away and undo brings them back; the docked tools pick an
 * ink and a size; the card shows the drawing; a page's drawing block opens its own screen, where what
 * is drawn goes into the page's undo too.
 */
import React from 'react';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { parseDrawing } from '@unlease/notes/services/drawing';
import { closeDatabase, openDatabase } from '@data/db/database';
import { writePreference } from '@data/repositories/stateRepository';
import { resetBootstrap } from '@app/bootstrap';
import { createNote, trashNotes } from '@app/store/actions';
import { resetLibrary, useLibraryStore } from '@app/store/libraryStore';
import { canUndo } from '@app/store/pageHistory';
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

const noteDrawing = (id: string) => parseDrawing(useLibraryStore.getState().notes[id]!.drawing);

afterAll(async () => {
  const previous = mounted;
  if (previous) await act(async () => previous.unmount());
  closeDatabase();
});

describe('a drawing note', () => {
  it('keeps a stroke as it is let go, clears it all as one step, and takes it back and forth', async () => {
    const tree = await boot();
    let id = '';
    await act(async () => {
      id = createNote({ kind: 'drawing' });
    });
    await go('Note', { id });
    await layOut(tree);
    for (const tool of ['Stylo', 'Feutre', 'Surligneur', 'Gomme', 'Annuler', 'Rétablir', 'Tout effacer', 'Fin', 'Moyen', 'Épais', 'Encre', 'Rouge']) expect(labelled(tree, tool).length).toBeGreaterThan(0);

    await stroke([[100, 100], [200, 200], [300, 250], [400, 300], [400, 300]]);
    const kept = noteDrawing(id);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ tool: 'pen', size: 1, ink: 'ink' });
    expect(kept[0]!.points.slice(0, 2)).toEqual([100, 100]);

    await press(tree, 'Tout effacer');
    expect(noteDrawing(id)).toHaveLength(0);
    await press(tree, 'Annuler');
    expect(noteDrawing(id)).toHaveLength(1);
    await press(tree, 'Rétablir');
    expect(noteDrawing(id)).toHaveLength(0);
    await press(tree, 'Annuler');
    expect(noteDrawing(id)).toHaveLength(1);
  });

  it('erases what the eraser sweeps across, as one step', async () => {
    const tree = await boot();
    let id = '';
    await act(async () => {
      id = createNote({ kind: 'drawing' });
    });
    await go('Note', { id });
    await layOut(tree);
    await stroke([[100, 100], [400, 100], [400, 100]]);
    await stroke([[100, 500], [400, 500], [400, 500]]);
    expect(noteDrawing(id)).toHaveLength(2);

    await press(tree, 'Gomme');
    // Straight down across the first stroke only, the ends far from it.
    await stroke([[250, 20], [250, 300], [250, 300]]);
    const left = noteDrawing(id);
    expect(left).toHaveLength(1);
    expect(left[0]!.points[1]).toBe(500);
    await press(tree, 'Annuler');
    expect(noteDrawing(id)).toHaveLength(2);
  });

  it('draws with the ink and the size picked, each tool keeping its own size, an ink picked with the eraser taking the tool back', async () => {
    const tree = await boot();
    let id = '';
    await act(async () => {
      id = createNote({ kind: 'drawing' });
    });
    await go('Note', { id });
    await layOut(tree);
    await press(tree, 'Surligneur');
    await press(tree, 'Épais');
    await press(tree, 'Gomme');
    await press(tree, 'Rouge');
    await stroke([[100, 100], [300, 100], [300, 100]]);
    await press(tree, 'Stylo');
    await stroke([[100, 400], [300, 400], [300, 400]]);
    const [highlight, pen] = noteDrawing(id);
    expect(highlight).toMatchObject({ tool: 'highlighter', size: 2, ink: 'red' });
    expect(pen).toMatchObject({ tool: 'pen', size: 1, ink: 'red' });
  });

  it('shows on its card, and in the bin it is read, never drawn on', async () => {
    const tree = await boot();
    let id = '';
    await act(async () => {
      id = createNote({ kind: 'drawing' });
    });
    await go('Note', { id });
    await layOut(tree);
    await stroke([[100, 100], [300, 200], [300, 200]]);
    await go('Board', { view: 'notes' });
    const card = labelled(tree, 'Dessin').find(node => node.findAll(inner => typeof inner.props.d === 'string' && inner.props.d.startsWith('M100 100')).length > 0);
    expect(card).toBeDefined();

    await act(async () => {
      trashNotes([id]);
    });
    await go('Note', { id });
    await layOut(tree);
    expect(labelled(tree, 'Tout effacer')).toHaveLength(0);
    await stroke([[500, 500], [600, 600], [600, 600]]);
    expect(noteDrawing(id)).toHaveLength(1);
  });
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
});
