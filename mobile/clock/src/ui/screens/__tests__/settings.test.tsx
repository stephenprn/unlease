/**
 * Clock's Réglages: each setting is kept at once on this phone (`clockUi`), from a switch row, a
 * choice's sheet or the segmented track; « Essayer une alarme » rings one in ten seconds; what keeps
 * the alarms from ringing shows only while something does, each row opening what fixes it.
 */
import { Linking } from 'react-native';

import { readPreferences } from '@shared/data/repositories/stateRepository';
import { selectPrefs, useClockUiStore } from '@app/store/clockUi';

import { __reset as resetEngine, state as engine } from '../../../../../shared/__mocks__/NativeAlarmEngine';
import { boot, fakeFetch, go, press, pressableWithText, pressables, settle, textOf, unmountAll } from './harness';

jest.useFakeTimers();

const prefs = () => selectPrefs(useClockUiStore.getState());

describe('Clock, its settings', () => {
  beforeEach(() => {
    resetEngine();
    global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  });

  afterAll(unmountAll);

  it('keeps each change on this phone at once', async () => {
    const tree = await boot({ onboarded: true });
    await go('Settings');
    expect(textOf(tree)).toContain('Alarmes');
    expect(textOf(tree)).toContain('Au réveil');
    expect(textOf(tree)).toContain('La veille au soir');

    await press(pressables(tree, 'Sonner sur ce téléphone')[0]!);
    expect(prefs().ringsHere).toBe(false);

    await press(pressableWithText(tree, 'Durée de répétition'));
    await settle();
    await press(pressableWithText(tree, '5 minutes'));
    await settle();
    expect(prefs().snoozeMinutes).toBe(5);

    await press(pressableWithText(tree, 'Dimanche'));
    expect(prefs().weekStart).toBe(0);

    await press(pressables(tree, 'Vérification du soir')[0]!);
    expect(prefs().eveningCheck).toBe(false);

    // Kept with the device's preferences, read back whole.
    expect(readPreferences()['clock.prefs']).toMatchObject({ ringsHere: false, snoozeMinutes: 5, weekStart: 0, eveningCheck: false });
  });

  it('rings a test alarm with a new alarm’s sound', async () => {
    const tree = await boot({ onboarded: true });
    await go('Settings');
    await press(pressableWithText(tree, 'Essayer une alarme'));
    expect(engine.calls).toContain('ringIn:10:Alarme d’essai:melody');
  });

  it('says what keeps the alarms from ringing, and opens what fixes it', async () => {
    let tree = await boot({ onboarded: true });
    await go('Settings');
    expect(textOf(tree)).not.toContain('Pour que vos alarmes sonnent');

    engine.health = { ...engine.health, volume: 1, maxVolume: 7, exactAlarms: false };
    tree = await boot({ onboarded: true });
    await go('Settings');
    expect(textOf(tree)).toContain('Le volume des alarmes est bas');
    expect(textOf(tree)).toContain('Les alarmes peuvent sonner en retard');
    await press(pressableWithText(tree, 'Le volume des alarmes est bas'));
    await settle();
    expect(engine.calls).toContain('open:volume');
  });
});
