/**
 * Birthday notifications armed and re-armed from the address book (Notifee mocked), a notification's
 * « Appeler » calling, duplicates merged in one batch and undone, an address's way there offered in
 * the phone's maps apps, and a gift idea kept in Carnet by the server.
 */
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { setServer, setServerApps } from '@shared/app/store/settingsStore';
import { useUiStore } from '@shared/app/store/uiStore';
import { bootstrap, resetBootstrap } from '@app/bootstrap';
import { reconcileBirthdays, turnBirthdaysOn } from '@app/birthdayAlerts';
import { sendGift } from '@app/gifts';
import { answerBirthday } from '@app/hooks/useBirthdayAlerts';
import { mentionIds } from '@app/hooks/useMentions';
import { openPlace } from '@shared/app/openPlace';
import { useMapsStore } from '@shared/app/store/mapsStore';
import { addressLine } from '@unlease/contacts/services/addresses';
import { createContact, mergeDuplicates, updateContact, type ContactDraft } from '@app/store/actions';
import { setBirthdaySettings } from '@app/store/contactsUi';
import { getRecord, resetLibrary, useLibraryStore } from '@app/store/libraryStore';

import { AlarmType, state as notifee, __reset as resetNotifee } from '../../../__mocks__/@notifee/react-native';
import { state as phone, __reset as resetPhone } from '../../../../shared/__mocks__/NativePhoneContacts';
import { state as native, __reset as resetNative } from '../../../../shared/__mocks__/NativeReminders';
import { resetReminders } from '@shared/platform/reminders';
import { REFRESH_MINUTES } from '@app/birthdayAlerts';

const draft = (firstName: string, lastName: string, more: Partial<ContactDraft> = {}): ContactDraft => ({
  firstName,
  lastName,
  company: '',
  jobTitle: '',
  phones: [],
  emails: [],
  addresses: [],
  birthday: null,
  labelIds: [],
  favorite: false,
  photoId: null,
  photoMime: '',
  photoUploaded: false,
  ...more,
});

const DAY = 86_400_000;
/** A birthday in ten days, without a year. */
const soon = (): string => {
  const at = new Date(Date.now() + 10 * DAY);
  return `--${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
};

beforeEach(() => {
  resetNotifee();
  resetPhone();
  resetNative();
  resetReminders();
  closeDatabase();
  resetLibrary();
  resetBootstrap();
  openDatabase({ name: 'app.sqlite' });
  bootstrap();
  setBirthdaySettings({ enabled: false, dayBefore: false, hour: 9 });
});

describe('birthday notifications', () => {
  it('arms nothing until turned on, then the day itself, the day before when asked, and follows a rename', async () => {
    const lea = createContact(draft('Léa', 'Martin', { birthday: soon(), phones: [{ id: 'p1', number: '0612345678', kind: 'mobile', label: '' }] }));
    createContact(draft('Paul', 'Durand', { birthday: soon() }));
    await reconcileBirthdays();
    expect(notifee.armed.size).toBe(0);

    expect(await turnBirthdaysOn(true)).toBe(true);
    await reconcileBirthdays();
    const first = notifee.armed.get(`birthday-${lea}-0`)!;
    expect(first.title).toBe('Anniversaire de Léa Martin');
    expect(new Date(first.timestamp).getHours()).toBe(9);
    expect(first.data).toEqual({ contactId: lea });
    expect(first.actions).toEqual(['Appeler', 'Message']);
    // No number, no « Appeler »; nor e-mail, no « Message » (nothing to write with).
    expect([...notifee.armed.values()].find(alert => alert.title.includes('Paul'))!.actions).toEqual([]);

    setBirthdaySettings({ dayBefore: true });
    await reconcileBirthdays();
    expect(notifee.armed.has(`birthday-${lea}-1`)).toBe(true);

    updateContact(lea, draft('Lena', 'Martin', { birthday: soon(), phones: [{ id: 'p1', number: '0612345678', kind: 'mobile', label: '' }] }));
    await reconcileBirthdays();
    expect(notifee.armed.get(`birthday-${lea}-0`)!.title).toBe('Anniversaire de Lena Martin');

    await turnBirthdaysOn(false);
    await reconcileBirthdays();
    expect(notifee.armed.size).toBe(0);
    expect(notifee.cancelled).toContain(`birthday-${lea}-1`);
  });

  it('arms exact alarms, brings today’s hour gone by at once, once, and is seen to with the app closed while on', async () => {
    const now = Date.now();
    const today = new Date(now);
    const birthday = `--${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(await turnBirthdaysOn(true)).toBe(true);
    // At midnight, so today's alert has gone by whatever the hour the test runs at.
    setBirthdaySettings({ hour: 0 });
    createContact(draft('Paul', 'Durand', { birthday: soon() }));
    await reconcileBirthdays(now);
    expect(native.fresh).toBe(REFRESH_MINUTES);
    const [soonest] = [...notifee.armed.keys()];
    expect(notifee.alarmTypes.get(soonest!)).toBe(AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE);
    // Written today on another device, after its hour: it comes now, and only once.
    const lea = createContact(draft('Léa', 'Martin', { birthday }));
    await reconcileBirthdays(now);
    expect(notifee.shown).toEqual([`birthday-${lea}-0`]);
    await reconcileBirthdays(now + 60_000);
    expect(notifee.shown).toHaveLength(1);
    await turnBirthdaysOn(false);
    await reconcileBirthdays(now + 120_000);
    expect(native.fresh).toBe(0);
  });

  it('stays off when Android refuses', async () => {
    notifee.permission = 0;
    expect(await turnBirthdaysOn(true)).toBe(false);
    expect(notifee.asked).toBe(1);
    expect(useUiStore.getState().snack?.message).toContain('refusées');
  });

  it('calls from the notification’s « Appeler », the contact opened', async () => {
    const lea = createContact(draft('Léa', 'Martin', { phones: [{ id: 'p1', number: '06 12 34 56 78', kind: 'mobile', label: '' }] }));
    const opened: string[] = [];
    answerBirthday({ kind: 'call', contactId: lea }, id => opened.push(id));
    await new Promise(resolve => setImmediate(resolve));
    expect(opened).toEqual([lea]);
    // Dialled with the phone's code (fr-FR here), so it reaches them from abroad too.
    expect(phone.placed).toEqual(['+33612345678']);
  });
});

describe('duplicates', () => {
  it('merges a group in one batch, the others binned and pointing at the one kept, and undoes it', () => {
    const keep = createContact(draft('Léa', 'Martin', { phones: [{ id: 'p1', number: '06 12 34 56 78', kind: 'mobile', label: '' }] }));
    const other = createContact(draft('Léa', 'Martin', { emails: [{ id: 'e1', address: 'lea@example.org', kind: 'home', label: '' }] }));
    const undo = mergeDuplicates(keep, [keep, other])!;
    const { contacts, liveContacts } = useLibraryStore.getState();
    expect(liveContacts).toEqual([keep]);
    expect(contacts[keep]!.emails.map(entry => entry.address)).toEqual(['lea@example.org']);
    expect(contacts[other]).toMatchObject({ mergedInto: keep });
    const kept = getRecord('contact', keep)!.clocks as Record<string, string>;
    const binned = getRecord('contact', other)!.clocks as Record<string, string>;
    expect(kept.emails).toBe(binned.mergedInto);
    // « Mentionné dans » asks for both.
    expect(mentionIds(contacts, keep)).toEqual([keep, other]);
    undo();
    expect([...useLibraryStore.getState().liveContacts].sort()).toEqual([keep, other].sort());
  });
});

describe('the way there', () => {
  it('offers the phone’s maps apps for an address, nothing being chosen', async () => {
    await openPlace(addressLine({ street: '12 rue des Lilas', postalCode: '69003', city: 'Lyon', region: '', country: 'France' }), { directions: true });
    expect(useMapsStore.getState().asking).toMatchObject({ place: '12 rue des Lilas, 69003 Lyon, France', directions: true });
    useMapsStore.setState({ asking: null });
  });
});

describe('gift ideas', () => {
  afterEach(() => setServer(null));

  it('keeps the link through the server, and says why not when Carnet is off', async () => {
    expect(await sendGift('https://shop.example.org/livre', 'Léa Martin')).toContain('Reliez un serveur');

    setServer({ url: 'https://suite.test', token: 'jeton' });
    setServerApps(['notes', 'contacts']);
    const asked: unknown[] = [];
    global.fetch = jest.fn(async (_url: string, init?: { body?: string }) => {
      asked.push(JSON.parse(init!.body!));
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ collectionId: 'col1', linkId: 'link1', existing: false, created: true }) };
    }) as unknown as typeof fetch;
    expect(await sendGift('https://shop.example.org/livre', 'Léa Martin')).toBeNull();
    expect(asked).toEqual([{ url: 'https://shop.example.org/livre', forName: 'Léa Martin', lang: 'fr' }]);
    expect(useUiStore.getState().snack?.message).toBe('Ajouté à Cadeaux dans Carnet');

    setServerApps(['contacts']);
    expect(await sendGift('https://shop.example.org/livre', 'Léa Martin')).toBe('Carnet n’est pas activé sur ce serveur.');
  });
});
