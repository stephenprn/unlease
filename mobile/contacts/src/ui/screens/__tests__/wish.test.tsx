/**
 * A contact's row slid to call or to text, past its threshold only. A birthday's wish and its
 * notification, in the real app: on the day a contact's page offers
 * « Souhaiter », which asks the way (SMS, WhatsApp, e-mail) and opens it with the message written, or
 * goes at once when there is one way; the birthdays' list offers it on today's rows; a notification's
 * « Message » opens the page on the choice; in the week before, « À propos » says when the phone tells
 * of it and turns on « Prévenir la veille ».
 */
import { Dimensions, Linking } from 'react-native';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { State } from 'react-native-gesture-handler';
import { act, type ReactTestInstance } from 'react-test-renderer';

import { plural } from '@unlease/core/services/format';
import { answerBirthday } from '@app/hooks/useBirthdayAlerts';
import { createContact, type ContactDraft } from '@app/store/actions';
import { setBirthdaySettings, useContactsUiStore } from '@app/store/contactsUi';
import { navigate, navigationRef } from '@ui/navigation/navigationRef';

import { __reset as resetNotifee } from '../../../../__mocks__/@notifee/react-native';
import { state as phone, __reset as resetPhone } from '../../../../../shared/__mocks__/NativePhoneContacts';
import { boot, fakeFetch, pressableWithText, pressables, settle, textOf, unmountAll } from './harness';

jest.useFakeTimers();

const person = (firstName: string, lastName: string, more: Partial<ContactDraft> = {}): ContactDraft => ({
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

/** A birthday `days` from today, born in 1990. */
const inDays = (days: number): string => {
  const at = new Date();
  at.setDate(at.getDate() + days);
  return `1990-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
};

const mobile = { id: 'p1', number: '06 12 34 56 78', kind: 'mobile', label: '' };
const email = { id: 'e1', address: 'lea@example.org', kind: 'home', label: '' };

const go = async (...args: unknown[]): Promise<void> => {
  await act(async () => {
    (navigationRef.navigate as (...a: unknown[]) => void)(...args);
  });
  await settle();
};

const press = async (node: ReactTestInstance): Promise<void> => {
  await act(async () => (node.props as { onPress: () => void }).onPress());
  await settle();
};

let opened: string[] = [];

/** A finger on a row of the list, taken sideways by `x` and let go. */
async function slide(id: string, x: number): Promise<void> {
  await act(async () => {
    fireGestureHandler(getByGestureTestId(`contact-slide-${id}`), [{ state: State.BEGAN, translationX: 0 }, { state: State.ACTIVE, translationX: Math.sign(x) * 20 }, { translationX: x }, { state: State.END, translationX: x }]);
  });
  await settle();
}

describe('Contacts, a row slid', () => {
  beforeEach(() => {
    resetPhone();
    opened = [];
    global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    jest.spyOn(Linking, 'openURL').mockImplementation(async url => {
      opened.push(url);
    });
  });

  it('calls to the right, texts to the left, and only let go past its threshold', async () => {
    let lea = '';
    await boot({ onboarded: true, prepare: () => (lea = createContact(person('Léa', 'Martin', { phones: [{ ...mobile, kind: 'home', id: 'h' }, mobile] }))) });
    const past = Dimensions.get('window').width * 0.4;
    // Short of it: nothing, whichever way.
    await slide(lea, past / 2);
    await slide(lea, -past / 2);
    expect(phone.placed).toEqual([]);
    expect(opened).toEqual([]);
    // The mobile, as the page's « Appeler » and « SMS ».
    await slide(lea, past);
    expect(phone.placed).toEqual(['+33612345678']);
    await slide(lea, -past);
    expect(opened).toEqual(['sms:+33612345678']);
  });
});

describe('Contacts, a birthday’s wish', () => {
  beforeEach(() => {
    resetNotifee();
    resetPhone();
    opened = [];
    global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    jest.spyOn(Linking, 'openURL').mockImplementation(async url => {
      opened.push(url);
    });
  });

  afterAll(unmountAll);

  it('offers « Souhaiter » on the day, asks the way, and opens it with the wish written', async () => {
    let lea = '';
    const tree = await boot({ onboarded: true, prepare: () => (lea = createContact(person('Léa', 'Martin', { birthday: inDays(0), phones: [mobile], emails: [email] }))) });
    await go('Contact', { id: lea });
    expect(textOf(tree)).toContain('Son anniversaire');
    expect(textOf(tree)).toContain(`Aujourd’hui · ${plural(36, 'an')}`);
    await press(pressables(tree, 'Souhaiter son anniversaire à Léa Martin')[0]!);
    // WhatsApp is installed here: three ways, the message quoted.
    expect(textOf(tree)).toContain('« Joyeux anniversaire, Léa ! »');
    expect(textOf(tree)).toContain('+33 6 12 34 56 78');
    await press(pressables(tree, 'WhatsApp').at(-1)!);
    expect(opened).toEqual(['https://wa.me/33612345678?text=Joyeux%20anniversaire%2C%20L%C3%A9a%20!']);
  });

  it('goes the one way there is at once', async () => {
    let paul = '';
    const tree = await boot({ onboarded: true, prepare: () => (paul = createContact(person('Paul', 'Durand', { birthday: inDays(-1), emails: [email] }))) });
    await go('Contact', { id: paul });
    // The day after still offers it.
    expect(textOf(tree)).toContain(`Hier · ${plural(36, 'an')}`);
    await press(pressables(tree, 'Souhaiter son anniversaire à Paul Durand')[0]!);
    expect(opened).toEqual(['mailto:lea@example.org?subject=Joyeux%20anniversaire&body=Joyeux%20anniversaire%2C%20Paul%20!']);
  });

  it('says nothing of it the rest of the year, nor without a way to write', async () => {
    let lea = '';
    let noOne = '';
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        lea = createContact(person('Léa', 'Martin', { birthday: inDays(20), phones: [mobile] }));
        noOne = createContact(person('Zoé', 'Abel', { birthday: inDays(0) }));
      },
    });
    await go('Contact', { id: lea });
    expect(pressables(tree, 'Souhaiter son anniversaire à Léa Martin')).toHaveLength(0);
    // Far off: nothing said of the notification either.
    expect(textOf(tree)).not.toContain('Prévenir');
    await go('Contact', { id: noOne });
    expect(pressables(tree, 'Souhaiter son anniversaire à Zoé Abel')).toHaveLength(0);
  });

  it('offers it on today’s rows of the birthdays', async () => {
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        createContact(person('Léa', 'Martin', { birthday: inDays(0), phones: [mobile] }));
        createContact(person('Paul', 'Durand', { birthday: inDays(3), phones: [mobile] }));
      },
    });
    phone.whatsapp = false;
    await go('Birthdays');
    expect(pressables(tree, 'Souhaiter son anniversaire à Paul Durand')).toHaveLength(0);
    await press(pressables(tree, 'Souhaiter son anniversaire à Léa Martin')[0]!);
    // Without WhatsApp, the SMS is the one way: it opens at once.
    expect(opened).toEqual(['sms:+33612345678?body=Joyeux%20anniversaire%2C%20L%C3%A9a%20!']);
  });

  it('opens the page on the choice from the notification’s « Message » on the day; writes as before the day before', async () => {
    let lea = '';
    let paul = '';
    const tree = await boot({
      onboarded: true,
      prepare: () => {
        lea = createContact(person('Léa', 'Martin', { birthday: inDays(0), phones: [mobile], emails: [email] }));
        paul = createContact(person('Paul', 'Durand', { birthday: inDays(1), phones: [mobile] }));
      },
    });
    await act(async () => answerBirthday({ kind: 'message', contactId: lea }, (id, wish) => navigate('Contact', wish ? { id, wish: true } : { id })));
    await settle();
    expect(navigationRef.getCurrentRoute()?.params).toEqual({ id: lea });
    expect(textOf(tree)).toContain('« Joyeux anniversaire, Léa ! »');
    expect(opened).toEqual([]);

    await act(async () => answerBirthday({ kind: 'message', contactId: paul }, id => navigate('Contact', { id })));
    await settle();
    expect(opened).toEqual(['sms:+33612345678']);
  });

  it('says when the phone tells of it in the week before, and turns on « Prévenir la veille »', async () => {
    let lea = '';
    const tree = await boot({ onboarded: true, prepare: () => (lea = createContact(person('Léa', 'Martin', { birthday: inDays(3), phones: [mobile] }))) });
    await act(async () => setBirthdaySettings({ enabled: false, dayBefore: false, hour: 9 }));
    await go('Contact', { id: lea });
    await press(pressableWithText(tree, 'Prévenir des anniversaires'));
    expect(useContactsUiStore.getState().birthdays.enabled).toBe(true);
    expect(textOf(tree)).toContain('Rappel le jour même à 09:00');
    await press(pressableWithText(tree, 'Prévenir la veille'));
    expect(useContactsUiStore.getState().birthdays.dayBefore).toBe(true);
    expect(textOf(tree)).toContain('Rappel le jour même à 09:00, et la veille');
  });
});
