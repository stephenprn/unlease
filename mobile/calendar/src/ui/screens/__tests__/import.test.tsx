/**
 * Agenda's import wizard on the phone: an `.ics` shared with the app lands on its preview (every event
 * with what becomes of it, one left out by its box), the choices change what comes (the period, the
 * label), « Importer » writes one batch, its slip takes it back; the picker's file is read the same,
 * and its copy in the cache goes. Réglages' « Effacer des données » opens Agenda's parts.
 */
import { Linking } from 'react-native';
import { act } from 'react-test-renderer';

import { useLibraryStore } from '@app/store/libraryStore';
import { useUiStore } from '@shared/app/store/uiStore';
import { navigationRef } from '@ui/navigation/navigationRef';

import { __queueShare, __reset as resetIntake } from '../../../../../shared/__mocks__/NativeIntake';
import { __reset as resetMedia, state as media } from '../../../../../shared/__mocks__/NativeMedia';
import { __reset as resetSuite } from '../../../../../shared/__mocks__/NativeSuiteLink';
import { boot, fakeFetch, pressableWithText, pressables, settle, textOf, unmountAll } from './harness';

jest.useFakeTimers();

const ICS = [
  'BEGIN:VCALENDAR',
  'X-WR-CALNAME:Perso',
  'BEGIN:VEVENT',
  'UID:noel@example.org',
  'DTSTART;VALUE=DATE:20261224',
  'DTEND;VALUE=DATE:20261226',
  'SUMMARY:Noël',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:old@example.org',
  'DTSTART;VALUE=DATE:20200101',
  'SUMMARY:Jour de l’an 2020',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:off@example.org',
  'STATUS:CANCELLED',
  'DTSTART;VALUE=DATE:20261231',
  'SUMMARY:Réveillon annulé',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const live = () => Object.values(useLibraryStore.getState().events).filter(event => event.deletedAt === null && event.trashedAt === null);

const press = async (tree: Awaited<ReturnType<typeof boot>>, text: string): Promise<void> => {
  await act(async () => {
    pressableWithText(tree, text).props.onPress();
  });
  await settle();
};

describe('Agenda, its import', () => {
  beforeEach(() => {
    resetIntake();
    resetMedia();
    resetSuite();
    global.fetch = jest.fn(fakeFetch) as unknown as typeof fetch;
    jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });

  afterAll(unmountAll);

  it('takes a shared file to its preview, then the choices, then one batch its slip takes back', async () => {
    media.texts['/cache/perso.ics'] = ICS;
    __queueShare({ id: 'file-1', mimeType: 'text/calendar', text: '', subject: '', files: ['/cache/perso.ics'] });
    const tree = await boot({ onboarded: true });
    await settle();
    expect(navigationRef.getCurrentRoute()?.name).toBe('Import');
    const preview = textOf(tree);
    expect(preview).toContain('Ce que contient le fichier');
    expect(preview).toContain('Agenda « Perso »');
    expect(preview).toContain('Annulé dans le fichier');
    // Read, its copy in the cache goes.
    expect(media.removed).toContain('/cache/perso.ics');
    // The old one left out by its box.
    await act(async () => {
      pressables(tree, 'Importer Jour de l’an 2020')[0]!.props.onPress();
    });
    await settle();
    await press(tree, 'Continuer');
    expect(textOf(tree)).toContain('Vos choix');
    expect(textOf(tree)).toContain('Nom du libellé');
    await press(tree, 'Importer 1\u00a0événement');
    await settle();
    expect(textOf(tree)).toContain('Import terminé');
    expect(live().map(event => event.title)).toEqual(['Noël']);
    const label = Object.values(useLibraryStore.getState().calendarLabels).find(each => each.name === 'Perso')!;
    expect(live()[0]!.labelIds).toEqual([label.id]);
    // Its slip takes it all back, the label too.
    const snack = useUiStore.getState().snack!;
    expect(snack.message.replace(/\u00a0/g, ' ')).toBe('1 événement importés');
    await act(async () => snack.action!.run());
    expect(live()).toHaveLength(0);
    expect(useLibraryStore.getState().calendarLabels[label.id]!.deletedAt).not.toBeNull();
  });

  it('reads a picked file, says when it is no calendar, and goes back a step', async () => {
    const tree = await boot({ onboarded: true });
    await act(async () => navigationRef.navigate('Import'));
    await settle();
    media.nextFile = { status: 'ok', message: '', path: '/cache/notes.txt', name: 'notes.txt', bytes: 5 };
    media.texts['/cache/notes.txt'] = 'bonjour';
    await press(tree, 'Choisir un fichier .ics');
    expect(textOf(tree)).toContain('Ce fichier ne se lit pas comme un agenda.');
    media.nextFile = { status: 'ok', message: '', path: '/cache/perso.ics', name: 'perso.ics', bytes: 500 };
    media.texts['/cache/perso.ics'] = ICS;
    await press(tree, 'Choisir un fichier .ics');
    expect(textOf(tree)).toContain('Ce que contient le fichier');
    await press(tree, 'Retour');
    expect(textOf(tree)).toContain('Votre agenda Google');
    expect(live()).toHaveLength(0);
  });

  it('opens « Effacer des données » from Réglages, last of « Données »', async () => {
    const tree = await boot({ onboarded: true });
    await act(async () => navigationRef.navigate('Settings'));
    await settle();
    await press(tree, 'Effacer des données');
    expect(navigationRef.getCurrentRoute()?.name).toBe('Erase');
    const text = textOf(tree);
    expect(text).toContain('Vos événements');
    expect(text).toContain('Événements importés');
    expect(text).toContain('Vos abonnements');
  });
});
