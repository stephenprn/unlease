/**
 * The people a note names: « Ajouter », « Personnes » picks them among Contacts' people (synced as
 * Carnet reads them), the note's foot shows each as a chip opening them in Contacts, and a gift idea
 * kept from Contacts shows its person on the link's page.
 */
import React from 'react';
import { Linking, TextInput } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { formatHlc } from '@unlease/core/sync/hlc';
import { writeFields, type SyncRecord } from '@unlease/core/sync/record';
import { emptyContact } from '@unlease/contacts/models/contacts';
import { contactFields } from '@unlease/contacts/sync/entities';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { resetBootstrap } from '@app/bootstrap';
import { createNote } from '@app/store/actions';
import { mergeRemote, resetLibrary, useLibraryStore } from '@app/store/libraryStore';
import { AppProviders } from '@app/providers/AppProviders';
import { navigationRef } from '@ui/navigation/navigationRef';

jest.useFakeTimers();

Object.assign((TextInput as unknown as { prototype: object }).prototype, { setSelection: jest.fn(), focus: jest.fn() });

const LEA = '0190f0f0-0000-7000-8000-00000000c0de';

function contact(id: string, firstName: string, lastName: string): SyncRecord {
  return writeFields({ type: 'contact', id, fields: {}, clocks: {} }, contactFields({ ...emptyContact(id, 1), firstName, lastName }), formatHlc(Date.now() - 1000, 0, 'server'));
}

const pressable = (tree: ReactTestRenderer, label: string): ReactTestInstance[] => tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function', { deep: false });

it('names people on a note, picked from Contacts’, each opening in Contacts', async () => {
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'people.sqlite' });
  writePreference('onboarded', true);
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  const opened = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<AppProviders />);
  });
  let note = '';
  await act(async () => {
    note = createNote({ kind: 'text', title: 'Anniversaire', body: 'Réserver' });
    mergeRemote([contact(LEA, 'Léa', 'Martin'), contact('0190f0f0-0000-7000-8000-00000000c0df', 'Paul', 'Durand')]);
  });
  await act(async () => {
    (navigationRef.navigate as (...args: unknown[]) => void)('Note', { id: note });
    jest.advanceTimersByTime(400);
  });

  // « Ajouter », then « Personnes »: everyone, by first name; a press names them.
  await act(async () => {
    pressable(tree, 'Ajouter')[0]!.props.onPress();
    jest.advanceTimersByTime(400);
  });
  await act(async () => {
    pressable(tree, 'Personnes')[0]!.props.onPress();
    jest.advanceTimersByTime(400);
  });
  await act(async () => {
    pressable(tree, 'Léa Martin')[0]!.props.onPress();
    jest.advanceTimersByTime(400);
  });
  expect(useLibraryStore.getState().notes[note]!.contactIds).toEqual([LEA]);

  // Pressed again, they are named no more; and again, they are back.
  await act(async () => {
    pressable(tree, 'Léa Martin')[0]!.props.onPress();
  });
  expect(useLibraryStore.getState().notes[note]!.contactIds).toEqual([]);
  await act(async () => {
    pressable(tree, 'Léa Martin')[0]!.props.onPress();
  });

  // At the note's foot, a chip opens them in Contacts.
  const chip = pressable(tree, 'Léa Martin, dans Contacts');
  expect(chip.length).toBeGreaterThan(0);
  await act(async () => {
    chip[0]!.props.onPress();
  });
  expect(opened).toHaveBeenCalledWith(`unlease-contacts://contact/${LEA}`);
  await act(async () => tree.unmount());
});
