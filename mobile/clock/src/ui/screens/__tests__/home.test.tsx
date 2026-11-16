/**
 * The home: the week of mornings from today, opened on the next alarm's morning with its time, how
 * long until then and the day's first event from Agenda; a clash says so and « Sonner à 07:15 » moves
 * that morning's ring earlier in one batch; another morning chosen shows its own, by its column, a
 * swipe or TalkBack's actions; « Ajouter une alarme » for the day's event opens the editor filled.
 */
import { Linking } from 'react-native';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import * as Reanimated from 'react-native-reanimated';
import { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { eventFields } from '@unlease/calendar/sync/entities';
import type { CalendarEvent } from '@unlease/calendar/models/events';
import { createAlarm } from '@app/store/actions';
import { useLibraryStore, writeLocal } from '@app/store/libraryStore';
import { navigationRef } from '@ui/navigation/navigationRef';

import { __reset as resetEngine } from '../../../../../shared/__mocks__/NativeAlarmEngine';
import { felt } from '../../../../../shared/__mocks__/NativeHaptics';
import { __reset as resetNotifee } from '../../../../__mocks__/@notifee/react-native';
import { boot, fakeFetch, inputs, press, pressableWithText, pressables, settle, textOf, unmountAll } from './harness';

jest.useFakeTimers();

const DRAFT = { time: '07:30', days: [1, 2, 3, 4, 5], label: 'Travail', sound: 'melody', vibrate: true, weather: true, agenda: true, offDays: false, link: null };

function addEvent(id: string, title: string, start: string, end: string, extra: Partial<CalendarEvent> = {}): void {
  const event: Omit<CalendarEvent, 'id' | 'editedAt'> = {
    title, description: '', place: '', start, end, timeZone: '', rrule: '', exdates: [], recurringId: null, originalStart: '', reminders: [], labelIds: [], contactIds: [], files: [], feedId: null, uid: '', url: '', color: null, dayOff: false, trashedAt: null, createdAt: 1, deletedAt: null, ...extra,
  } as Omit<CalendarEvent, 'id' | 'editedAt'>;
  writeLocal([{ type: 'calendarEvent', id, patch: eventFields(event) }]);
}

const liveAlarms = () => Object.values(useLibraryStore.getState().alarms).filter(alarm => alarm.deletedAt === null);

/** A column of the week's strip, by the start of its spoken day (« Mercredi 18 novembre »). */
const column = (tree: ReactTestRenderer, day: RegExp): ReactTestInstance =>
  tree.root.find(node => typeof node.props.onPress === 'function' && typeof node.props.accessibilityLabel === 'string' && day.test(node.props.accessibilityLabel));

/** The panel's head, which names the morning and offers TalkBack's way across. */
const head = (tree: ReactTestRenderer): ReactTestInstance =>
  tree.root.findAll(node => Array.isArray(node.props.accessibilityActions) && typeof node.props.onAccessibilityAction === 'function', { deep: false })[0]!;
const stepLabels = (tree: ReactTestRenderer): string[] => (head(tree).props.accessibilityActions as { label: string }[]).map(action => action.label);

async function stepBy(tree: ReactTestRenderer, actionName: 'previous' | 'next'): Promise<void> {
  await act(async () => {
    head(tree).props.onAccessibilityAction({ nativeEvent: { actionName } });
  });
  await settle();
}

/** A finger across the morning panel, 388 wide: `dx` to the right (negative: to the left), let go at `velocityX`. */
async function swipe(tree: ReactTestRenderer, dx: number, velocityX = 0): Promise<void> {
  const panel = tree.root.findAll(node => node.props.outline === 'panel' && typeof node.props.onLayout === 'function', { deep: false })[0]!;
  await act(async () => {
    panel.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 388, height: 300 } } });
  });
  await act(async () => {
    fireGestureHandler(getByGestureTestId('morning-swipe'), [{ translationX: 0 }, { translationX: dx / 2 }, { translationX: dx }, { translationX: dx, velocityX }]);
  });
  await settle();
}

describe('Clock, the home', () => {
  beforeEach(() => {
    resetEngine();
    resetNotifee();
    // Monday 16 November 2026, 21:00 on this phone.
    jest.setSystemTime(new Date(2026, 10, 16, 21, 0, 0));
    global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  });

  afterAll(unmountAll);

  it('opens on the next alarm’s morning, with the day’s first event and a clash fixed in one tap', async () => {
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        createAlarm(DRAFT, Date.now());
        addEvent('standup', 'Point d’équipe', '2026-11-17T07:45', '2026-11-17T08:00');
      },
    });
    const text = textOf(tree);
    expect(text).toContain('Demain · dans 10 h 30');
    expect(text).toContain('07:45 · Point d’équipe');
    expect(text).toContain('15 min après le réveil');
    expect(text).toContain('Moins de 30 min pour se préparer.');
    await press(pressableWithText(tree, 'Sonner à 07:15'));
    await settle();
    const alarms = Object.values(useLibraryStore.getState().alarms).filter(alarm => alarm.deletedAt === null);
    expect(alarms.find(alarm => alarm.label === 'Travail')?.skipDay).toBe('2026-11-17');
    expect(alarms.find(alarm => alarm.time === '07:15')).toMatchObject({ days: [], date: '2026-11-17', enabled: true });
    expect(textOf(tree)).toContain('Demain · dans 10 h 15');
  });

  it('shows another morning when its day is chosen, and a morning without an alarm', async () => {
    const tree = await boot({ onboarded: true, prepare: () => createAlarm(DRAFT, Date.now()) });
    // Sunday 22: no alarm.
    const sunday = tree.root.find(node => typeof node.props.onPress === 'function' && typeof node.props.accessibilityLabel === 'string' && /^Dimanche 22\snovembre/.test(node.props.accessibilityLabel));
    await press(sunday);
    await settle();
    expect(textOf(tree)).toContain('Pas d’alarme');
    expect(textOf(tree)).toContain('Rien dans votre agenda ce jour-là.');
  });

  it('moves along the week with TalkBack’s actions, never past its ends', async () => {
    const tree = await boot({ onboarded: true });
    expect(textOf(tree)).toContain('Aujourd’hui');
    // Today opens the week: nothing before it.
    expect(stepLabels(tree)).toEqual(['Jour suivant']);
    await stepBy(tree, 'next');
    expect(head(tree).props.accessibilityLabel).toBe('Demain');
    expect(column(tree, /^Mardi 17\snovembre/).props.accessibilityState).toMatchObject({ selected: true });
    expect(stepLabels(tree)).toEqual(['Jour précédent', 'Jour suivant']);
    await stepBy(tree, 'previous');
    expect(head(tree).props.accessibilityLabel).toBe('Aujourd’hui');
    // Sunday 22 closes it: nothing after it.
    await press(column(tree, /^Dimanche 22\snovembre/));
    await settle();
    expect(stepLabels(tree)).toEqual(['Jour précédent']);
    await stepBy(tree, 'next');
    expect(column(tree, /^Dimanche 22\snovembre/).props.accessibilityState).toMatchObject({ selected: true });
  });

  it('turns to the next morning with a swipe past its threshold, which clicks, and springs back short of it or at an end', async () => {
    const reduced = jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    try {
      const tree = await boot({ onboarded: true });
      felt.length = 0;
      // Short of a third of the width: nothing changes, nothing clicks.
      await swipe(tree, -80);
      expect(head(tree).props.accessibilityLabel).toBe('Aujourd’hui');
      expect(felt).toEqual([]);
      // Towards the day before today: there is none.
      await swipe(tree, 200);
      expect(head(tree).props.accessibilityLabel).toBe('Aujourd’hui');
      expect(felt).toEqual([]);
      // Past it, to the left: the morning after, with a click.
      await swipe(tree, -200);
      expect(head(tree).props.accessibilityLabel).toBe('Demain');
      expect(felt).toEqual(['threshold']);
      // Flung short of it, to the right: the morning before, clicking as it goes.
      await swipe(tree, 60, 1500);
      expect(head(tree).props.accessibilityLabel).toBe('Aujourd’hui');
      expect(felt).toEqual(['threshold', 'threshold']);
    } finally {
      reduced.mockRestore();
    }
  });

  it('opens the editor filled from the day’s event, to ring once on its day', async () => {
    const tree = await boot({ onboarded: true, prepare: () => addEvent('dentist', 'Dentiste', '2026-11-18T09:30', '2026-11-18T10:00') });
    // Today has no event: nothing to add an alarm for.
    expect(textOf(tree)).toContain('Rien dans votre agenda ce jour-là.');
    expect(pressables(tree, 'Ajouter une alarme pour « Dentiste »')).toHaveLength(0);
    await press(column(tree, /^Mercredi 18\snovembre/));
    await settle();
    await press(pressables(tree, 'Ajouter une alarme pour « Dentiste »')[0]!);
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Edit');
    expect(textOf(tree)).toContain('Nouvelle alarme');
    expect(inputs(tree, 'Libellé')[0]!.props.value).toBe('Dentiste');
    // On Wednesday, not on the next 09:30 (tomorrow's).
    expect(textOf(tree)).toContain('Sonnera dans 1 j 12 h');
    expect(liveAlarms()).toHaveLength(0);
    await press(pressableWithText(tree, 'Enregistrer'));
    await settle();
    expect(liveAlarms()).toHaveLength(1);
    expect(liveAlarms()[0]).toMatchObject({ time: '09:30', days: [], date: '2026-11-18', label: 'Dentiste', enabled: true, eventId: null });
  });

  it('opens the editor on a weekly event’s days', async () => {
    const tree = await boot({ onboarded: true, prepare: () => addEvent('yoga', 'Yoga', '2026-11-17T07:15', '2026-11-17T08:15', { rrule: 'FREQ=WEEKLY;BYDAY=TU,TH' }) });
    await press(column(tree, /^Mardi 17\snovembre/));
    await settle();
    await press(pressables(tree, 'Ajouter une alarme pour « Yoga »')[0]!);
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Edit');
    const toggle = (name: string) => tree.root.find(node => node.props.accessibilityLabel === name && typeof node.props.onPress === 'function');
    expect(toggle('mardi').props.accessibilityState).toMatchObject({ checked: true });
    expect(toggle('jeudi').props.accessibilityState).toMatchObject({ checked: true });
    expect(toggle('mercredi').props.accessibilityState).toMatchObject({ checked: false });
    await press(pressableWithText(tree, 'Enregistrer'));
    await settle();
    expect(liveAlarms()[0]).toMatchObject({ time: '07:15', days: [2, 4], date: null, label: 'Yoga', enabled: true });
  });

  it('says there is no alarm yet', async () => {
    const tree = await boot({ onboarded: true });
    expect(textOf(tree)).toContain('Aucune alarme');
  });
});
