/**
 * The event form's time picker, Material's: the dial turned (here through TalkBack's actions, as a
 * finger cannot be in a test) or the two numbers typed; « OK » keeps the time (the start moving the
 * end with it), a time that is not one is said and kept open, « Annuler » leaves it.
 */
import { Linking } from 'react-native';
import { act, type ReactTestInstance } from 'react-test-renderer';

import { addDays, today } from '@unlease/calendar/services/time';
import { navigationRef } from '@ui/navigation/navigationRef';

import { __reset as resetSuite } from '../../../../../../shared/__mocks__/NativeSuiteLink';
import { boot, fakeFetch, inputs, pressables, settle, textOf, unmountAll } from '../../../screens/__tests__/harness';

jest.useFakeTimers();

const day = addDays(today(Date.now()), 3);
type Tree = Awaited<ReturnType<typeof boot>>;

/** The value a when line's time button reads out. */
const timeOf = (tree: Tree, label: string): string => (pressables(tree, label)[0]!.props.accessibilityValue as { text: string }).text;

async function press(tree: Tree, label: string): Promise<void> {
  const found = pressables(tree, label);
  expect(found.length).toBeGreaterThan(0);
  await act(async () => found[found.length - 1]!.props.onPress());
  await settle(50);
}

const dial = (tree: Tree): ReactTestInstance => tree.root.find(node => node.props.accessibilityRole === 'adjustable' && typeof node.props.onAccessibilityAction === 'function');

async function open(tree: Tree, label: string): Promise<void> {
  await act(async () => {
    navigationRef.navigate('Edit', { title: 'Dîner', start: `${day}T20:00`, end: `${day}T23:00` });
  });
  await settle();
  await press(tree, label);
  await settle();
}

describe('the event form’s time picker', () => {
  beforeEach(() => {
    resetSuite();
    global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
  });

  afterAll(unmountAll);

  it('turns the dial on the hours, then the minutes, and keeps the time with « OK »', async () => {
    const tree = await boot({ onboarded: true });
    await open(tree, 'Heure de début');
    expect(textOf(tree)).toContain('Sélectionner l’heure');
    await act(async () => dial(tree).props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }));
    await press(tree, 'Minute');
    await act(async () => dial(tree).props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
    // Nothing kept before « OK ».
    expect(timeOf(tree, 'Heure de début')).toBe('20:00');
    await press(tree, 'OK');
    await settle();
    expect(timeOf(tree, 'Heure de début')).toBe('19:05');
    expect(timeOf(tree, 'Heure de fin')).toBe('22:05');
  });

  it('keeps two numbers typed, and says when they are not a time', async () => {
    const tree = await boot({ onboarded: true });
    await open(tree, 'Heure de fin');
    await press(tree, 'Passer à la saisie');
    expect(textOf(tree)).toContain('Saisir l’heure');
    await act(async () => inputs(tree, 'Heure')[0]!.props.onChangeText('25'));
    await act(async () => inputs(tree, 'Minute')[0]!.props.onChangeText('30'));
    await press(tree, 'OK');
    expect(textOf(tree)).toContain('Saisissez une heure de 0 à 23');
    await act(async () => inputs(tree, 'Heure')[0]!.props.onChangeText('22'));
    await press(tree, 'OK');
    await settle();
    expect(timeOf(tree, 'Heure de fin')).toBe('22:30');
  });

  it('leaves the time as it was on « Annuler »', async () => {
    const tree = await boot({ onboarded: true });
    await open(tree, 'Heure de début');
    await act(async () => dial(tree).props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
    await press(tree, 'Annuler');
    await settle();
    expect(timeOf(tree, 'Heure de début')).toBe('20:00');
  });
});
