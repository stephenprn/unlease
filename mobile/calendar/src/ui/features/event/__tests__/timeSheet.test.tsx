/**
 * The event form's time sheet: an hour and a minute picked, in either order, keep the time and
 * close (the start moving the end with it); one alone waits for « OK »; an end's length chip makes
 * the event that long from its start.
 */
import { Linking } from 'react-native';
import { act } from 'react-test-renderer';

import { addDays, today } from '@unlease/calendar/services/time';
import { navigationRef } from '@ui/navigation/navigationRef';

import { __reset as resetSuite } from '../../../../../../shared/__mocks__/NativeSuiteLink';
import { boot, fakeFetch, pressables, settle, unmountAll } from '../../../screens/__tests__/harness';

jest.useFakeTimers();

const day = addDays(today(Date.now()), 3);

/** The value a when line's time button reads out. */
const timeOf = (tree: Awaited<ReturnType<typeof boot>>, label: string): string => (pressables(tree, label)[0]!.props.accessibilityValue as { text: string }).text;

async function press(tree: Awaited<ReturnType<typeof boot>>, label: string): Promise<void> {
  const found = pressables(tree, label);
  expect(found.length).toBeGreaterThan(0);
  await act(async () => found[found.length - 1]!.props.onPress());
  await settle(50);
}

describe('the event form’s time sheet', () => {
  beforeEach(() => {
    resetSuite();
    global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
  });

  afterAll(unmountAll);

  it('keeps a time in two taps, in either order, and the end follows the start', async () => {
    const tree = await boot({ onboarded: true });
    await act(async () => {
      navigationRef.navigate('Edit', { title: 'Dîner', start: `${day}T20:00`, end: `${day}T23:00` });
    });
    await settle();
    await press(tree, 'Heure de début');
    // The minute first, then the hour: the second tap keeps it.
    await press(tree, '30\u00a0minutes');
    await press(tree, '09:00');
    await settle(300);
    expect(timeOf(tree, 'Heure de début')).toBe('09:30');
    expect(timeOf(tree, 'Heure de fin')).toBe('12:30');
  });

  it('waits for « OK » when only the hour is picked', async () => {
    const tree = await boot({ onboarded: true });
    await act(async () => {
      navigationRef.navigate('Edit', { title: 'Dîner', start: `${day}T20:00`, end: `${day}T23:00` });
    });
    await settle();
    await press(tree, 'Heure de début');
    await press(tree, '18:00');
    await settle(300);
    expect(timeOf(tree, 'Heure de début')).toBe('20:00');
    await press(tree, 'OK');
    await settle(300);
    expect(timeOf(tree, 'Heure de début')).toBe('18:00');
  });

  it('makes the event as long as the length picked for its end', async () => {
    const tree = await boot({ onboarded: true });
    await act(async () => {
      navigationRef.navigate('Edit', { title: 'Dîner', start: `${day}T20:00`, end: `${day}T23:00` });
    });
    await settle();
    await press(tree, 'Heure de fin');
    await press(tree, '1 h 30');
    await settle(300);
    expect(timeOf(tree, 'Heure de fin')).toBe('21:30');
  });
});
