/**
 * A person mentioned in a formatted note: « @ » typed where a word starts asks for one of Contacts'
 * people (synced as Carnet reads them); the one picked takes the « @ »'s place, the note becomes
 * formatted, the field shows their name and typing goes on after it; a rename shows at once; the caret
 * on the mention offers to open them in Contacts.
 */
import React from 'react';
import { Linking, TextInput } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { formatHlc } from '@unlease/core/sync/hlc';
import { writeFields, type SyncRecord } from '@unlease/core/sync/record';
import { emptyContact } from '@unlease/contacts/models/contacts';
import { contactFields } from '@unlease/contacts/sync/entities';
import { eventFields } from '@unlease/calendar/sync/entities';
import { bodyText } from '@unlease/notes/services/noteBody';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { resetBootstrap } from '@app/bootstrap';
import { createNote } from '@app/store/actions';
import { mergeRemote, resetLibrary, useLibraryStore } from '@app/store/libraryStore';
import { AppProviders } from '@app/providers/AppProviders';
import { navigationRef } from '@ui/navigation/navigationRef';

jest.useFakeTimers();

const setSelection = jest.fn();
Object.assign((TextInput as unknown as { prototype: object }).prototype, { setSelection, focus: jest.fn() });

const LEA = '0190f0f0-0000-7000-8000-00000000c0de';

function textOf(tree: ReactTestRenderer): string {
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') parts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'children' in node) walk((node as { children: unknown }).children);
  };
  walk(tree.toJSON());
  return parts.join('');
}

/** A contact as the server hands it over, at `wall`. */
function contact(firstName: string, wall: number): SyncRecord {
  return writeFields({ type: 'contact', id: LEA, fields: {}, clocks: {} }, contactFields({ ...emptyContact(LEA, 1), firstName, lastName: 'Martin' }), formatHlc(wall, 0, 'server'));
}

const field = (tree: ReactTestRenderer): ReactTestInstance => tree.root.findAll(node => node.props.accessibilityLabel === 'Texte de la note' && typeof node.props.onChangeText === 'function', { deep: false })[0]!;

it('mentions a person picked after « @ », and names them as they are now', async () => {
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'mentions.sqlite' });
  writePreference('onboarded', true);
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  const opened = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<AppProviders />);
  });
  let note = '';
  await act(async () => {
    note = createNote({ kind: 'text', title: 'Samedi', body: 'Penser à ' });
    mergeRemote([contact('Léa', Date.now() - 1000)]);
  });
  await act(async () => {
    (navigationRef.navigate as (...args: unknown[]) => void)('Note', { id: note });
    jest.advanceTimersByTime(400);
  });

  // « @ » typed after a space: who? The people ride on the keyboard, the word after it narrowing them.
  await act(async () => {
    field(tree).props.onFocus();
    field(tree).props.onSelectionChange({ nativeEvent: { selection: { start: 9, end: 9 } } });
    field(tree).props.onChangeText('Penser à @');
  });
  expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Mentionner un contact ou un événement', { deep: false }).length).toBeGreaterThan(0);
  await act(async () => {
    field(tree).props.onChangeText('Penser à @lé');
  });
  expect(textOf(tree)).toContain('Léa Martin');
  const row = tree.root.findAll(node => typeof node.props.onPress === 'function' && node.findAll(child => child.children.includes('Léa Martin')).length > 0, { deep: false });
  await act(async () => {
    row[row.length - 1]!.props.onPress();
    jest.advanceTimersByTime(400);
  });
  let stored = useLibraryStore.getState().notes[note]!;
  expect(stored.rich).toBe(true);
  expect(stored.body).toContain(`{@contact=${LEA}}`);
  expect(bodyText(stored)).toBe('Penser à Léa Martin ');
  // The field shows the name; typing goes on after it.
  expect(textOf(tree)).toContain('@Léa Martin');
  await act(async () => {
    field(tree).props.onSelectionChange({ nativeEvent: { selection: { start: 21, end: 21 } } });
    field(tree).props.onChangeText('Penser à @Léa Martin demain');
    jest.advanceTimersByTime(400);
  });
  stored = useLibraryStore.getState().notes[note]!;
  expect(bodyText(stored)).toBe('Penser à Léa Martin demain');

  // A rename on another device: the field spells the new name.
  await act(async () => {
    mergeRemote([contact('Lena', Date.now() + 1000)]);
  });
  expect(textOf(tree)).toContain('@Lena Martin');
  expect(bodyText(useLibraryStore.getState().notes[note]!)).toBe('Penser à Lena Martin demain');

  // The caret on the mention: its person, in Contacts.
  await act(async () => {
    field(tree).props.onSelectionChange({ nativeEvent: { selection: { start: 14, end: 14 } } });
  });
  const open = tree.root.findAll(node => node.props.accessibilityLabel === 'Ouvrir Lena Martin dans Contacts' && typeof node.props.onPress === 'function', { deep: false });
  await act(async () => {
    open[0]!.props.onPress();
  });
  expect(opened).toHaveBeenCalledWith(`unlease-contacts://contact/${LEA}`);

  // A Backspace in the name takes the mention whole.
  await act(async () => {
    field(tree).props.onSelectionChange({ nativeEvent: { selection: { start: 15, end: 15 } } });
    field(tree).props.onChangeText('Penser à @Lena artin demain');
    jest.advanceTimersByTime(400);
  });
  expect(bodyText(useLibraryStore.getState().notes[note]!)).toBe('Penser à  demain');
  await act(async () => tree.unmount());
});

const DINNER = '0190f0f0-0000-7000-8000-0000000e0e01';

/** An event of Agenda's as the server hands it over, at `wall`, in two days at 20:00. */
function event(title: string, wall: number): SyncRecord {
  const date = new Date(Date.now() + 2 * 86_400_000);
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return writeFields({ type: 'calendarEvent', id: DINNER, fields: {}, clocks: {} }, eventFields({ ...EMPTY_EVENT, title, start: `${day}T20:00`, end: `${day}T22:00`, timeZone: 'Europe/Paris' }), formatHlc(wall, 0, 'server'));
}

const EMPTY_EVENT = { title: '', description: '', place: '', start: '', end: '', timeZone: '', rrule: '', exdates: [], recurringId: null, originalStart: '', reminders: [], labelIds: [], contactIds: [], files: [], feedId: null, uid: '', url: '', color: null, trashedAt: null, createdAt: 1, deletedAt: null } as const;

it('mentions an event of Agenda’s picked after « @ », names it as it is now, and opens it in Agenda', async () => {
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'mentions-events.sqlite' });
  writePreference('onboarded', true);
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  const opened = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<AppProviders />);
  });
  let note = '';
  await act(async () => {
    note = createNote({ kind: 'text', title: 'Samedi', body: 'Voir ' });
    mergeRemote([event('Dîner chez Paul', Date.now() - 1000)]);
  });
  await act(async () => {
    (navigationRef.navigate as (...args: unknown[]) => void)('Note', { id: note });
    jest.advanceTimersByTime(400);
  });
  await act(async () => {
    field(tree).props.onFocus();
    field(tree).props.onSelectionChange({ nativeEvent: { selection: { start: 5, end: 5 } } });
    field(tree).props.onChangeText('Voir @');
  });
  expect(textOf(tree)).toContain('Dîner chez Paul');
  const row = tree.root.findAll(node => typeof node.props.onPress === 'function' && node.findAll(child => child.children.includes('Dîner chez Paul')).length > 0, { deep: false });
  await act(async () => {
    row[row.length - 1]!.props.onPress();
    jest.advanceTimersByTime(400);
  });
  const stored = useLibraryStore.getState().notes[note]!;
  expect(stored.body).toContain(`{@event=${DINNER}}`);
  expect(bodyText(stored)).toBe('Voir Dîner chez Paul ');
  await act(async () => {
    mergeRemote([event('Dîner chez Léa', Date.now() + 1000)]);
  });
  expect(textOf(tree)).toContain('@Dîner chez Léa');
  await act(async () => {
    field(tree).props.onSelectionChange({ nativeEvent: { selection: { start: 8, end: 8 } } });
  });
  const open = tree.root.findAll(node => node.props.accessibilityLabel === 'Ouvrir Dîner chez Léa dans Agenda' && typeof node.props.onPress === 'function', { deep: false });
  await act(async () => {
    open[0]!.props.onPress();
  });
  expect(opened).toHaveBeenCalledWith(`unlease-agenda://event/${DINNER}`);
  await act(async () => tree.unmount());
});
