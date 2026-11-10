/**
 * « Aujourd'hui » on the phone: the drawer's place over the calendar's tiles; the day in reading order
 * with what runs and what comes next counting; Carnet's reminders missed; tomorrow; a row opening
 * its event; an empty day offering one at the next hour.
 */
import { Linking } from 'react-native';
import { act } from 'react-test-renderer';

import { blankDraft } from '@unlease/calendar/services/editing';
import { addDays, today, wallToInstant } from '@unlease/calendar/services/time';
import { noteFields } from '@unlease/notes/sync/entities';
import { setServer } from '@shared/app/store/settingsStore';
import { setDrawerOpen } from '@shared/app/store/uiStore';
import { addEvent } from '@app/store/actions';
import { showView, useCalendarUiStore } from '@app/store/calendarUi';
import { writeLocal } from '@app/store/libraryStore';
import { navigationRef } from '@ui/navigation/navigationRef';

import { __reset as resetSuite } from '../../../../../shared/__mocks__/NativeSuiteLink';
import { boot, fakeFetch, pressableWithText, pressables, settle, textOf, unmountAll } from './harness';

jest.useFakeTimers();

const day = today(Date.now());

describe('« Aujourd’hui »', () => {
  beforeEach(() => {
    resetSuite();
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

  it('heads the drawer as a place of its own, over the six views', async () => {
    const tree = await boot({ onboarded: true });
    await act(async () => setDrawerOpen(true));
    await settle();
    await act(async () => {
      // The drawer's row (the top bar's « Aujourd'hui » is an icon: it draws no words).
      pressableWithText(tree, 'Aujourd’hui').props.onPress();
    });
    await settle(600);
    expect(useCalendarUiStore.getState().view).toBe('today');
    expect(useCalendarUiStore.getState().prefs.view).toBe('today');
    for (const view of ['Planning', 'Jour', '3 jours', 'Semaine', 'Mois', 'Année']) expect(pressables(tree, view)).toHaveLength(1);
  });

  it('reads the day in order, counts what runs and what comes next, then what was missed and tomorrow', async () => {
    const tree = await boot({ onboarded: true });
    await act(async () => {
      showView('today');
      addEvent({ ...blankDraft(`${day}T09:30`, `${day}T09:45`, ''), title: 'Point d’équipe' });
      addEvent({ ...blankDraft(`${day}T13:30`, `${day}T15:00`, ''), title: 'Atelier', place: 'Salle B' });
      addEvent({ ...blankDraft(`${day}T16:00`, `${day}T16:30`, ''), title: 'Dentiste' });
      addEvent({ ...blankDraft(`${addDays(day, 1)}T09:00`, `${addDays(day, 1)}T10:00`, ''), title: 'Standup' });
      writeLocal([
        {
          type: 'note',
          id: 'n-mutuelle',
          patch: noteFields({ kind: 'text', title: 'Renvoyer le formulaire', body: '', color: null, pinned: false, archived: false, trashedAt: null, labelIds: [], position: 'a0', reminderAt: wallToInstant(`${addDays(day, -1)}T18:00`, ''), code: '', hint: '', createdAt: 1, deletedAt: null }),
        },
      ]);
    });
    await settle();
    const text = textOf(tree);
    expect(text.indexOf('Point d’équipe')).toBeLessThan(text.indexOf('Atelier'));
    expect(text.indexOf('Atelier')).toBeLessThan(text.indexOf('Dentiste'));
    expect(text).toContain('Encore 50 min');
    expect(text).toContain('Dans 1 h 50');
    expect(text).toContain('En retard');
    expect(text).toContain('Renvoyer le formulaire');
    expect(text).toContain('Hier · 18:00');
    expect(text.indexOf('Demain')).toBeLessThan(text.indexOf('Standup'));
    // The now line, between what has started and what has not, says the time to TalkBack.
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Maintenant, 14:10', { deep: false })).toHaveLength(1);

    await act(async () => {
      pressables(tree, 'Atelier, 13:30 – 15:00, Salle B, Encore 50 min')[0]!.props.onPress();
    });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Event');
    await act(async () => navigationRef.goBack());
    await settle();
  });

  it('says an empty day kindly and offers an event at the next hour', async () => {
    const tree = await boot({ onboarded: true });
    await act(async () => showView('today'));
    await settle();
    expect(textOf(tree)).toContain('Rien de prévu aujourd’hui : la journée est à vous.');
    await act(async () => {
      pressableWithText(tree, 'Créer un événement').props.onPress();
    });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Edit');
    expect(navigationRef.getCurrentRoute()?.params).toMatchObject({ start: `${day}T15:00` });
  });
});
