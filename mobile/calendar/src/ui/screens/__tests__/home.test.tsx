/**
 * The calendar's home on the phone: the status bar in the theme's ink over its own head; the month's
 * narrow days showing a timed event's title alone (its time read out); the Planning's days each one
 * panel, under « Lundi 16 novembre », what is over lying back and today's now line; a quiet line while
 * Android refuses the notifications, opening the page that allows them; Réglages' « Aucun rappel ».
 */
import { Linking, StatusBar } from 'react-native';
import { act, type ReactTestInstance } from 'react-test-renderer';

import { blankDraft } from '@unlease/calendar/services/editing';
import { dayTitle, longDay } from '@unlease/calendar/services/eventText';
import { addDays, today, wallToInstant } from '@unlease/calendar/services/time';
import { setServer } from '@shared/app/store/settingsStore';
import { addEvent } from '@app/store/actions';
import { setPrefs, showView, useCalendarUiStore } from '@app/store/calendarUi';
import { navigationRef } from '@ui/navigation/navigationRef';
import { RowPanel } from '@shared/ui/components';

import { __reset as resetSuite } from '../../../../../shared/__mocks__/NativeSuiteLink';
import { state as reminders, __reset as resetReminders } from '../../../../../shared/__mocks__/NativeReminders';
import { AgendaRow } from '../../features/calendar/AgendaRow';
import { MonthView, monthChip, NARROW_CELL } from '../../features/calendar/MonthView';
import { scheduleDayTitle } from '../../features/calendar/ScheduleView';
import { boot, fakeFetch, pressableWithText, pressables, settle, textOf, unmountAll } from './harness';

jest.useFakeTimers();

const day = today(Date.now());

/** Lays a view out at a phone's size: the test renderer measures nothing. (A memo's instances are its inner component's: `.type`.) */
async function layOut(nodes: readonly ReactTestInstance[], width: number, height: number): Promise<void> {
  await act(async () => {
    for (const node of nodes) node.findAll(each => typeof each.props.onLayout === 'function', { deep: true })[0]!.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
  });
}

describe('the calendar’s home', () => {
  beforeEach(() => {
    resetSuite();
    resetReminders();
    jest.setSystemTime(wallToInstant(`${day}T14:10`, ''));
    global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(async () => setServer(null));
  });

  afterAll(unmountAll);

  it('sets the status bar’s icons in the theme’s ink over its own head', async () => {
    const tree = await boot({ onboarded: true });
    const bars = tree.root.findAllByType(StatusBar);
    expect(bars.length).toBeGreaterThan(0);
    // The light theme: dark icons on the cream ground.
    expect(bars.every(bar => bar.props.barStyle === 'dark-content')).toBe(true);
  });

  it('says a timed event of a narrow day by its title alone, its time read out', () => {
    const occurrence = { allDay: false, firstDay: day, lastDay: day, startAt: wallToInstant(`${day}T09:30`, '') };
    expect(monthChip('Standup', occurrence, NARROW_CELL - 1, false)).toEqual({ form: 'wash', text: 'Standup', label: 'Standup, 09:30' });
    expect(monthChip('Standup', occurrence, NARROW_CELL + 40, false)).toEqual({ form: 'dot', text: '09:30 Standup', label: 'Standup, 09:30' });
    expect(monthChip('Salon', { ...occurrence, allDay: true }, 40, false)).toEqual({ form: 'bar', text: 'Salon', label: 'Salon' });
  });

  it('draws the month’s narrow days with titles, never « 09:30 … »', async () => {
    const tree = await boot({ onboarded: true });
    await act(async () => {
      addEvent({ ...blankDraft(`${day}T09:30`, `${day}T09:45`, ''), title: 'Standup équipe' });
      showView('month', day);
    });
    await settle();
    // A 360 phone: each day 51 wide.
    await layOut(tree.root.findAllByType(MonthView.type), 360, 640);
    await settle();
    expect(pressables(tree, 'Standup équipe, 09:30').length).toBeGreaterThan(0);
    expect(textOf(tree)).toContain('Standup équipe');
    expect(textOf(tree)).not.toContain('09:30 Standup équipe');
  });

  it('lays each day of the Planning on one panel, the past lying back and today’s now line', async () => {
    const tree = await boot({ onboarded: true });
    await act(async () => {
      addEvent({ ...blankDraft(`${day}T09:30`, `${day}T09:45`, ''), title: 'Point d’équipe' });
      addEvent({ ...blankDraft(`${day}T16:00`, `${day}T16:30`, ''), title: 'Dentiste' });
      addEvent({ ...blankDraft(`${addDays(day, 1)}T09:00`, `${addDays(day, 1)}T10:00`, ''), title: 'Standup' });
      showView('schedule', day);
    });
    await settle();
    expect(useCalendarUiStore.getState().view).toBe('schedule');
    // Today and tomorrow: a panel each.
    expect(tree.root.findAllByType(RowPanel)).toHaveLength(2);
    const rows = tree.root.findAllByType(AgendaRow.type);
    const row = (title: string) => rows.find(each => each.props.item.kind === 'event' && each.props.item.occurrence.event.title === title)!;
    expect(row('Point d’équipe').props.over).toBe(true);
    expect(row('Dentiste').props.over).toBe(false);
    expect(row('Standup').props.over).toBe(false);
    // The now line between what is over and what is to come, in today's panel only.
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Maintenant, 14:10', { deep: false })).toHaveLength(1);
    const text = textOf(tree);
    expect(text.indexOf('Point d’équipe')).toBeLessThan(text.indexOf('Dentiste'));
    // The day's heading without the year (this year's).
    expect(text).toContain(dayTitle(day));
    expect(text).not.toContain(longDay(day));
    expect(scheduleDayTitle('2027-01-01', '2026-12-31')).toBe(longDay('2027-01-01'));
  });

  it('says at its head when Android refuses the notifications, and opens the page that allows them', async () => {
    let tree = await boot({ onboarded: true });
    expect(textOf(tree)).not.toContain('Les rappels ne s’afficheront pas');
    reminders.health = { ...reminders.health, notifications: false };
    tree = await boot({ onboarded: true });
    expect(textOf(tree)).toContain('Les rappels ne s’afficheront pas');
    expect(textOf(tree)).toContain('Autoriser');
    await act(async () => pressables(tree, 'Les rappels ne s’afficheront pas')[0]!.props.onPress());
    await settle();
    expect(reminders.opened).toEqual(['notifications']);
  });

  it('clears a new event’s reminders from their own choice, « Aucun rappel » first', async () => {
    const tree = await boot({ onboarded: true });
    await act(async () => setPrefs({ reminders: [10] }));
    await act(async () => navigationRef.navigate('Settings'));
    await settle();
    expect(textOf(tree)).not.toContain('Retirer les rappels par défaut');
    await act(async () => pressables(tree, 'Rappels d’un nouvel événement')[0]!.props.onPress());
    await settle();
    await act(async () => pressableWithText(tree, 'Aucun rappel').props.onPress());
    await settle();
    expect(useCalendarUiStore.getState().prefs.reminders).toEqual([]);
  });
});
