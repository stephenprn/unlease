/**
 * What the app does beside its screens: the reminders it arms (and cancels), the layers of the other
 * apps it shows (Carnet's reminders, Pages' days), the gift ideas it finds, an `.ics` planned for import.
 */
import { CALENDAR_PREFS_DEFAULTS } from '@unlease/calendar/models/prefs';
import { blankDraft } from '@unlease/calendar/services/editing';
import { parseIcs } from '@unlease/calendar/services/ics';
import { planImport } from '@unlease/calendar/services/importing';
import { addDays, dayToInstant, today } from '@unlease/calendar/services/time';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';

import { AlarmType, state as notifee, __reset as resetNotifee } from '../../../__mocks__/@notifee/react-native';
import { state as native, __reset as resetNative } from '../../../../shared/__mocks__/NativeReminders';
import { resetReminders } from '@shared/platform/reminders';
import { agendaIn, itemsOn } from '../agenda';
import { giftIdeas } from '../gifts';
import { keepAlarmsFresh, reconcileAlarms, REFRESH_MINUTES } from '../reminders';
import { addEvent, deleteLabel, createLabel, removeImported, undoImport, writeImport } from '../store/actions';
import { loadLibrary, resetLibrary, useLibraryStore, writeLocal } from '../store/libraryStore';

const now = Date.now();
const day = today(now);

beforeEach(() => {
  closeDatabase();
  resetLibrary();
  openDatabase({ name: 'features.sqlite' });
  writePreference('onboarded', true);
  loadLibrary();
  resetNotifee();
  resetNative();
  resetReminders();
});

describe('reminders', () => {
  it('arms each occurrence’s reminder, and cancels it once the event goes', async () => {
    const id = addEvent({ ...blankDraft(`${addDays(day, 2)}T10:00`, `${addDays(day, 2)}T11:00`, ''), title: 'Rendez-vous', place: 'Mairie', reminders: [30] });
    await reconcileAlarms(now);
    const armed = [...notifee.armed.values()];
    expect(armed).toHaveLength(1);
    expect(armed[0]).toMatchObject({ title: 'Rendez-vous', body: '10:00 · Mairie', data: { eventId: id } });
    expect(armed[0]!.timestamp).toBe(dayToInstant(addDays(day, 2)) + 9.5 * 3_600_000);
    writeLocal([{ type: 'calendarEvent', id, patch: { trashedAt: now } }]);
    await reconcileAlarms(now);
    expect(notifee.armed.size).toBe(0);
  });

  it('arms exact alarms, once, and the hourly run with the app closed is asked for', async () => {
    addEvent({ ...blankDraft(`${addDays(day, 2)}T10:00`, `${addDays(day, 2)}T11:00`, ''), title: 'Rendez-vous', reminders: [30] });
    await reconcileAlarms(now);
    const [key] = [...notifee.armed.keys()];
    expect(notifee.alarmTypes.get(key!)).toBe(AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE);
    notifee.armed.clear();
    await reconcileAlarms(now);
    expect(notifee.armed.size).toBe(0);
    keepAlarmsFresh();
    expect(native.fresh).toBe(REFRESH_MINUTES);
  });

  it('rings at once a reminder whose moment went by unarmed, never twice, and not on the very first run', async () => {
    await reconcileAlarms(now);
    // Written on another device for 20 minutes from now, with a reminder 30 minutes before: synced late.
    const start = new Date(now + 20 * 60_000);
    const wall = `${today(start.getTime())}T${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
    addEvent({ ...blankDraft(wall, `${today(start.getTime())}T23:59`, ''), title: 'Réunion', reminders: [30] });
    await reconcileAlarms(now);
    expect(notifee.shown).toHaveLength(1);
    expect(notifee.armed.size).toBe(0);
    await reconcileAlarms(now + 60_000);
    expect(notifee.shown).toHaveLength(1);
  });

  it('keeps no late reminder from a first run, and arms everything again after a force stop', async () => {
    const start = new Date(now + 20 * 60_000);
    const wall = `${today(start.getTime())}T${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
    addEvent({ ...blankDraft(wall, `${today(start.getTime())}T23:59`, ''), title: 'Réunion', reminders: [30] });
    addEvent({ ...blankDraft(`${addDays(day, 2)}T10:00`, `${addDays(day, 2)}T11:00`, ''), title: 'Rendez-vous', reminders: [30] });
    await reconcileAlarms(now);
    expect(notifee.shown).toHaveLength(0);
    expect(notifee.armed.size).toBe(1);
    notifee.armed.clear();
    native.stopped = true;
    resetReminders();
    await reconcileAlarms(now);
    expect(notifee.armed.size).toBe(1);
    expect(notifee.shown).toHaveLength(0);
  });
});

describe('the layers', () => {
  it('shows Carnet’s reminders and Pages’ days beside the events', () => {
    const at = dayToInstant(addDays(day, 1)) + 18 * 3_600_000;
    writeLocal([
      { type: 'note', id: 'n1', patch: { kind: 'text', title: 'Appeler le plombier', body: '', rich: false, reminderAt: at, labelIds: [], position: 'a0', pinned: false, archived: false, trashedAt: null, createdAt: 1, deletedAt: null } },
      { type: 'block', id: 'p1', patch: { kind: 'page', parentId: null, position: 'a0', text: 'Voyage', createdAt: 1, deletedAt: null } },
      { type: 'block', id: 'b1', patch: { kind: 'text', parentId: 'p1', position: 'a0', text: `Départ {@date=${addDays(day, 1)}}`, createdAt: 1, deletedAt: null } },
    ]);
    const state = useLibraryStore.getState();
    const agenda = agendaIn(state, { ...CALENDAR_PREFS_DEFAULTS, pageDates: true }, day, addDays(day, 3));
    const kinds = itemsOn(state, agenda, addDays(day, 1)).map(item => item.kind);
    expect(kinds).toEqual(['page', 'reminder']);
    expect(itemsOn(state, agendaIn(state, { ...CALENDAR_PREFS_DEFAULTS, noteReminders: false, pageDates: false }, day, addDays(day, 3)), addDays(day, 1))).toHaveLength(0);
  });

  it('finds the gift ideas kept for someone in « Cadeaux »: by the people a link names, or by an older client’s comment', () => {
    writeLocal([
      { type: 'note', id: 'gifts', patch: { kind: 'links', title: 'Cadeaux', body: '', rich: false, labelIds: [], position: 'a0', pinned: false, archived: false, trashedAt: null, createdAt: 1, deletedAt: null } },
      { type: 'link', id: 'l1', patch: { noteId: 'gifts', url: 'https://shop.test/livre', title: 'Un livre', status: 'ready', comment: 'Pour Léa Martin', position: 'a0', createdAt: 2, deletedAt: null } },
      { type: 'link', id: 'l2', patch: { noteId: 'gifts', url: 'https://shop.test/velo', title: 'Un vélo', status: 'ready', comment: 'Pour Paul', position: 'a1', createdAt: 3, deletedAt: null } },
      { type: 'link', id: 'l3', patch: { noteId: 'gifts', url: 'https://shop.test/jeu', title: 'Un jeu', status: 'ready', comment: '', contactIds: ['lea'], position: 'a2', createdAt: 4, deletedAt: null } },
    ]);
    expect(giftIdeas(useLibraryStore.getState(), 'lea', 'Léa Martin').map(idea => idea.title)).toEqual(['Un jeu', 'Un livre']);
  });
});

describe('labels and imports', () => {
  it('takes a deleted label off every event, in one batch', () => {
    const label = createLabel('Sport');
    const id = addEvent({ ...blankDraft(day, addDays(day, 1), ''), title: 'Match', labelIds: [label] });
    const undo = deleteLabel(label);
    expect(useLibraryStore.getState().events[id]!.labelIds).toEqual([]);
    undo();
    expect(useLibraryStore.getState().events[id]!.labelIds).toEqual([label]);
  });

  it('imports a file once', () => {
    const file = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:a@test', 'DTSTART;VALUE=DATE:20261224', 'SUMMARY:Noël', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const calendar = parseIcs(file);
    expect(writeImport(planImport(calendar, Object.values(useLibraryStore.getState().events), now))).toBe(1);
    expect(planImport(calendar, Object.values(useLibraryStore.getState().events), now).creates).toHaveLength(0);
  });

  it('takes an import back, on its slip or later from the same file', () => {
    const file = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:b@test', 'DTSTART;VALUE=DATE:20261231', 'SUMMARY:Réveillon', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const calendar = parseIcs(file);
    const kept = () => Object.values(useLibraryStore.getState().events).filter(event => event.uid === 'b@test' && event.deletedAt === null);
    const plan = planImport(calendar, Object.values(useLibraryStore.getState().events), now);
    writeImport(plan);
    undoImport(plan);
    // Taken back whole: not even in the bin, and the file comes again.
    expect(kept()).toHaveLength(0);
    expect(writeImport(planImport(calendar, Object.values(useLibraryStore.getState().events), now))).toBe(1);
    const { count, undo } = removeImported(calendar);
    expect(count).toBe(1);
    expect(kept()[0]!.trashedAt).not.toBeNull();
    undo();
    expect(kept()[0]!.trashedAt).toBeNull();
  });
});
