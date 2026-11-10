/**
 * « Annuler » and « Rétablir » in the note editor: the date until something is done, then the pair in
 * its place, each disabled at its end; typing is a step until a pause, an item made by Enter goes back
 * to its tombstone, a colour comes back, an undone item shows even while it is typed in. And a colour
 * for several picked notes, from the selection bar, with « Annuler ».
 */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { TYPING_PAUSE_MS } from '@unlease/notes/services/editHistory';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { resetBootstrap } from '@app/bootstrap';
import { addCheck, createLine, createNote, setPinned } from '@app/store/actions';
import { getRecord, resetLibrary, useLibraryStore } from '@app/store/libraryStore';
import { useUiStore } from '@shared/app/store/uiStore';
import { AppProviders } from '@app/providers/AppProviders';
import { navigationRef } from '@ui/navigation/navigationRef';
import type { RootStackParamList } from '@ui/navigation/types';

jest.useFakeTimers();

const setSelection = jest.fn();
Object.assign((TextInput as unknown as { prototype: object }).prototype, { setSelection });

let mounted: ReactTestRenderer | null = null;

async function boot(seed: () => void): Promise<ReactTestRenderer> {
  const previous = mounted;
  if (previous) await act(async () => previous.unmount());
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'history.sqlite' });
  writePreference('onboarded', true);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<AppProviders />);
  });
  await act(async () => {
    seed();
    useUiStore.setState({ snack: null });
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

const button = (tree: ReactTestRenderer, label: string): ReactTestInstance | undefined => outermost(tree, props => props.label === label && props.icon !== undefined)[0];

async function press(tree: ReactTestRenderer, label: string): Promise<void> {
  await act(async () => {
    (button(tree, label)!.props.onPress as () => void)();
  });
}

async function later(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('undo and redo in the note editor', () => {
  it('shows the date until something is done, then steps through typing and a colour', async () => {
    let id = '';
    const tree = await boot(() => {
      id = createNote({ kind: 'text', title: 'Courses' });
    });
    await go('Note', { id });
    expect(button(tree, 'Annuler')).toBeUndefined();
    const title = () => outermost(tree, props => props.accessibilityLabel === 'Titre' && typeof props.onChangeText === 'function')[0]!;

    // Two stretches of typing, a pause between them.
    await act(async () => {
      title().props.onChangeText('Courses du');
    });
    await later(400);
    await act(async () => {
      title().props.onChangeText('Courses du samedi');
    });
    await later(TYPING_PAUSE_MS + 400);
    await act(async () => {
      title().props.onChangeText('Courses du samedi matin');
    });
    await later(400);
    expect(button(tree, 'Annuler')!.props.disabled).toBe(false);
    expect(button(tree, 'Rétablir')!.props.disabled).toBe(true);

    await press(tree, 'Annuler');
    expect(useLibraryStore.getState().notes[id]!.title).toBe('Courses du samedi');
    expect(title().props.value).toBe('Courses du samedi');
    await press(tree, 'Annuler');
    expect(useLibraryStore.getState().notes[id]!.title).toBe('Courses');
    // At the start of the history: undo is there, and cannot be pressed.
    expect(button(tree, 'Annuler')!.props.disabled).toBe(true);
    await press(tree, 'Rétablir');
    expect(useLibraryStore.getState().notes[id]!.title).toBe('Courses du samedi');

    // A colour from the sheet is a step too; doing something new forgets what was undone.
    await press(tree, 'Couleur et papier');
    await act(async () => {
      outermost(tree, props => typeof props.onColor === 'function' && props.visible === true)[0]!.props.onColor('blue');
    });
    expect(button(tree, 'Rétablir')!.props.disabled).toBe(true);
    await press(tree, 'Annuler');
    expect(useLibraryStore.getState().notes[id]!.color).toBeNull();
    await press(tree, 'Rétablir');
    expect(useLibraryStore.getState().notes[id]!.color).toBe('blue');
  });

  it('takes back an item Enter split off, and shows an undone item even while it is typed in', async () => {
    let list = '';
    const tree = await boot(() => {
      list = createNote({ kind: 'checklist', title: 'Courses' });
      addCheck(list, 'painlait');
    });
    await go('Note', { id: list });
    const texts = () => (useLibraryStore.getState().checksByNote[list] ?? []).map(cid => useLibraryStore.getState().checks[cid]!.text);
    const fields = () => outermost(tree, props => props.accessibilityLabel === 'Texte de l’élément' && props.onSubmitEditing !== undefined);
    await act(async () => {
      fields()[0]!.props.onSelectionChange({ nativeEvent: { selection: { start: 4, end: 4 } } });
    });
    await act(async () => {
      fields()[0]!.props.onSubmitEditing({ nativeEvent: { text: 'painlait' } });
    });
    await later(100);
    expect(texts()).toEqual(['pain', 'lait']);
    await act(async () => {
      fields()[1]!.props.onFocus();
      fields()[1]!.props.onChangeText('lait demi-écrémé');
    });
    await press(tree, 'Annuler');
    expect(texts()).toEqual(['pain', 'lait']);
    expect(fields()[1]!.props.value).toBe('lait');
    await press(tree, 'Annuler');
    expect(texts()).toEqual(['painlait']);
    await press(tree, 'Rétablir');
    expect(texts()).toEqual(['pain', 'lait']);
  });

  it('is not offered on a drawing, whose strokes have their own', async () => {
    let drawing = '';
    const tree = await boot(() => {
      drawing = createNote({ kind: 'drawing', title: 'Plan' });
    });
    await go('Note', { id: drawing });
    await press(tree, 'Couleur et papier');
    await act(async () => {
      outermost(tree, props => typeof props.onColor === 'function' && props.visible === true)[0]!.props.onColor('red');
    });
    expect(useLibraryStore.getState().notes[drawing]!.color).toBe('red');
    // The tools' own pair stays (its strokes'); the bar keeps its date.
    expect(outermost(tree, props => props.label === 'Annuler' && props.icon === 'undo' && props.shape === 3)).toHaveLength(0);
  });
});

describe('a colour for several notes', () => {
  it('shows what they share, paints them all in one batch, and says when collections kept theirs', async () => {
    let a = '';
    let b = '';
    let line = '';
    const tree = await boot(() => {
      a = createNote({ kind: 'text', title: 'Code du portail', color: 'yellow' });
      b = createNote({ kind: 'text', title: 'Recette', color: 'yellow' });
      line = createLine({ title: 'Films', color: 'blue' });
      // A collection shows on the board once pinned.
      setPinned(line, true);
    });
    const pick = async (title: string) => {
      await act(async () => {
        outermost(tree, props => typeof props.onLongPress === 'function' && String(props.accessibilityLabel ?? '').startsWith(title))[0]!.props.onLongPress();
      });
    };
    await pick('Code du portail');
    await act(async () => {
      outermost(tree, props => typeof props.onLongPress === 'function' && String(props.accessibilityLabel ?? '').startsWith('Recette'))[0]!.props.onPress();
    });
    await press(tree, 'Couleur et papier');
    const sheet = () => outermost(tree, props => typeof props.onColor === 'function' && props.visible === true)[0]!;
    expect(sheet().props.color).toBe('yellow');
    await act(async () => {
      sheet().props.onColor('aube');
    });
    expect([a, b].map(id => getRecord('note', id)!.fields.color)).toEqual(['aube', 'aube']);
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Couleur changée', action: { label: 'Annuler' }, tone: 'success' });
    await act(async () => {
      sheet().props.onPattern('grid');
    });
    expect(useUiStore.getState().snack?.message).toBe('Papier changé');
    await act(async () => {
      useUiStore.getState().snack!.action!.run();
    });
    expect([a, b].map(id => getRecord('note', id)!.fields.pattern)).toEqual([null, null]);

    // A collection in the selection: the sheet says what it takes, and a gradient leaves it as it was.
    await act(async () => {
      // The card (the chip above the wall opens the collection).
      outermost(tree, props => typeof props.onLongPress === 'function' && String(props.accessibilityLabel ?? '').startsWith('Films'))[0]!.props.onPress();
    });
    await press(tree, 'Couleur et papier');
    expect(sheet().props.note).toBe('Les collections ne prennent qu’une couleur, ni dégradé ni papier.');
    expect(sheet().props.color).toBeUndefined();
    await act(async () => {
      sheet().props.onColor('lagon');
    });
    expect(getRecord('note', line)!.fields.color).toBe('blue');
    expect(getRecord('note', a)!.fields.color).toBe('lagon');
    expect(useUiStore.getState().snack?.message).toBe('Couleur changée sur les notes');
  });
});
