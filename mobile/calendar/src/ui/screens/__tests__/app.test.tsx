/**
 * Agenda's root in the real app: a fresh install opens on the suite's first run with Agenda's brand,
 * an onboarded one on the calendar (the schedule, its events and the layers of the other apps);
 * `unlease-agenda://` links open an event and the form filled from a draft; an event is created,
 * opened, its reminders changed one at a time and its labels ticked in place, saved with a slip that
 * takes it back, and a repeating one asks which occurrences a deletion takes; the bin restores with
 * « Annuler » and asks before deleting for good; « Demander à Claude » shows only while offered.
 */
import { Linking } from 'react-native';
import { act } from 'react-test-renderer';

import { blankDraft } from '@unlease/calendar/services/editing';
import { reminderWords } from '@unlease/calendar/services/eventText';
import { addDays, today } from '@unlease/calendar/services/time';
import { linkFields } from '@unlease/notes/sync/entities';
import { syncedTypes } from '@shared/app/store/library';
import { setServer, useSettingsStore } from '@shared/app/store/settingsStore';
import { setDrawerOpen, useUiStore } from '@shared/app/store/uiStore';
import { addEvent, createLabel } from '@app/store/actions';
import { showView } from '@app/store/calendarUi';
import { useLibraryStore, writeLocal } from '@app/store/libraryStore';
import { navigationRef } from '@ui/navigation/navigationRef';

import { state as suite, __reset as resetSuite } from '../../../../../shared/__mocks__/NativeSuiteLink';
import { boot, fakeFetch, inputs, pressableWithText, pressables, settle, textOf, unmountAll } from './harness';

jest.useFakeTimers();

const day = today(Date.now());

const SAVED_LINK = {
  noteId: 'inbox',
  url: 'https://www.example.org/concert',
  status: 'ready',
  autoFile: false,
  filedBy: null,
  lang: 'fr',
  title: 'Concert au Zénith',
  summary: '',
  siteName: '',
  kind: 'other',
  price: null,
  currency: null,
  attributes: [],
  imageIds: [],
  imageUrl: null,
  done: false,
  doneAt: null,
  comment: '',
  position: 'a0',
  error: null,
  analyzedAt: 1,
  createdAt: 1,
  deletedAt: null,
  copy: null,
} as const;

describe('Agenda, its root', () => {
  beforeEach(() => {
    resetSuite();
    global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(async () => setServer(null));
  });

  afterAll(unmountAll);

  it('opens on the first run on a fresh install, a sibling’s connection offered in one tap', async () => {
    suite.siblings = [{ packageName: 'com.stephenprn.contacts', server: 'https://suite.test', token: 'jeton', appearance: '', grain: '', locale: '' }];
    const tree = await boot({ onboarded: false });
    expect(navigationRef.getCurrentRoute()?.name).toBe('Setup');
    expect(suite.asked[0]).toEqual(['com.stephenprn.carnet', 'com.stephenprn.pages', 'com.stephenprn.contacts']);
    await act(async () => {
      pressables(tree, 'Utiliser la connexion de Contacts')[0]!.props.onPress();
    });
    await settle();
    expect(useSettingsStore.getState().server).toEqual({ url: 'https://suite.test', token: 'jeton' });
    await act(async () => {
      pressableWithText(tree, 'Commencer').props.onPress();
    });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Calendar');
  });

  it('syncs its own records and those of the apps it shows', async () => {
    await boot({ onboarded: true });
    const types = syncedTypes();
    expect(types).toEqual(expect.arrayContaining(['calendarEvent', 'calendarFeed', 'calendarLabel', 'contact', 'note', 'link', 'block']));
  });

  it('lists the days ahead in the schedule, with the contacts’ birthdays', async () => {
    const tree = await boot({ onboarded: true });
    await act(async () => {
      showView('schedule', day);
      addEvent({ ...blankDraft(`${addDays(day, 1)}T09:00`, `${addDays(day, 1)}T10:00`, 'Europe/Paris'), title: 'Dentiste', place: 'Cabinet Dupont' });
      writeLocal([{ type: 'contact', id: 'lea', patch: { firstName: 'Léa', lastName: 'Martin', birthday: `--${addDays(day, 2).slice(5)}`, phones: [], emails: [], addresses: [], labelIds: [], favorite: false, createdAt: 1, deletedAt: null, trashedAt: null } }]);
    });
    await settle();
    const text = textOf(tree);
    expect(text).toContain('Dentiste');
    expect(text).toContain('Cabinet Dupont');
    expect(text).toContain('Anniversaire de Léa Martin');
  });

  it('opens an event from a link, and the form filled from Carnet’s draft', async () => {
    const tree = await boot({ onboarded: true });
    let id = '';
    await act(async () => {
      id = addEvent({ ...blankDraft(`${day}T14:00`, `${day}T15:00`, 'Europe/Paris'), title: 'Réunion' });
    });
    await act(async () => {
      navigationRef.navigate('Event', { id });
    });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Event');
    expect(textOf(tree)).toContain('Réunion');

    await act(async () => {
      navigationRef.navigate('Edit', { title: 'Concert', start: `${addDays(day, 3)}T20:30`, end: `${addDays(day, 3)}T23:00`, place: 'Zénith', link: 'link1' });
    });
    await settle();
    expect(inputs(tree, 'Titre')[0]!.props.value).toBe('Concert');
    // The place is a row as the guests are, its search opening over the whole screen.
    expect(pressables(tree, 'Lieu : Zénith')).toHaveLength(1);
    // The link Carnet just saved is not here yet: named once the sync brings it.
    expect(inputs(tree, 'Description')[0]!.props.value).toBe('@Indisponible ici');
    await act(async () => {
      writeLocal([{ type: 'link', id: 'link1', patch: linkFields(SAVED_LINK) }]);
    });
    await settle();
    expect(inputs(tree, 'Description')[0]!.props.value).toBe('@Concert au Zénith');
    await act(async () => {
      pressableWithText(tree, 'Enregistrer').props.onPress();
    });
    await settle();
    const saved = Object.values(useLibraryStore.getState().events).find(event => event.title === 'Concert')!;
    expect(saved.start).toBe(`${addDays(day, 3)}T20:30`);
    expect(saved.description).toContain('{@link=link1}');
    expect(navigationRef.getCurrentRoute()?.name).toBe('Event');
  });

  it('asks before an event’s changes are left, and saves them without asking', async () => {
    const tree = await boot({ onboarded: true });
    let id = '';
    await act(async () => {
      id = addEvent({ ...blankDraft(`${day}T14:00`, `${day}T15:00`, 'Europe/Paris'), title: 'Réunion' });
    });
    await act(async () => {
      navigationRef.navigate('Edit', { id });
    });
    await settle();
    await act(async () => {
      inputs(tree, 'Titre')[0]!.props.onChangeText('Réunion d’équipe');
    });
    // × with a change: the question, and « Continuer à modifier » keeps the form.
    await act(async () => {
      pressables(tree, 'Fermer')[0]!.props.onPress();
    });
    await settle();
    expect(textOf(tree)).toContain('Abandonner les modifications ?');
    await act(async () => {
      pressableWithText(tree, 'Continuer à modifier').props.onPress();
    });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Edit');
    // Back with the change asks too; « Abandonner » leaves, nothing saved.
    await act(async () => {
      navigationRef.goBack();
    });
    await settle();
    expect(textOf(tree)).toContain('Abandonner les modifications ?');
    await act(async () => {
      pressableWithText(tree, 'Abandonner').props.onPress();
    });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).not.toBe('Edit');
    expect(useLibraryStore.getState().events[id]!.title).toBe('Réunion');
    // Saved, the form leaves at once.
    await act(async () => {
      navigationRef.navigate('Edit', { id });
    });
    await settle();
    await act(async () => {
      inputs(tree, 'Titre')[0]!.props.onChangeText('Réunion d’équipe');
    });
    await act(async () => {
      pressableWithText(tree, 'Enregistrer').props.onPress();
    });
    await settle();
    expect(textOf(tree)).not.toContain('Abandonner les modifications ?');
    expect(navigationRef.getCurrentRoute()?.name).not.toBe('Edit');
    expect(useLibraryStore.getState().events[id]!.title).toBe('Réunion d’équipe');
    // As on the web: « Événement enregistré », and « Annuler » takes the change back.
    const snack = useUiStore.getState().snack;
    expect(snack?.message).toBe('Événement enregistré');
    expect(snack?.tone).toBe('success');
    await act(async () => snack!.action!.run());
    expect(useLibraryStore.getState().events[id]!.title).toBe('Réunion');
  });

  it('changes a reminder in its own line, removes one by its ×, and ticks labels in place', async () => {
    const tree = await boot({ onboarded: true });
    let id = '';
    let work = '';
    await act(async () => {
      work = createLabel('Travail');
      id = addEvent({ ...blankDraft(`${day}T14:00`, `${day}T15:00`, 'Europe/Paris', [10]), title: 'Réunion' });
    });
    await act(async () => {
      navigationRef.navigate('Edit', { id });
    });
    await settle();
    // The reminder's line changes it: the sheet says so, ticks it, and a choice replaces it.
    await act(async () => {
      pressables(tree, reminderWords(10, false))[0]!.props.onPress();
    });
    await settle();
    expect(textOf(tree)).toContain('Modifier le rappel');
    await act(async () => {
      pressableWithText(tree, reminderWords(30, false)).props.onPress();
    });
    await settle();
    // Its × removes it, and nothing else opens.
    await act(async () => {
      pressables(tree, `Retirer le rappel ${reminderWords(30, false)}`)[0]!.props.onPress();
    });
    await settle();
    expect(pressables(tree, `Retirer le rappel ${reminderWords(30, false)}`).length).toBe(0);
    // A label is a tick in place.
    await act(async () => {
      pressables(tree, 'Travail')[0]!.props.onPress();
    });
    await act(async () => {
      pressableWithText(tree, 'Enregistrer').props.onPress();
    });
    await settle();
    const saved = useLibraryStore.getState().events[id]!;
    expect(saved.reminders).toEqual([]);
    expect(saved.labelIds).toEqual([work]);
  });

  it('asks which occurrences a deletion of a repeating event takes', async () => {
    const tree = await boot({ onboarded: true });
    let id = '';
    await act(async () => {
      id = addEvent({ ...blankDraft(`${day}T08:00`, `${day}T09:00`, 'Europe/Paris'), title: 'Sport', rrule: 'FREQ=DAILY' });
    });
    await act(async () => {
      navigationRef.navigate('Event', { id, at: `${addDays(day, 1)}T08:00` });
    });
    await settle();
    await act(async () => {
      pressables(tree, 'Plus d’actions')[0]!.props.onPress();
    });
    await settle();
    await act(async () => {
      pressableWithText(tree, 'Supprimer').props.onPress();
    });
    await settle();
    expect(textOf(tree)).toContain('Cet événement et les suivants');
    await act(async () => {
      pressableWithText(tree, 'Cet événement').props.onPress();
    });
    await settle();
    expect(useLibraryStore.getState().events[id]!.exdates).toEqual([`${addDays(day, 1)}T08:00`]);
    // One occurrence out of its series: not in the bin, and the slip says so (the web's words).
    expect(useUiStore.getState().snack?.message).toBe('Événement supprimé');
  });

  it('restores from the bin with « Annuler », and asks before deleting for good', async () => {
    const tree = await boot({ onboarded: true });
    let id = '';
    await act(async () => {
      id = addEvent({ ...blankDraft(`${day}T10:00`, `${day}T11:00`, 'Europe/Paris'), title: 'Dentiste' });
      writeLocal([{ type: 'calendarEvent', id, patch: { trashedAt: Date.now() } }]);
    });
    await act(async () => {
      navigationRef.navigate('Trash');
    });
    await settle();
    expect(textOf(tree)).toContain('Dentiste');
    expect(textOf(tree)).toMatch(/Les événements de la corbeille sont supprimés au bout de 7\sjours\./);
    await act(async () => {
      pressables(tree, 'Restaurer Dentiste')[0]!.props.onPress();
    });
    expect(useLibraryStore.getState().events[id]!.trashedAt).toBeNull();
    const snack = useUiStore.getState().snack;
    expect(snack?.message).toBe('Événement restauré');
    await act(async () => snack!.action!.run());
    expect(useLibraryStore.getState().events[id]!.trashedAt).not.toBeNull();
    await settle();
    await act(async () => {
      pressables(tree, 'Supprimer définitivement Dentiste')[0]!.props.onPress();
    });
    await settle();
    expect(textOf(tree)).toContain('L’événement disparaîtra de tous vos appareils.');
    expect(useLibraryStore.getState().events[id]!.deletedAt).toBeNull();
    await act(async () => {
      pressableWithText(tree, 'Supprimer').props.onPress();
    });
    await settle();
    // Gone for good: its tombstone, or out of the projection altogether.
    const gone = useLibraryStore.getState().events[id];
    expect(gone === undefined || gone.deletedAt !== null).toBe(true);
    expect(useUiStore.getState().snack?.message).toBe('Événement supprimé définitivement');
    expect(textOf(tree)).toContain('La corbeille est vide');
  });

  it('offers « Demander à Claude » in the drawer only while the server does', async () => {
    const tree = await boot({ onboarded: true });
    await act(async () => {
      setServer({ url: 'https://suite.test', token: 'jeton' });
      useSettingsStore.setState({ reading: true, calendarAsk: false });
      setDrawerOpen(true);
    });
    await settle();
    expect(textOf(tree)).toContain('Réglages');
    expect(textOf(tree)).not.toContain('Demander à Claude');
    await act(async () => {
      useSettingsStore.setState({ calendarAsk: true });
    });
    await settle();
    expect(textOf(tree)).toContain('Demander à Claude');
    await act(async () => setDrawerOpen(false));
  });
});
