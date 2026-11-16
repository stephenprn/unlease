/**
 * The alarm editor: a new alarm set on its wheels is written in one batch, switched on, with its day
 * when it rings once, and says when it will ring; an edit writes only what changed; the sound sheet
 * plays each sound as it is chosen and stops when it closes; another app's « set an alarm » opens the
 * editor filled, nothing kept until « Enregistrer ».
 */
import { Linking } from 'react-native';
import { act } from 'react-test-renderer';

import { onceDate } from '@unlease/clock/services/schedule';
import { createAlarm } from '@app/store/actions';
import { getRecord, useLibraryStore } from '@app/store/libraryStore';
import { useUiStore } from '@shared/app/store/uiStore';
import { navigationRef } from '@ui/navigation/navigationRef';

import { __queueShare, __reset as resetIntake } from '../../../../../shared/__mocks__/NativeIntake';
import { __reset as resetNotifee, state as notifee } from '../../../../__mocks__/@notifee/react-native';
import { __reset as resetEngine, state as engine } from '../../../../../shared/__mocks__/NativeAlarmEngine';
import { boot, fakeFetch, go, inputs, press, pressableWithText, settle, textOf, turn, unmountAll } from './harness';

jest.useFakeTimers();

/** The clocks of a record's fields, as written. */
const clocks = (id: string): Record<string, string> => (getRecord('alarm', id)?.clocks ?? {}) as Record<string, string>;
const liveAlarms = () => Object.values(useLibraryStore.getState().alarms).filter(alarm => alarm.deletedAt === null);

const BLANK = { time: '07:00', days: [], label: '', sound: 'melody', vibrate: true, weather: true, agenda: true, offDays: false, link: null };

describe('Clock, the alarm editor', () => {
  beforeEach(() => {
    resetIntake();
    resetEngine();
    resetNotifee();
    // Monday 16 November 2026, 21:00 on this phone.
    jest.setSystemTime(new Date(2026, 10, 16, 21, 0, 0));
    global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  });

  afterAll(unmountAll);

  it('creates a one-time alarm in one batch, on the day its time comes next', async () => {
    const tree = await boot({ onboarded: true });
    await go('Edit');
    expect(textOf(tree)).toContain('Nouvelle alarme');
    // 07:00, two hours back and a quarter on: 05:15.
    await turn(tree, 'Heures', -2);
    await turn(tree, 'Minutes', 15);
    // Tomorrow at 05:15: 8 h 15 from now.
    expect(textOf(tree)).toContain('Sonnera dans 8 h 15');
    await press(pressableWithText(tree, 'Enregistrer'));
    await settle();

    const alarms = liveAlarms();
    expect(alarms).toHaveLength(1);
    const alarm = alarms[0]!;
    expect(alarm).toMatchObject({ time: '05:15', days: [], date: onceDate('05:15', Date.now()), enabled: true, label: '', sound: 'melody' });
    expect(alarm.date).toBe('2026-11-17');
    // One user action, one batch: every field shares one clock.
    expect(new Set(Object.values(clocks(alarm.id))).size).toBe(1);
    // Said on a slip, as Google's Clock does.
    expect(useUiStore.getState().snack?.message).toBe('Alarme réglée dans 8 h 15');
    expect(navigationRef.getCurrentRoute()?.name).not.toBe('Edit');
    // The first alarm saved asks for the notifications (the ringing screen needs them), once.
    expect(notifee.asked).toBe(1);
    await go('Edit');
    await press(pressableWithText(tree, 'Enregistrer'));
    await settle();
    expect(notifee.asked).toBe(1);
  });

  it('sets its days with the toggles and the quick choices, and edits only what changed', async () => {
    const tree = await boot({ onboarded: true });
    await go('Edit');
    await press(pressableWithText(tree, 'En semaine'));
    // Saturday too.
    await press(tree.root.find(node => node.props.accessibilityLabel === 'samedi' && typeof node.props.onPress === 'function'));
    await press(pressableWithText(tree, 'Enregistrer'));
    await settle();
    const created = liveAlarms()[0]!;
    expect(created).toMatchObject({ days: [1, 2, 3, 4, 5, 6], date: null });

    await go('Edit', { id: created.id });
    expect(textOf(tree)).toContain('Modifier l’alarme');
    await type(tree, 'Libellé', 'Piscine');
    const before = clocks(created.id);
    await press(pressableWithText(tree, 'Enregistrer'));
    await settle();
    const after = clocks(created.id);
    expect(useLibraryStore.getState().alarms[created.id]!.label).toBe('Piscine');
    // Only the label moved on.
    expect(Object.keys(after).filter(field => after[field] !== before[field])).toEqual(['label']);
  });

  it('plays each sound as it is chosen, and stops when the sheet closes', async () => {
    const tree = await boot({ onboarded: true });
    await go('Edit');
    await press(pressableWithText(tree, 'Son'));
    await press(pressableWithText(tree, 'Réveil à cloche'));
    expect(engine.calls).toContain('preview:bell');
    await press(pressableWithText(tree, 'OK'));
    await settle();
    expect(engine.calls[engine.calls.length - 1]).toBe('stopPreview');
    expect(textOf(tree)).toContain('Réveil à cloche');
    await press(pressableWithText(tree, 'Enregistrer'));
    await settle();
    expect(liveAlarms()[0]!.sound).toBe('bell');
  });

  it('skips the next ring of a repeating alarm, and deletes it with a way back', async () => {
    let id = '';
    const tree = await boot({ onboarded: true, prepare: () => (id = createAlarm({ ...BLANK, time: '07:30', days: [1, 2, 3, 4, 5] })) });
    await go('Edit', { id });
    await press(pressableWithText(tree, 'Ignorer la prochaine (mar. 17\u00a0nov.)'));
    expect(useLibraryStore.getState().alarms[id]!.skipDay).toBe('2026-11-17');
    expect(textOf(tree)).toContain('Ne plus ignorer');
    await press(pressableWithText(tree, 'Ne plus ignorer'));
    expect(useLibraryStore.getState().alarms[id]!.skipDay).toBeNull();

    await press(pressableWithText(tree, 'Supprimer'));
    await settle();
    expect(liveAlarms()).toHaveLength(0);
    const snack = useUiStore.getState().snack;
    expect(snack?.message).toBe('Alarme supprimée');
    await act(async () => snack?.action?.run());
    expect(liveAlarms().map(alarm => alarm.id)).toEqual([id]);
  });

  it('opens another app’s « set an alarm » filled, and keeps nothing until it is saved', async () => {
    __queueShare({ mimeType: 'x-unlease/alarm-set', text: JSON.stringify({ hour: 6, minutes: 45, days: [1, 2], message: 'Train pour Lyon', vibrate: false }) });
    const tree = await boot({ onboarded: true });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Edit');
    expect(inputs(tree, 'Libellé')[0]!.props.value).toBe('Train pour Lyon');
    expect(liveAlarms()).toHaveLength(0);
    await press(pressableWithText(tree, 'Enregistrer'));
    await settle();
    expect(liveAlarms()[0]).toMatchObject({ time: '06:45', days: [1, 2], label: 'Train pour Lyon', vibrate: false, enabled: true });
  });

  it('opens an alarm for an Agenda event an hour before it, linked to it', async () => {
    const tree = await boot({ onboarded: true });
    // Tuesday 17 November, 07:45 on this phone: the event as Agenda handed it (not synced here).
    const at = new Date(2026, 10, 17, 7, 45).getTime();
    await go('Edit', { event: '0199c1a0-0000-7000-8000-000000000001', occurrence: '', at: String(at), title: 'Train pour Lyon' });
    expect(textOf(tree)).toContain('Pour « Train pour Lyon »');
    expect(textOf(tree)).toContain('1 h avant');
    // No days for it: it rings once, for the event.
    expect(textOf(tree)).not.toContain('En semaine');
    await press(pressableWithText(tree, '1 h 30'));
    await press(pressableWithText(tree, 'Enregistrer'));
    await settle();
    expect(liveAlarms()[0]).toMatchObject({ time: '06:15', days: [], date: '2026-11-17', label: 'Train pour Lyon', eventId: '0199c1a0-0000-7000-8000-000000000001', before: 90, enabled: true });
  });

  it('offers a repeating alarm to keep quiet on holidays and days off', async () => {
    const tree = await boot({ onboarded: true });
    await go('Edit');
    expect(textOf(tree)).not.toContain('Pas les jours fériés ni de congé');
    await press(pressableWithText(tree, 'En semaine'));
    expect(textOf(tree)).toContain('Pas les jours fériés ni de congé');
    await press(pressableWithText(tree, 'Enregistrer'));
    await settle();
    expect(liveAlarms()[0]).toMatchObject({ days: [1, 2, 3, 4, 5], offDays: true });
  });
});

/** Types into the field labelled `label`. */
async function type(tree: Parameters<typeof inputs>[0], label: string, text: string): Promise<void> {
  await act(async () => {
    inputs(tree, label)[0]!.props.onChangeText(text);
  });
}
