/**
 * « @ » in an event's description on the phone: typed where a word starts, it offers what it may
 * mention as the word after it grows, the best first; a tap puts the mention in place of « @word »,
 * and the event keeps it as markup.
 */
import { Linking } from 'react-native';
import { act } from 'react-test-renderer';

import { addDays, today } from '@unlease/calendar/services/time';
import { setServer } from '@shared/app/store/settingsStore';
import { useLibraryStore, writeLocal } from '@app/store/libraryStore';
import { navigationRef } from '@ui/navigation/navigationRef';

import { __reset as resetSuite } from '../../../../../../shared/__mocks__/NativeSuiteLink';
import { boot, fakeFetch, inputs, pressableWithText, pressables, settle, textOf, unmountAll } from '../../../screens/__tests__/harness';

jest.useFakeTimers();

const day = today(Date.now());
const person = (id: string, firstName: string, lastName: string, favorite = false) => ({
  type: 'contact' as const,
  id,
  patch: { firstName, lastName, phones: [], emails: [], addresses: [], labelIds: [], favorite, createdAt: 1, deletedAt: null, trashedAt: null },
});

describe('a mention typed in an event’s description', () => {
  beforeEach(() => {
    resetSuite();
    global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
  });

  afterEach(async () => {
    await act(async () => setServer(null));
  });

  afterAll(unmountAll);

  it('is offered as « @word » grows, and the one tapped takes its place', async () => {
    const tree = await boot({ onboarded: true });
    await act(async () => {
      writeLocal([person('lea', 'Léa', 'Martin', true), person('paul', 'Paul', 'Durand'), person('marc', 'Marc', 'Garnier')]);
    });
    await act(async () => {
      navigationRef.navigate('Edit', { title: 'Dîner', start: `${addDays(day, 3)}T20:00`, end: `${addDays(day, 3)}T23:00` });
    });
    await settle();
    const field = (): ReturnType<typeof inputs>[number] => inputs(tree, 'Description')[0]!;
    await act(async () => {
      field().props.onFocus?.({});
      field().props.onChangeText('Avec @');
    });
    await settle(50);
    // Nothing typed after it yet: the favourites first.
    expect(pressables(tree, 'Léa Martin')).toHaveLength(1);
    await act(async () => {
      field().props.onChangeText('Avec @mar');
    });
    await settle(50);
    // « mar » starts « Marc » before it starts « Martin ».
    const text = textOf(tree);
    expect(text.indexOf('Marc Garnier')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('Marc Garnier')).toBeLessThan(text.indexOf('Léa Martin'));
    expect(pressables(tree, 'Paul Durand')).toHaveLength(0);
    await act(async () => {
      pressables(tree, 'Léa Martin')[0]!.props.onPress();
    });
    await settle(50);
    expect(field().props.value).toBe('Avec @Léa Martin ');
    // The panel is gone once the mention is in.
    expect(pressables(tree, 'Marc Garnier')).toHaveLength(0);
    await act(async () => {
      pressableWithText(tree, 'Enregistrer').props.onPress();
    });
    await settle();
    const saved = Object.values(useLibraryStore.getState().events).find(event => event.title === 'Dîner')!;
    expect(saved.description).toBe('Avec {@contact=lea} ');
  });

  it('gives up after a space once nothing answers', async () => {
    const tree = await boot({ onboarded: true });
    await act(async () => {
      writeLocal([person('lea', 'Léa', 'Martin')]);
    });
    await act(async () => {
      navigationRef.navigate('Edit', { title: 'Rendez-vous', start: `${addDays(day, 3)}T20:00`, end: `${addDays(day, 3)}T21:00` });
    });
    await settle();
    const field = (): ReturnType<typeof inputs>[number] => inputs(tree, 'Description')[0]!;
    await act(async () => {
      field().props.onFocus?.({});
      field().props.onChangeText('@zz');
    });
    await settle(50);
    expect(textOf(tree)).toContain('Rien ne s’appelle « zz ».');
    await act(async () => {
      field().props.onChangeText('@zz ');
    });
    await settle(50);
    expect(textOf(tree)).not.toContain('Rien ne s’appelle');
  });
});
