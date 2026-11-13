/**
 * What other apps hand Agenda (IntakeModule): « Ajouter à l'agenda » opens the new event's form filled
 * (its guests the contacts with their address), kept only once saved; a `webcal://` link opens the
 * subscriptions with its address, subscribed once asked; words selected elsewhere open quick add with
 * them; a day asked moves the calendar there, every time. Each waits for the first run.
 */
import { Linking } from 'react-native';
import { act } from 'react-test-renderer';

import { selectDay, selectView, useCalendarUiStore } from '@app/store/calendarUi';
import { useLibraryStore, writeLocal } from '@app/store/libraryStore';
import { HANDED } from '@platform/intake';
import { setServer } from '@shared/app/store/settingsStore';
import { navigationRef } from '@ui/navigation/navigationRef';

import { __emitShare, __queueShare, __reset as resetIntake, state as intake } from '../../../../../shared/__mocks__/NativeIntake';
import { __reset as resetSuite } from '../../../../../shared/__mocks__/NativeSuiteLink';
import { boot, fakeFetch, inputs, pressableWithText, settle, textOf, unmountAll } from './harness';

jest.useFakeTimers();

const LEA = { firstName: 'Léa', lastName: 'Martin', birthday: null, phones: [], emails: [{ id: 'mail', address: 'lea@example.org', kind: 'home', label: '' }], addresses: [], labelIds: [], favorite: false, createdAt: 1, deletedAt: null, trashedAt: null };

const emit = async (payload: Parameters<typeof __emitShare>[0]): Promise<void> => {
  await act(async () => {
    __emitShare(payload);
  });
  await settle();
};

describe('Agenda, what other apps hand it', () => {
  beforeEach(() => {
    resetIntake();
    resetSuite();
    global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });

  afterAll(unmountAll);

  it('opens another app’s « Ajouter à l’agenda » as the new event’s form, kept once saved', async () => {
    const begin = Date.UTC(2026, 10, 27, 18, 30);
    const extras = { title: 'Concert', eventLocation: 'Zénith', beginTime: begin, endTime: begin + 7_200_000, eventTimezone: 'Europe/Paris', rrule: 'FREQ=WEEKLY;COUNT=3', 'android.intent.extra.EMAIL': 'lea@example.org, nina@example.org' };
    __queueShare({ id: 'insert-1', mimeType: HANDED.event, text: JSON.stringify(extras) });
    const tree = await boot({ onboarded: true, prepare: () => writeLocal([{ type: 'contact', id: 'lea', patch: LEA }]) });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Edit');
    expect(inputs(tree, 'Titre')[0]!.props.value).toBe('Concert');
    expect(Object.values(useLibraryStore.getState().events).some(event => event.title === 'Concert')).toBe(false);
    await act(async () => {
      pressableWithText(tree, 'Enregistrer').props.onPress();
    });
    await settle();
    const saved = Object.values(useLibraryStore.getState().events).find(event => event.title === 'Concert')!;
    expect(saved).toMatchObject({ start: '2026-11-27T19:30', end: '2026-11-27T21:30', timeZone: 'Europe/Paris', place: 'Zénith', rrule: 'FREQ=WEEKLY;COUNT=3', contactIds: ['lea'] });
    // The guest who is no contact is not lost: written in the description.
    expect(saved.description).toContain('nina');
  });

  it('opens a webcal link as the subscriptions, its address in the form, subscribed only once asked', async () => {
    __queueShare({ id: 'feed-1', mimeType: HANDED.subscribe, text: 'webcal://example.org/club.ics' });
    const tree = await boot({ onboarded: true });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Feeds');
    expect(inputs(tree, 'Adresse de l’agenda')[0]!.props.value).toBe('https://example.org/club.ics');
    const followed = (): number => Object.values(useLibraryStore.getState().feeds).filter(feed => feed.deletedAt === null && feed.url === 'https://example.org/club.ics').length;
    expect(followed()).toBe(0);
    await act(async () => {
      pressableWithText(tree, 'S’abonner').props.onPress();
    });
    await settle();
    expect(followed()).toBe(1);
  });

  it('asks for a login when the address does, and follows the calendar over CalDAV with its account', async () => {
    const dav = 'https://mail.example.org/dav/caldav/Y2FsOi8vMC8x';
    __queueShare({ id: 'feed-2', mimeType: HANDED.subscribe, text: dav });
    const tree = await boot({ onboarded: true });
    // With a server, the address is tried before it is followed.
    await act(async () => setServer({ url: 'https://suite.test', token: 'jeton' }));
    await settle();
    const followed = () => Object.values(useLibraryStore.getState().feeds).filter(feed => feed.deletedAt === null && feed.url === dav);
    await act(async () => {
      pressableWithText(tree, 'S’abonner').props.onPress();
    });
    await settle();
    expect(followed()).toHaveLength(0);
    expect(textOf(tree)).toContain('Cet agenda demande un identifiant : celui du compte qui le tient.');
    await act(async () => {
      inputs(tree, 'Identifiant')[0]!.props.onChangeText('lea@example.org');
      inputs(tree, 'Mot de passe')[0]!.props.onChangeText('secret');
    });
    await act(async () => {
      pressableWithText(tree, 'S’abonner').props.onPress();
    });
    await settle();
    expect(followed()).toEqual([expect.objectContaining({ kind: 'caldav', name: 'Travail', account: 'lea@example.org' })]);
    expect(textOf(tree)).toContain('en tant que lea@example.org');
    await act(async () => setServer(null));
  });

  it('opens quick add with words selected in another app', async () => {
    const tree = await boot({ onboarded: true });
    await emit({ id: 'words-1', mimeType: HANDED.words, text: 'Dîner chez Léa vendredi 20h' });
    expect(navigationRef.getCurrentRoute()?.name).toBe('Calendar');
    expect(inputs(tree, 'L’événement en quelques mots')[0]!.props.value).toBe('Dîner chez Léa vendredi 20h');
    expect(textOf(tree)).toContain('Dîner chez Léa');
  });

  it('moves the calendar to a day asked, again when the same day is asked again', async () => {
    // As « open the calendar at » does (its day view drawn in the app), on the schedule here.
    await boot({ onboarded: true });
    const ask = async (): Promise<void> => {
      await act(async () => {
        navigationRef.navigate('Calendar', { day: '2026-12-24', view: 'schedule' });
      });
      await settle();
    };
    await ask();
    expect(selectDay(useCalendarUiStore.getState())).toBe('2026-12-24');
    await act(async () => {
      useCalendarUiStore.setState({ day: '2026-12-31', view: 'month' });
    });
    await ask();
    expect(selectView(useCalendarUiStore.getState())).toBe('schedule');
    expect(selectDay(useCalendarUiStore.getState())).toBe('2026-12-24');
  });

  it('keeps what another app hands until the first run is done', async () => {
    __queueShare({ id: 'insert-2', mimeType: HANDED.event, text: '{}' });
    await boot({ onboarded: false });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Setup');
    expect(intake.pending?.id).toBe('insert-2');
  });
});
