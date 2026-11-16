/**
 * « Votre semaine » on the phone, each day toggled saved at once, and what hangs on it: « Jours
 * travaillés seulement » leaves the days not worked out of the week (every day when none or all
 * seven are), its row naming them; a day off is offered for an all-day event only, saved, and said
 * on its page; « Me réveiller pour cet événement » shows for an event still to come at an hour while
 * Clock can be opened, and opens its new alarm linked to the event.
 */
import { Linking } from 'react-native';
import { act } from 'react-test-renderer';

import { blankDraft } from '@unlease/calendar/services/editing';
import { longDay } from '@unlease/calendar/services/eventText';
import { addDays, today, wallToInstant } from '@unlease/calendar/services/time';
import { DEFAULT_WORK_DAYS } from '@unlease/core/sync/settings';
import { setServer, useSettingsStore } from '@shared/app/store/settingsStore';
import { useUiStore } from '@shared/app/store/uiStore';
import { addEvent } from '@app/store/actions';
import { setPrefs, showView } from '@app/store/calendarUi';
import { useLibraryStore } from '@app/store/libraryStore';
import { navigationRef } from '@ui/navigation/navigationRef';

import { __reset as resetSuite } from '../../../../../shared/__mocks__/NativeSuiteLink';
import { answer, boot, fakeFetch, pressableWithText, pressables, settle, SETTINGS, textOf, unmountAll } from './harness';

jest.useFakeTimers();

const day = today(Date.now());
const WAKE = 'Me réveiller pour cet événement';

/** The week's days drawn on screen, by their heads' names, among those of the week of 16 November 2026. */
const WEEK = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];

describe('the days worked, days off and alarms in Agenda', () => {
  beforeEach(() => {
    resetSuite();
    global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(async () => {
      setServer(null);
      setPrefs({ hideWeekends: false });
      useSettingsStore.setState({ workDays: DEFAULT_WORK_DAYS, apps: null });
    });
  });

  afterAll(unmountAll);

  it('leaves the days not worked out of the week while asked, and every day shows when none or all are worked', async () => {
    const tree = await boot({ onboarded: true });
    const shown = (): string[] => WEEK.filter(each => pressables(tree, longDay(each)).length > 0);
    await act(async () => {
      useSettingsStore.setState({ workDays: [1, 3, 5] });
      showView('week', '2026-11-18');
    });
    await settle();
    expect(shown()).toHaveLength(7);
    await act(async () => setPrefs({ hideWeekends: true }));
    await settle();
    expect(shown()).toEqual(['2026-11-16', '2026-11-18', '2026-11-20']);
    expect(textOf(tree)).toMatch(/16\s–\s20\snov\.\s2026/);
    // None worked, or all seven: the whole week.
    await act(async () => useSettingsStore.setState({ workDays: [] }));
    await settle();
    expect(shown()).toHaveLength(7);
    await act(async () => useSettingsStore.setState({ workDays: [0, 1, 2, 3, 4, 5, 6] }));
    await settle();
    expect(shown()).toHaveLength(7);
  });

  it('saves the days worked from « Votre semaine » at each toggle', async () => {
    const sent: unknown[] = [];
    global.fetch = jest.fn((input: string, init?: { method?: string; body?: unknown }) => {
      if (new URL(input).pathname === '/api/settings' && init?.method === 'PUT') {
        const patch = JSON.parse(String(init.body)) as { calendar: { workDays: number[] } };
        sent.push(patch);
        return Promise.resolve(answer({ ...SETTINGS, calendar: { ...SETTINGS.calendar, ...patch.calendar } }));
      }
      return fakeFetch(input, init);
    }) as unknown as typeof fetch;
    const tree = await boot({ onboarded: true });
    await act(async () => {
      setServer({ url: 'https://suite.test', token: 'jeton' });
      (navigationRef.navigate as (...args: unknown[]) => void)('Admin', { section: 'calendar-holidays' });
    });
    await settle();
    expect(textOf(tree)).toContain('Votre semaine');
    expect(textOf(tree)).toContain('Jours travaillés');
    expect(textOf(tree)).toContain('Du lundi au vendredi');
    await act(async () => {
      pressables(tree, 'samedi')[0]!.props.onPress();
    });
    await settle();
    expect(sent).toEqual([{ calendar: { workDays: [1, 2, 3, 4, 5, 6] } }]);
    expect(useUiStore.getState().snack).toMatchObject({ message: 'Jours travaillés : Du lundi au samedi', tone: 'success' });
    // Every screen of this phone follows: the settings' store holds them.
    expect(useSettingsStore.getState().workDays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(pressables(tree, 'samedi')[0]!.props.accessibilityState).toMatchObject({ checked: true });
  });

  it('names the days worked in its setting', async () => {
    const tree = await boot({ onboarded: true });
    await act(async () => {
      useSettingsStore.setState({ workDays: [2, 3, 4, 5, 6] });
      (navigationRef.navigate as (...args: unknown[]) => void)('Settings');
    });
    await settle();
    expect(textOf(tree)).toContain('Jours travaillés seulement');
    expect(textOf(tree)).toContain('Du mardi au samedi, comme choisi dans l’Administration (« Votre semaine »).');
  });

  it('offers a day off for an all-day event only, saves it and says it on the event', async () => {
    const tree = await boot({ onboarded: true });
    const on = addDays(day, 3);
    await act(async () => {
      navigationRef.navigate('Edit', { title: 'Congés', start: `${on}T10:00`, end: `${on}T11:00` });
    });
    await settle();
    expect(pressables(tree, 'Jour de congé')).toHaveLength(0);
    await act(async () => {
      pressables(tree, 'Toute la journée')[0]!.props.onPress();
    });
    await settle();
    const dayOff = pressables(tree, 'Jour de congé');
    expect(dayOff).toHaveLength(1);
    expect(dayOff[0]!.props.accessibilityRole).toBe('switch');
    expect(textOf(tree)).toContain('Les alarmes de Clock qui le demandent ne sonnent pas ce jour-là.');
    await act(async () => {
      dayOff[0]!.props.onPress();
    });
    await settle();
    expect(pressables(tree, 'Jour de congé')[0]!.props.accessibilityState).toMatchObject({ checked: true });
    await act(async () => {
      pressableWithText(tree, 'Enregistrer').props.onPress();
    });
    await settle();
    const saved = Object.values(useLibraryStore.getState().events).find(event => event.title === 'Congés')!;
    expect(saved).toMatchObject({ dayOff: true, start: on });
    expect(navigationRef.getCurrentRoute()?.name).toBe('Event');
    expect(textOf(tree)).toContain('Jour de congé');
  });

  it('offers to be woken up for an event still to come at an hour, while Clock opens from here', async () => {
    const tree = await boot({ onboarded: true });
    const on = addDays(day, 2);
    let timed = '';
    let allDay = '';
    await act(async () => {
      timed = addEvent({ ...blankDraft(`${on}T07:30`, `${on}T08:30`, 'Europe/Paris'), title: 'Train' });
      allDay = addEvent({ ...blankDraft(on, addDays(on, 1), ''), title: 'Salon' });
    });
    // Clock neither installed nor run by the server: nothing.
    await act(async () => {
      navigationRef.navigate('Event', { id: timed });
    });
    await settle();
    expect(textOf(tree)).toContain('Train');
    expect(pressables(tree, WAKE)).toHaveLength(0);

    // The server runs Clock: its web app opens it when the phone has no Clock.
    await act(async () => {
      setServer({ url: 'https://suite.test', token: 'jeton' });
      useSettingsStore.setState({ apps: ['calendar', 'clock'] });
    });
    await settle();
    expect(pressables(tree, WAKE)).toHaveLength(1);
    await act(async () => {
      pressables(tree, WAKE)[0]!.props.onPress();
    });
    await settle();
    const opened = (Linking.openURL as jest.Mock).mock.calls.map(call => String(call[0]));
    const asked = opened.find(url => url.includes('new?event='))!;
    expect(asked).toBeDefined();
    const query = new URLSearchParams(asked.slice(asked.indexOf('?')));
    expect(Object.fromEntries(query)).toEqual({ event: timed, occurrence: '', at: String(wallToInstant(`${on}T07:30`, 'Europe/Paris')), title: 'Train' });

    // An all-day event: no alarm for it.
    await act(async () => {
      navigationRef.navigate('Event', { id: allDay });
    });
    await settle();
    expect(textOf(tree)).toContain('Salon');
    expect(pressables(tree, WAKE)).toHaveLength(0);
  });
});
