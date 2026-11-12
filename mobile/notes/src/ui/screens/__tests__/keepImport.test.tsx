/**
 * The Keep import's wizard from Réglages › Données (`features/importing/KeepWizard`): the archive
 * picked and read, every note previewed (one left out by its box, the bin's named), the choices (a
 * list of links with a line that holds none, replaced by a link whose address is asked for first),
 * nothing written before « Importer », then the records, the report and the board; the archive's
 * files removed when it is set aside. And « Effacer des données »'s screen, from the same section.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { keepImportAction } from '@unlease/notes/services/keepImport';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { resetBootstrap } from '@app/bootstrap';
import { createLabel, createNote } from '@app/store/actions';
import { resetLibrary, useLibraryStore } from '@app/store/libraryStore';
import { AppProviders } from '@app/providers/AppProviders';
import { navigationRef } from '@ui/navigation/navigationRef';
import type { RootStackParamList } from '@ui/navigation/types';

import { state as media, __reset as resetMedia } from '../../../../../shared/__mocks__/NativeMedia';

jest.useFakeTimers();

function textOf(tree: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') parts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'children' in node) walk((node as { children: unknown }).children);
  };
  walk(tree.toJSON());
  return parts.join(' ').replace(/ /g, ' ');
}

/** Pressable things by their accessible name (and role), outermost, in the order drawn. */
function pressables(tree: ReactTestRenderer, label: string, role?: string): ReactTestInstance[] {
  return tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function' && (!role || node.props.accessibilityRole === role), { deep: false });
}

async function settle(ms = 400): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function press(tree: ReactTestRenderer, label: string, role?: string): Promise<void> {
  const node = pressables(tree, label, role).pop();
  if (!node) throw new Error(`Nothing to press named « ${label} »`);
  await act(async () => {
    node.props.onPress();
  });
  await settle();
}

async function go<K extends keyof RootStackParamList>(screen: K, params?: RootStackParamList[K]): Promise<void> {
  await act(async () => {
    (navigationRef.navigate as (...args: unknown[]) => void)(screen, params);
    jest.advanceTimersByTime(400);
  });
}

let mounted: ReactTestRenderer | null = null;

async function boot(seed?: () => void): Promise<ReactTestRenderer> {
  const previous = mounted;
  if (previous) await act(async () => previous.unmount());
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'keep.sqlite' });
  writePreference('onboarded', true);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<AppProviders />);
  });
  if (seed) {
    await act(async () => {
      seed();
    });
  }
  await settle(500);
  mounted = tree;
  return tree;
}

const USEC = 1_690_000_000_000_000;
const keep = (fields: Record<string, unknown>, at: number) => JSON.stringify({ isTrashed: false, createdTimestampUsec: USEC + at, userEditedTimestampUsec: 1_700_000_000_000_000 + at, ...fields });

/** A Takeout archive: a list of links with one line that holds none, a checklist, a note of Keep's bin. */
function offerArchive(): void {
  const files: Record<string, string> = {
    'Lectures.json': keep({ title: 'Lectures', textContent: 'À lire avant mai\nhttps://keep.example/a\nhttps://keep.example/b\nhttps://keep.example/c' }, 1),
    'Courses.json': keep({ title: 'Courses', listContent: [{ text: 'lait', isChecked: false }, { text: 'pain', isChecked: true }] }, 2),
    'Vieux.json': keep({ title: 'Vieux brouillon', textContent: 'à jeter', isTrashed: true }, 3),
  };
  media.nextArchive = { status: 'ok', message: '', dir: '/cache/keep', entries: Object.keys(files).map(name => ({ name: `Takeout/Keep/${name}`, path: `/cache/keep/${name}`, bytes: 10 })) };
  media.texts = Object.fromEntries(Object.entries(files).map(([name, text]) => [`/cache/keep/${name}`, text]));
}

const titled = (title: string) => Object.values(useLibraryStore.getState().notes).find(note => note.title === title && note.deletedAt === null);

beforeEach(() => {
  resetMedia();
  global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
});

describe('the Keep import', () => {
  it('reads, previews, asks, then writes: a line without a link replaced by one, its address asked for first', async () => {
    const tree = await boot();
    await go('Settings');
    await press(tree, 'Importer');
    expect(textOf(tree)).toContain('Depuis Google Keep');
    // A refused file is said on the form's line.
    media.nextArchive = { status: 'error', message: '', dir: '', entries: [] };
    await press(tree, 'Choisir l’archive');
    expect(textOf(tree)).toContain('Archive illisible : choisissez le fichier .zip téléchargé depuis Google Takeout.');

    offerArchive();
    await press(tree, 'Choisir l’archive');
    // Every note, what it becomes, and what is left out and why.
    expect(textOf(tree)).toContain('Ce que contient le fichier');
    expect(textOf(tree)).toContain('2 notes');
    expect(textOf(tree)).toContain('Devient une collection de 3 liens');
    expect(textOf(tree)).toContain('Vieux brouillon');
    expect(textOf(tree)).toContain('Dans la corbeille de Keep');
    // One note left out by its box.
    await press(tree, 'Importer Courses', 'checkbox');
    await press(tree, 'Continuer');

    expect(textOf(tree)).toContain('Lignes sans lien');
    expect(textOf(tree)).toContain('Ajoutée au commentaire du premier lien');
    await press(tree, 'Lien', 'radio');
    // The address is asked for before anything is written.
    await press(tree, keepImportAction(1));
    expect(textOf(tree)).toContain('Saisissez l’adresse du lien.');
    expect(textOf(tree)).toContain('Un champ est à corriger.');
    expect(titled('Lectures')).toBeUndefined();
    const field = tree.root.findAll(node => node.type === TextInput && String(node.props.accessibilityLabel ?? '').startsWith('Adresse du lien')).pop()!;
    await act(async () => {
      field.props.onChangeText('keep.example/mai');
    });
    await press(tree, keepImportAction(1));
    await settle();

    expect(textOf(tree)).toContain('Vos notes Keep sont arrivées');
    expect(textOf(tree)).toContain('1 ligne sans lien remplacée par un lien');
    expect(textOf(tree)).toContain('1 note décochée dans l’aperçu');
    const state = useLibraryStore.getState();
    const lectures = titled('Lectures')!;
    expect(lectures.kind).toBe('links');
    expect((state.linksByNote[lectures.id] ?? []).map(id => [state.links[id]!.url, state.links[id]!.comment])).toEqual([
      ['https://keep.example/mai', 'À lire avant mai'],
      ['https://keep.example/a', ''],
      ['https://keep.example/b', ''],
      ['https://keep.example/c', ''],
    ]);
    expect(titled('Courses')).toBeUndefined();
    // The archive's files are gone once imported.
    expect(media.removed).toContain('/cache/keep');

    await press(tree, 'Voir le tableau');
    expect(navigationRef.getCurrentRoute()?.name).toBe('Board');
  });

  it('sets the archive aside, its files removed, going back to the start or leaving', async () => {
    const tree = await boot();
    await go('Import');
    offerArchive();
    await press(tree, 'Choisir l’archive');
    await press(tree, 'Retour');
    expect(textOf(tree)).toContain('Depuis Google Keep');
    expect(media.removed).toContain('/cache/keep');

    media.removed = [];
    await press(tree, 'Choisir l’archive');
    await act(async () => {
      navigationRef.goBack();
    });
    await settle(1_000);
    expect(media.removed).toContain('/cache/keep');
    expect(titled('Lectures')).toBeUndefined();
  });
});

describe('« Effacer des données »', () => {
  it('lists Carnet’s parts, counted, from the last row of « Données »', async () => {
    const tree = await boot(() => {
      createNote({ kind: 'text', title: 'Idée' });
      createNote({ kind: 'checklist', title: 'Courses' });
      createLabel('Perso');
    });
    await go('Settings');
    await press(tree, 'Effacer des données');
    expect(navigationRef.getCurrentRoute()?.name).toBe('Erase');
    const text = textOf(tree);
    expect(text).toContain('Notes, listes et dessins');
    expect(text).toContain('2 notes');
    expect(text).toContain('1 label, retirés des notes qui les portent');
    expect(text).toContain('Liens de Non classé');
  });
});
