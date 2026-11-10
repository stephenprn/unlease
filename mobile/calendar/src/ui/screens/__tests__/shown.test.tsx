/**
 * A subscribed calendar's event is read-only: « Copier dans mon agenda » stands on the line that says
 * so, and opens the copy's form. In the drawer, a calendar or a layer held down offers « Afficher
 * uniquement celui-ci » (every other calendar and layer put away, the slip taking it back) and, once
 * one shows alone, « Tout afficher » (what showed before, the pages' days still off).
 */
import { Linking } from 'react-native';
import { act } from 'react-test-renderer';

import { blankDraft } from '@unlease/calendar/services/editing';
import { addDays, today } from '@unlease/calendar/services/time';
import { feedFields } from '@unlease/calendar/sync/entities';
import { setDrawerOpen, useUiStore } from '@shared/app/store/uiStore';
import { addEvent } from '@app/store/actions';
import { useCalendarUiStore } from '@app/store/calendarUi';
import { useLibraryStore, writeLocal } from '@app/store/libraryStore';
import { navigationRef } from '@ui/navigation/navigationRef';

import { __reset as resetSuite } from '../../../../../shared/__mocks__/NativeSuiteLink';
import { boot, fakeFetch, pressableWithText, pressables, settle, textOf, unmountAll } from './harness';

jest.useFakeTimers();

const day = today(Date.now());

const feed = (name: string, position: string) => feedFields({ kind: 'ics', name, url: `https://example.org/${position}.ics`, color: 'violet', hidden: false, position, refreshedAt: null, error: '', createdAt: 1, deletedAt: null });

/** Whether each calendar and layer shows: the cinema, the holidays, then the layers. */
function shownState(): string {
  const { feeds } = useLibraryStore.getState();
  const prefs = useCalendarUiStore.getState().prefs;
  return [`cinema=${!feeds.cinema!.hidden}`, `holidays=${!feeds.holidays!.hidden}`, `birthdays=${prefs.birthdays}`, `noteReminders=${prefs.noteReminders}`, `pageDates=${prefs.pageDates}`, `weather=${prefs.weather}`].join(' ');
}

describe('Agenda, its calendars', () => {
  beforeEach(() => {
    resetSuite();
    global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });

  afterAll(unmountAll);

  it('copies a subscribed event into one’s own from its read-only line, and opens the copy', async () => {
    const tree = await boot({ onboarded: true });
    let id = '';
    await act(async () => {
      writeLocal([{ type: 'calendarFeed', id: 'cinema', patch: feed('Cinéma du quartier', 'a1') }]);
      id = addEvent({ ...blankDraft(`${addDays(day, 2)}T20:30`, `${addDays(day, 2)}T22:30`, 'Europe/Paris'), title: 'Avant-première' });
      writeLocal([{ type: 'calendarEvent', id, patch: { feedId: 'cinema' } }]);
    });
    await act(async () => {
      navigationRef.navigate('Event', { id });
    });
    await settle();
    expect(textOf(tree)).toContain('Agenda abonné : en lecture seule');
    // No « Modifier » on a subscription's event; its copy in sight instead.
    expect(pressables(tree, 'Modifier')).toHaveLength(0);
    const copy = pressables(tree, 'Copier dans mon agenda');
    expect(copy).toHaveLength(1);
    await act(async () => copy[0]!.props.onPress());
    await settle();
    const copies = Object.values(useLibraryStore.getState().events).filter(event => event.title === 'Avant-première' && event.feedId === null);
    expect(copies).toHaveLength(1);
    expect(navigationRef.getCurrentRoute()?.name).toBe('Edit');
    expect(navigationRef.getCurrentRoute()?.params).toMatchObject({ id: copies[0]!.id });
  });

  it('shows one calendar alone from a long press, takes it back, and shows all again as before', async () => {
    const tree = await boot({ onboarded: true });
    await act(async () => {
      writeLocal([
        { type: 'calendarFeed', id: 'holidays', patch: feed('Jours fériés', 'a0') },
        { type: 'calendarFeed', id: 'cinema', patch: feed('Cinéma du quartier', 'a1') },
      ]);
      setDrawerOpen(true);
    });
    await settle();
    const before = shownState();
    // The pages' days are off by default: « Tout afficher » must leave them so.
    expect(before).toBe('cinema=true holidays=true birthdays=true noteReminders=true pageDates=false weather=true');

    const row = pressables(tree, 'Cinéma du quartier')[0]!;
    expect(row.props.accessibilityActions.map((action: { label: string }) => action.label)).toEqual(['Afficher uniquement celui-ci']);
    await act(async () => row.props.onLongPress());
    await settle();
    expect(textOf(tree)).not.toContain('Tout afficher');
    await act(async () => pressableWithText(tree, 'Afficher uniquement celui-ci').props.onPress());
    await settle();
    expect(shownState()).toBe('cinema=true holidays=false birthdays=false noteReminders=false pageDates=false weather=false');
    const snack = useUiStore.getState().snack;
    expect(snack?.message).toBe('Les autres agendas sont masqués');
    await act(async () => snack!.action!.run());
    expect(shownState()).toBe(before);

    // Again, then from a layer's chip: alone, it offers « Tout afficher », which brings back what showed.
    await act(async () => pressables(tree, 'Cinéma du quartier')[0]!.props.onAccessibilityAction({ nativeEvent: { actionName: 'only' } }));
    await settle();
    const weather = pressables(tree, 'Météo')[0]!;
    expect(weather.props.accessibilityActions.map((action: { label: string }) => action.label)).toEqual(['Afficher uniquement celui-ci', 'Tout afficher']);
    await act(async () => weather.props.onLongPress());
    await settle();
    await act(async () => pressableWithText(tree, 'Afficher uniquement celui-ci').props.onPress());
    await settle();
    expect(shownState()).toBe('cinema=false holidays=false birthdays=false noteReminders=false pageDates=false weather=true');
    await act(async () => pressables(tree, 'Météo')[0]!.props.onLongPress());
    await settle();
    await act(async () => pressableWithText(tree, 'Tout afficher').props.onPress());
    await settle();
    expect(shownState()).toBe(before);
    expect(useUiStore.getState().snack?.message).toBe('Les agendas sont de nouveau affichés');
    await act(async () => setDrawerOpen(false));
  });
});
