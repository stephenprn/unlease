/**
 * Every screen mounts, on an empty library and on a lived-in one, inside the real providers
 * and the real navigator.
 */
import React from 'react';
import { TextInput } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { INBOX_ID } from '@unlease/notes/models/entities';
import { plural } from '@unlease/core/services/format';
import { closeDatabase } from '@data/db/database';
import { writePreference } from '@data/repositories/stateRepository';
import { openDatabase } from '@data/db/database';
import { resetBootstrap } from '@app/bootstrap';
import { addCheck, addLink, createLabel, createLine, createNote, setLabels, setReminder, toggleCheck, trashNotes, updateLink } from '@app/store/actions';
import { acknowledge, getRecord, mergeRemote, resetLibrary, useLibraryStore } from '@app/store/libraryStore';
import { setSyncState } from '@app/store/syncStore';
import { useUiStore } from '@app/store/uiStore';
import { formatHlc } from '@unlease/core/sync/hlc';
import { writeFields } from '@unlease/core/sync/record';
import { AppProviders } from '@app/providers/AppProviders';
import { navigationRef } from '@ui/navigation/navigationRef';
import type { RootStackParamList } from '@ui/navigation/types';

jest.useFakeTimers();

// The preset's TextInput mock has no caret: the checklist places it after a split or a join.
const setSelection = jest.fn();
Object.assign((TextInput as unknown as { prototype: object }).prototype, { setSelection });

/** The outermost elements matching, so a composite and the host it renders count once. */
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

/** The text inside one element (a drawer row). */
function textIn(node: ReactTestInstance): string {
  return node.children.map(child => (typeof child === 'string' ? child : textIn(child))).join('');
}

let mounted: ReactTestRenderer | null = null;

async function boot(onboarded: boolean, seed?: () => void): Promise<ReactTestRenderer> {
  // One app at a time: one left mounted would re-render, outside act, on every reset below.
  const previous = mounted;
  if (previous) await act(async () => previous.unmount());
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'render.sqlite' });
  if (onboarded) writePreference('onboarded', true);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<AppProviders />);
  });
  if (seed) {
    await act(async () => {
      seed();
    });
  }
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

let ids: Record<string, string> = {};

function seedLibrary(): void {
  const label = createLabel('Perso');
  const text = createNote({ kind: 'text', title: 'Code du portail', body: 'Portail : 4512B', color: 'yellow' });
  setLabels(text, [label]);
  setReminder(text, Date.now() + 86_400_000);
  const list = createNote({ kind: 'checklist', title: 'Courses samedi', pinned: true });
  addCheck(list, 'Lait');
  toggleCheck(addCheck(list, 'Pain'));
  const line = createLine({ title: 'Films', hint: 'Films à voir' });
  const ready = addLink('https://cinema.fr/film', { noteId: line });
  updateLink(ready, { status: 'ready', title: 'Les Feux de septembre', kind: 'film', price: 12.5, currency: 'EUR', attributes: [{ label: 'Durée', value: '1 h 52' }] });
  const failed = addLink('https://bloque.fr/page', { noteId: line });
  updateLink(failed, { status: 'failed', error: 'La page refuse les robots.' });
  const skipped = addLink('https://plain.fr/x', { noteId: INBOX_ID });
  updateLink(skipped, { status: 'skipped' });
  const pending = addLink('https://lent.fr/y', { autoFile: true });
  const gone = createNote({ kind: 'text', title: 'À jeter' });
  trashNotes([gone]);
  ids = { label, text, list, line, ready, failed, skipped, pending };
}

describe('first run', () => {
  it('opens on the setup screen', async () => {
    const tree = await boot(false);
    expect(textOf(tree)).toContain('Se connecter');
    expect(textOf(tree)).toContain('Garder mes notes sur ce téléphone');
  });
});

describe.each([
  ['an empty library', undefined],
  ['a lived-in library', seedLibrary],
] as const)('every screen on %s', (_name, seed) => {
  let tree: ReactTestRenderer;
  beforeAll(async () => {
    tree = await boot(true, seed);
  });

  it('shows the board and its views', async () => {
    if (seed) {
      expect(textOf(tree)).toContain('Courses samedi');
      expect(textOf(tree)).toContain('Épinglées');
      // A card says its labels: a narrow footer shows their tags alone.
      expect(outermost(tree, props => props.accessibilityLabel === 'Code du portail, label Perso')).toHaveLength(1);
    } else {
      expect(textOf(tree)).toContain('Le tableau est vide');
    }
    for (const view of ['reminders', 'archive', 'trash'] as const) {
      await go('Board', { view });
    }
    expect(textOf(tree)).toContain('Corbeille');
    await go('Board', { view: 'notes' });
  });

  it('opens the editors, the lines and the settings', async () => {
    if (seed) {
      await go('Note', { id: ids.text! });
      expect(textOf(tree)).toContain('Modifiée');
      await go('Note', { id: ids.list! });
      expect(textOf(tree)).toContain('élément coché');
      await go('Line', { id: ids.line! });
      expect(textOf(tree)).toContain('Les Feux de septembre');
      expect(textOf(tree)).toContain('La page refuse les robots.');
      for (const key of ['ready', 'failed', 'skipped', 'pending'] as const) {
        await go('Link', { id: ids[key]! });
      }
      // No server here: a link is kept plain and says why, never "reading" forever.
      expect(textOf(tree)).toContain('Pas lu');
    }
    await go('Line', { id: INBOX_ID });
    expect(textOf(tree)).toContain('Non classé');
    await go('Lines');
    expect(textOf(tree)).toContain('Collections');
    await go('Labels');
    expect(textOf(tree)).toContain('Labels');
    await go('Settings');
    expect(textOf(tree)).toContain('Réglages');
    // The colours and the ground, each with its own grain switch beside the paper's.
    for (const words of ['Palettes', 'Sur mesure', 'Principale', 'Couleurs unies', 'Les vôtres', 'Grain sur le fond', 'Grain du papier']) expect(textOf(tree)).toContain(words);
    // The server and Claude's reading moved to the Administration.
    expect(textOf(tree)).not.toContain('Tester et enregistrer');
    await go('Admin');
    expect(textOf(tree)).toContain('Administration');
    expect(textOf(tree)).toContain('Se connecter');
    // Without a server, nothing to back up or to send to a drive yet.
    expect(textOf(tree)).not.toContain('Sauvegarde sur S3');
    await go('Import');
    expect(textOf(tree)).toContain('Google Takeout');
  });
});

describe('the board head and the drawer', () => {
  it('says in words what keeps changes from the server, holds it through a retry, and the dot leads to the server in the Administration', async () => {
    const tree = await boot(true);
    // Alone on the phone by choice: nothing to say.
    expect(textOf(tree)).not.toContain('Pas de serveur');
    const waiting = `Hors ligne : ${plural(3, 'modification')} en attente.`;
    await act(async () => {
      setSyncState({ phase: 'offline', pending: 3, message: 'Serveur injoignable' });
    });
    expect(textOf(tree)).toContain(waiting);
    // A retry passes through "syncing": the line stays.
    await act(async () => {
      setSyncState({ phase: 'syncing' });
    });
    expect(textOf(tree)).toContain(waiting);
    await act(async () => {
      setSyncState({ phase: 'offline' });
    });
    await act(async () => {
      outermost(tree, props => props.accessibilityLabel === waiting && typeof props.onPress === 'function')[0]!.props.onPress();
    });
    expect(useUiStore.getState().snack).toMatchObject({ message: waiting, action: { label: 'Serveur' } });
    await act(async () => {
      useUiStore.getState().snack!.action!.run();
      useUiStore.setState({ snack: null });
      jest.advanceTimersByTime(400);
    });
    expect(navigationRef.getCurrentRoute()?.name).toBe('Admin');
    await go('Board', { view: 'notes' });
    await act(async () => {
      setSyncState({ phase: 'unauthorized', message: 'Jeton refusé par le serveur' });
    });
    expect(textOf(tree)).toContain('Le serveur refuse le jeton.');
    await act(async () => {
      setSyncState({ phase: 'synced', pending: 0, message: null, lastSyncAt: Date.now() });
    });
    expect(textOf(tree)).not.toContain('Hors ligne');
    expect(textOf(tree)).not.toContain('Le serveur refuse le jeton.');
  });

  it('lists "Non classé" in the drawer only while a link waits in it', async () => {
    const tree = await boot(true);
    const rows = () => outermost(tree, props => props.accessibilityRole === 'menuitem').map(textIn);
    const inbox = () => rows().find(row => row.startsWith('Non classé'));
    expect(inbox()).toBeUndefined();
    // No collection to list: the row that makes one.
    expect(rows()).toContain('Créer une collection');
    await act(async () => {
      addLink('https://plain.fr/x', { noteId: INBOX_ID });
    });
    // Its count at the row's end, as on the web's navigation.
    expect(inbox()).toBe('Non classé1');
    expect(rows()).not.toContain('Créer une collection');
  });
});

describe('a link added on a collection’s page', () => {
  it('says it is in this collection already, or in another one, where it is added with that reading', async () => {
    let films = '';
    let cadeaux = '';
    const tree = await boot(true, () => {
      films = createLine({ title: 'Films' });
      cadeaux = createLine({ title: 'Cadeaux' });
      updateLink(addLink('https://cinema.fr/cleo', { noteId: films }), { status: 'ready', title: 'Cléo de 5 à 7', analyzedAt: 1 });
    });
    await go('Line', { id: cadeaux });
    const field = () => tree.root.findByProps({ accessibilityLabel: 'Adresse du lien' });
    const submit = async (url: string) => {
      await act(async () => field().props.onChangeText(url));
      await act(async () => field().props.onSubmitEditing());
    };
    await submit('https://cinema.fr/cleo?utm_source=x');
    expect(useUiStore.getState().snack?.message).toBe('Ce lien est déjà dans Films : ajouté ici aussi');
    const copy = useLibraryStore.getState().linksByNote[cadeaux]!;
    expect(copy).toHaveLength(1);
    expect(useLibraryStore.getState().links[copy[0]!]).toMatchObject({ status: 'ready', title: 'Cléo de 5 à 7' });
    await submit('https://cinema.fr/cleo');
    expect(useUiStore.getState().snack?.message).toBe('Ce lien est déjà dans cette collection');
    expect(useLibraryStore.getState().linksByNote[cadeaux]).toEqual(copy);
  });
});

describe('edits from another device on an open screen', () => {
  it('the link page shows a comment changed elsewhere, and leaving it never writes the old one back', async () => {
    let link = '';
    const tree = await boot(true, () => {
      link = addLink('https://cinema.fr/film', { noteId: INBOX_ID });
      updateLink(link, { comment: 'avant' });
      // Already on the server: what arrives next is a later edit, not a concurrent one.
      acknowledge([getRecord('link', link)!]);
    });
    await go('Link', { id: link });
    const field = () => tree.root.findByProps({ accessibilityLabel: 'Votre note sur ce lien' }).props.value as string;
    expect(field()).toBe('avant');
    const record = getRecord('link', link)!;
    await act(async () => {
      mergeRemote([writeFields(record, { comment: 'écrit sur le web' }, formatHlc(Date.now() + 60_000, 0, 'web001'))]);
      jest.advanceTimersByTime(50);
    });
    expect(field()).toBe('écrit sur le web');
    await go('Board', { view: 'notes' });
    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
    expect(getRecord('link', link)!.fields.comment).toBe('écrit sur le web');
  });
});

describe('a checklist typed as in Keep', () => {
  it('splits an item at the caret on Enter, joins it back from its start, and offers a removed one back', async () => {
    let list = '';
    const tree = await boot(true, () => {
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
    // The caret is placed once the new item has rendered.
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(texts()).toEqual(['pain', 'lait']);
    expect(fields().map(field => field.props.value)).toEqual(['pain', 'lait']);
    expect(setSelection).toHaveBeenLastCalledWith(0, 0);

    // The new item's caret is at its start: Backspace joins it to "pain", the caret where they meet.
    await act(async () => {
      fields()[1]!.props.onKeyPress({ nativeEvent: { key: 'Backspace' } });
    });
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(texts()).toEqual(['painlait']);
    expect(fields().map(field => field.props.value)).toEqual(['painlait']);
    expect(setSelection).toHaveBeenLastCalledWith(4, 4);

    await act(async () => {
      fields()[0]!.props.onFocus();
    });
    await act(async () => {
      outermost(tree, props => props.label === 'Supprimer l’élément' && props.onPress !== undefined)[0]!.props.onPress();
    });
    expect(texts()).toEqual([]);
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Élément supprimé', action: { label: 'Annuler' } });
    await act(async () => {
      useUiStore.getState().snack!.action!.run();
    });
    expect(texts()).toEqual(['painlait']);
  });
});

describe('a note in the bin', () => {
  it('can only be restored or deleted for good', async () => {
    let gone = '';
    const tree = await boot(true, () => {
      gone = createNote({ kind: 'checklist', title: 'Vieille liste' });
      addCheck(gone, 'à faire');
      toggleCheck(addCheck(gone, 'fait'));
      setReminder(gone, Date.now() + 86_400_000);
      trashNotes([gone]);
    });
    await go('Note', { id: gone });
    expect(textOf(tree)).toContain('Une note dans la corbeille ne peut pas être modifiée.');
    const boxes = outermost(tree, props => props.accessibilityRole === 'checkbox');
    expect(boxes).toHaveLength(2);
    expect(boxes.every(box => box.props.disabled === true)).toBe(true);
    expect(outermost(tree, props => props.accessibilityLabel === 'Modifier le rappel')[0]!.props.disabled).toBe(true);

    await act(async () => {
      outermost(tree, props => props.label === 'Supprimer définitivement' && props.onPress !== undefined)[0]!.props.onPress();
    });
    await act(async () => {
      outermost(tree, props => props.title === 'Supprimer définitivement ?' && props.visible === true)[0]!.props.onConfirm();
      jest.advanceTimersByTime(400);
    });
    expect(getRecord('note', gone)!.fields.deletedAt).not.toBeNull();
    expect(useUiStore.getState().snack?.message).toBe('Note supprimée définitivement');
  });

  it('says so when a paste is longer than a note can hold', async () => {
    let id = '';
    const tree = await boot(true, () => {
      id = createNote({ kind: 'text', title: 'Long' });
      useUiStore.setState({ snack: null });
    });
    await go('Note', { id });
    const body = outermost(tree, props => props.placeholder === 'Note' && typeof props.onChangeText === 'function')[0]!;
    await act(async () => {
      body.props.onChangeText('x'.repeat(200_000));
    });
    expect(useUiStore.getState().snack?.message).toBe('Texte coupé à 200\u202f000 caractères.');
  });

  it('is not where an empty note goes: binned, it is discarded on the way out, with no "Annuler"', async () => {
    let empty = '';
    const tree = await boot(true, () => {
      empty = createNote({ kind: 'text' });
      useUiStore.setState({ snack: null });
    });
    await go('Note', { id: empty });
    await act(async () => {
      const menu = outermost(tree, props => Array.isArray(props.items) && (props.items as { label: string }[]).some(item => item.label === 'Supprimer'))[0]!;
      (menu.props.items as { label: string; onPress: () => void }[]).find(item => item.label === 'Supprimer')!.onPress();
      jest.advanceTimersByTime(1_000);
    });
    expect(useUiStore.getState().snack).toBeNull();
    expect(getRecord('note', empty)!.fields.trashedAt).toBeNull();
    expect(getRecord('note', empty)!.fields.deletedAt).not.toBeNull();
  });
});
