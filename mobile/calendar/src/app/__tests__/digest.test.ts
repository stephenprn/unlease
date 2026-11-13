/** The morning digest on the phone: armed in Agenda's book once turned on, with the day's words, armed again when they change, rung late only while the morning lasts, gone once turned off. */
import { setLocale } from '@unlease/core/i18n';
import { blankDraft } from '@unlease/calendar/services/editing';
import { DIGEST_LATE_MS, digestMoment } from '@unlease/calendar/services/digest';
import { addDays, today } from '@unlease/calendar/services/time';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { writePreference } from '@shared/data/repositories/stateRepository';
import { resetReminders } from '@shared/platform/reminders';
import { DIGEST_ID } from '@platform/notifications';

import { state as notifee, __reset as resetNotifee } from '../../../__mocks__/@notifee/react-native';
import { __reset as resetNative } from '../../../../shared/__mocks__/NativeReminders';
import { reconcileAlarms } from '../reminders';
import { addEvent } from '../store/actions';
import { loadCalendarUi, setPrefs } from '../store/calendarUi';
import { loadLibrary, resetLibrary } from '../store/libraryStore';

const day = addDays(today(Date.now()), 3);
const before = digestMoment(day, '07:30') - 3_600_000;

beforeEach(() => {
  closeDatabase();
  resetLibrary();
  openDatabase({ name: 'digest.sqlite' });
  writePreference('onboarded', true);
  loadLibrary();
  loadCalendarUi();
  resetNotifee();
  resetNative();
  resetReminders();
  setLocale('fr');
});

describe('the morning digest', () => {
  it('is armed only once turned on, at its time, with the day in its words', async () => {
    addEvent({ ...blankDraft(`${day}T10:00`, `${day}T11:00`, ''), title: 'Dentiste' });
    await reconcileAlarms(before);
    expect(notifee.armed.has(DIGEST_ID)).toBe(false);
    setPrefs({ digest: true });
    await reconcileAlarms(before);
    const armed = notifee.armed.get(DIGEST_ID)!;
    expect(armed.timestamp).toBe(digestMoment(day, '07:30'));
    expect(armed.title.replace(/\u00a0/g, ' ')).toBe('Aujourd’hui : 1 événement');
    expect(armed.data).toEqual({ digestDay: day });
  });

  it('is armed again when its words or its time change, never twice for the same', async () => {
    setPrefs({ digest: true, digestEmpty: true });
    await reconcileAlarms(before);
    expect(notifee.armed.get(DIGEST_ID)!.title).toBe('Rien de prévu aujourd’hui');
    notifee.armed.clear();
    await reconcileAlarms(before);
    expect(notifee.armed.size).toBe(0);
    addEvent({ ...blankDraft(`${day}T10:00`, `${day}T11:00`, ''), title: 'Dentiste' });
    await reconcileAlarms(before);
    expect(notifee.armed.get(DIGEST_ID)!.title.replace(/\u00a0/g, ' ')).toBe('Aujourd’hui : 1 événement');
    setPrefs({ digestAt: '08:00' });
    await reconcileAlarms(before);
    expect(notifee.armed.get(DIGEST_ID)!.timestamp).toBe(digestMoment(day, '08:00'));
  });

  it('skips a day with nothing unless asked, and goes once turned off', async () => {
    setPrefs({ digest: true });
    await reconcileAlarms(before);
    expect(notifee.armed.has(DIGEST_ID)).toBe(false);
    addEvent({ ...blankDraft(`${day}T10:00`, `${day}T11:00`, ''), title: 'Dentiste' });
    await reconcileAlarms(before);
    expect(notifee.armed.has(DIGEST_ID)).toBe(true);
    setPrefs({ digest: false });
    await reconcileAlarms(before);
    expect(notifee.armed.has(DIGEST_ID)).toBe(false);
    expect(notifee.cancelled).toContain(DIGEST_ID);
  });

  it('rings late while the morning lasts, once, then waits for the next day', async () => {
    addEvent({ ...blankDraft(`${day}T10:00`, `${day}T11:00`, ''), title: 'Dentiste' });
    addEvent({ ...blankDraft(`${addDays(day, 1)}T10:00`, `${addDays(day, 1)}T11:00`, ''), title: 'Garage' });
    // A run before turning it on: the book knows this phone.
    await reconcileAlarms(before);
    setPrefs({ digest: true });
    const moment = digestMoment(day, '07:30');
    // The phone off at 7:30, on again at 8:00: today's rings now.
    await reconcileAlarms(moment + 30 * 60_000);
    expect(notifee.shown).toEqual([DIGEST_ID]);
    await reconcileAlarms(moment + 40 * 60_000);
    expect(notifee.shown).toEqual([DIGEST_ID]);
    // Past the morning: tomorrow's is armed.
    await reconcileAlarms(moment + DIGEST_LATE_MS);
    expect(notifee.armed.get(DIGEST_ID)!.timestamp).toBe(digestMoment(addDays(day, 1), '07:30'));
    expect(notifee.shown).toEqual([DIGEST_ID]);
  });
});
