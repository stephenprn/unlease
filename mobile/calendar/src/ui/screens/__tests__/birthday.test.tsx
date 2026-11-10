/**
 * A birthday's page: on the day (and the day after) « Souhaiter » asks the way and opens it with the
 * wish written, or goes at once the one way there is; another day it is not offered. Birthday
 * notifications are Contacts': the page says so, and opens Contacts' birthdays when it is installed.
 */
import { Linking } from 'react-native';
import { act } from 'react-test-renderer';

import { addDays, today } from '@unlease/calendar/services/time';
import { writeLocal } from '@app/store/libraryStore';
import { navigationRef } from '@ui/navigation/navigationRef';

import { __reset as resetSuite } from '../../../../../shared/__mocks__/NativeSuiteLink';
import { boot, fakeFetch, pressableWithText, pressables, settle, textOf, unmountAll } from './harness';

jest.useFakeTimers();

const day = today(Date.now());
let opened: string[] = [];
let installed: string[] = [];

const contact = (id: string, firstName: string, more: Record<string, unknown>) => ({
  type: 'contact' as const,
  id,
  patch: { firstName, lastName: 'Martin', birthday: `1990-${day.slice(5)}`, phones: [], emails: [], addresses: [], labelIds: [], favorite: false, createdAt: 1, deletedAt: null, trashedAt: null, ...more },
});
const mobile = { id: 'p1', number: '06 12 34 56 78', kind: 'mobile', label: '' };
const email = { id: 'e1', address: 'lea@example.org', kind: 'home', label: '' };

async function openBirthday(id: string, on: string): Promise<void> {
  await act(async () => {
    navigationRef.navigate('Birthday', { id, day: on });
  });
  await settle();
}

describe('Agenda, a birthday’s page', () => {
  beforeEach(() => {
    resetSuite();
    opened = [];
    installed = [];
    global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'canOpenURL').mockImplementation(async url => installed.some(scheme => url.startsWith(scheme)));
    jest.spyOn(Linking, 'openURL').mockImplementation(async url => {
      opened.push(url);
    });
  });

  afterAll(unmountAll);

  it('offers « Souhaiter » on the day, asks the way, and opens it with the wish written', async () => {
    const tree = await boot({ onboarded: true });
    await act(async () => writeLocal([contact('lea', 'Léa', { phones: [mobile], emails: [email] })]));
    await openBirthday('lea', day);
    await act(async () => pressables(tree, 'Souhaiter son anniversaire à Léa Martin')[0]!.props.onPress());
    await settle();
    expect(textOf(tree)).toContain('« Joyeux anniversaire, Léa ! »');
    // WhatsApp too: their number's country is the phone's.
    expect(textOf(tree)).toContain('WhatsApp');
    await act(async () => pressables(tree, 'SMS').at(-1)!.props.onPress());
    await settle();
    expect(opened).toEqual(['sms:+33612345678?body=Joyeux%20anniversaire%2C%20L%C3%A9a%20!']);
  });

  it('goes at once the one way there is, the day after too, and not on another day', async () => {
    const tree = await boot({ onboarded: true });
    await act(async () => writeLocal([contact('lea', 'Léa', { birthday: `1990-${addDays(day, -1).slice(5)}`, emails: [email] })]));
    await openBirthday('lea', addDays(day, -1));
    await act(async () => pressables(tree, 'Souhaiter son anniversaire à Léa Martin')[0]!.props.onPress());
    await settle();
    expect(opened).toEqual(['mailto:lea@example.org?subject=Joyeux%20anniversaire&body=Joyeux%20anniversaire%2C%20L%C3%A9a%20!']);
    await openBirthday('lea', addDays(day, 364));
    expect(pressables(tree, 'Souhaiter son anniversaire à Léa Martin')).toHaveLength(0);
  });

  it('says the notifications are Contacts’, and opens its birthdays when it is installed', async () => {
    let tree = await boot({ onboarded: true });
    await act(async () => writeLocal([contact('lea', 'Léa', {})]));
    await openBirthday('lea', day);
    expect(textOf(tree)).toContain('Envoyées par Contacts, une fois installé sur ce téléphone.');
    // Nothing to write with: no « Souhaiter ».
    expect(pressables(tree, 'Souhaiter son anniversaire à Léa Martin')).toHaveLength(0);

    installed = ['unlease-contacts://'];
    tree = await boot({ onboarded: true });
    await act(async () => writeLocal([contact('lea', 'Léa', {})]));
    await openBirthday('lea', day);
    await act(async () => pressableWithText(tree, 'Notifications d’anniversaire').props.onPress());
    await settle();
    expect(opened).toEqual(['unlease-contacts://birthdays']);
  });
});
