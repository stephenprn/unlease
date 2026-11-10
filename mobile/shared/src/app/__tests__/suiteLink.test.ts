/**
 * The suite's apps on one phone, through a stand-in for the native module: this app hands on its
 * connection, its appearance and its grain whenever they change (cleared when it lets its server go),
 * reads what its siblings hold, known apps only, never itself, and takes the grain a sibling chose last.
 */
import { AppState } from 'react-native';

import { DEFAULT_APPEARANCE, PALETTE_COLORS } from '@unlease/design/appearance';

import { state as native, __reset } from '../../../__mocks__/NativeSuiteLink';
import { readPreferences } from '../../data/repositories/stateRepository';
import { applyLookTo, setAppearance, setGrain, setInterfaceLocale, setServer, setTheme, useSettingsStore } from '../store/settingsStore';
import { closeDatabase, openDatabase } from '../../data/db/database';
import { connectedSibling, findSiblings, followSiblings, followSiblingsGrain, parseGrainChoice, parseLookOffer, startSuiteLink, stopSuiteLink } from '../suiteLink';

// This process is Pages, as its library would say.
jest.mock('../store/library', () => ({ ownApp: () => 'pages' }));

const flush = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

beforeEach(() => {
  __reset();
  closeDatabase();
  openDatabase({ name: 'suite.sqlite' });
  useSettingsStore.setState({ server: null, appearance: DEFAULT_APPEARANCE, grain: true, grainAt: 0, locale: 'fr', localeAt: 0, theme: 'system', lookAt: 0, lookOffer: null });
});

afterEach(() => stopSuiteLink());

describe('what this app hands its siblings', () => {
  it('is its connection and appearance, again whenever they change, cleared without a server', () => {
    startSuiteLink();
    expect(native.shared).toEqual({ server: '', token: '', appearance: JSON.stringify(DEFAULT_APPEARANCE), grain: '', locale: '', look: '' });
    setServer({ url: 'unlease.example.org', token: 'jeton' });
    expect(native.shared).toMatchObject({ server: 'https://unlease.example.org', token: 'jeton' });
    setAppearance({ ...DEFAULT_APPEARANCE, ...PALETTE_COLORS.sarcelle });
    expect(JSON.parse(native.shared!.appearance)).toMatchObject(PALETTE_COLORS.sarcelle);
    setServer(null);
    expect(native.shared).toMatchObject({ server: '', token: '' });
  });

  it('is its grains and when they were chosen, once chosen', () => {
    startSuiteLink();
    setGrain(false);
    const paper = parseGrainChoice(native.shared!.grain);
    expect(paper).toMatchObject({ paper: false, ground: true });
    setAppearance({ ...useSettingsStore.getState().appearance, grain: false });
    const ground = parseGrainChoice(native.shared!.grain);
    expect(ground).toMatchObject({ paper: false, ground: false });
    expect(ground!.at).toBeGreaterThanOrEqual(paper!.at);
    // Another colour leaves the grain's time as it was.
    setAppearance({ ...useSettingsStore.getState().appearance, ...PALETTE_COLORS.sarcelle });
    expect(parseGrainChoice(native.shared!.grain)!.at).toBe(ground!.at);
  });
});

describe('what the siblings hold', () => {
  it('is asked of the other apps only, and read as connections and appearances', async () => {
    native.siblings = [
      { packageName: 'com.stephenprn.pages', server: 'https://unlease.example.org', token: 'jeton', appearance: JSON.stringify({ ...DEFAULT_APPEARANCE, ...PALETTE_COLORS.sarcelle }), grain: '', locale: '', look: '' },
      // Not of the suite: left out.
      { packageName: 'org.example.other', server: 'https://other.example.org', token: 'x', appearance: '', grain: '', locale: '', look: '' },
    ];
    const found = await findSiblings('notes');
    expect(native.asked).toEqual([['com.stephenprn.pages', 'com.stephenprn.agenda', 'com.stephenprn.contacts']]);
    expect(found).toEqual([{ app: 'pages', server: { url: 'https://unlease.example.org', token: 'jeton' }, appearance: expect.objectContaining(PALETTE_COLORS.sarcelle), grain: null, locale: null, look: null }]);
    expect(connectedSibling(found)?.app).toBe('pages');
  });

  it('leaves out a sibling that holds nothing, and reads a broken appearance as none', async () => {
    native.siblings = [
      { packageName: 'com.stephenprn.carnet', server: '', token: '', appearance: '', grain: '', locale: '', look: '' },
      { packageName: 'com.stephenprn.agenda', server: 'https://unlease.example.org', token: 'jeton', appearance: '{broken', grain: '{broken', locale: '{broken', look: '' },
    ];
    const found = await findSiblings('pages');
    expect(found).toEqual([{ app: 'calendar', server: { url: 'https://unlease.example.org', token: 'jeton' }, appearance: null, grain: null, locale: null, look: null }]);
  });
});

describe('the language, the suite’s', () => {
  const language = (locale: string, at: number): string => JSON.stringify({ locale, at });

  it('is the one a sibling chose last, when this app never chose or chose before', async () => {
    native.siblings = [
      { packageName: 'com.stephenprn.carnet', server: '', token: '', appearance: '', grain: '', locale: language('en', 2000), look: '' },
      { packageName: 'com.stephenprn.contacts', server: '', token: '', appearance: '', grain: '', locale: '{broken', look: '' },
    ];
    await followSiblings('pages');
    expect(useSettingsStore.getState()).toMatchObject({ locale: 'en', localeAt: 2000 });
    expect(readPreferences()).toMatchObject({ locale: 'en', localeAt: 2000 });
  });

  it('stays this app’s when it chose later, and goes to the siblings once chosen', async () => {
    startSuiteLink();
    setInterfaceLocale('fr');
    const own = useSettingsStore.getState().localeAt;
    expect(JSON.parse(native.shared!.locale)).toEqual({ locale: 'fr', at: own });
    native.siblings = [{ packageName: 'com.stephenprn.carnet', server: '', token: '', appearance: '', grain: '', locale: language('en', own - 1), look: '' }];
    await followSiblings('pages');
    expect(useSettingsStore.getState()).toMatchObject({ locale: 'fr', localeAt: own });
  });
});

describe('the grain, the suite’s', () => {
  const grain = (paper: boolean, ground: boolean, at: number): string => JSON.stringify({ paper, ground, at });

  it('is the one a sibling chose last, when later than this app’s, kept for the next start', async () => {
    useSettingsStore.setState({ grainAt: 1000 });
    native.siblings = [
      { packageName: 'com.stephenprn.carnet', server: '', token: '', appearance: '', grain: grain(false, true, 2000), locale: '', look: '' },
      { packageName: 'com.stephenprn.contacts', server: '', token: '', appearance: '', grain: grain(false, false, 3000), locale: '', look: '' },
    ];
    await followSiblingsGrain('pages');
    expect(useSettingsStore.getState()).toMatchObject({ grain: false, grainAt: 3000, appearance: { ...DEFAULT_APPEARANCE, grain: false } });
    expect(readPreferences()).toMatchObject({ grain: false, grainAt: 3000, appearance: { grain: false } });
  });

  it('stays this app’s when it chose later, or when no sibling chose', async () => {
    setGrain(false);
    const own = useSettingsStore.getState().grainAt;
    native.siblings = [{ packageName: 'com.stephenprn.carnet', server: '', token: '', appearance: '', grain: grain(true, false, own - 1), locale: '', look: '' }];
    await followSiblingsGrain('pages');
    expect(useSettingsStore.getState()).toMatchObject({ grain: false, grainAt: own, appearance: { grain: true } });

    native.siblings = [{ packageName: 'com.stephenprn.carnet', server: '', token: '', appearance: '', grain: '', locale: '', look: '' }];
    await followSiblingsGrain('pages');
    expect(useSettingsStore.getState().grainAt).toBe(own);
  });

  it('is followed at start, and again whenever the app comes back to the front', async () => {
    const listeners: ((state: string) => void)[] = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as (state: string) => void);
      return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
    });
    try {
      native.siblings = [{ packageName: 'com.stephenprn.carnet', server: '', token: '', appearance: '', grain: grain(false, true, 2000), locale: '', look: '' }];
      startSuiteLink();
      await flush();
      expect(useSettingsStore.getState()).toMatchObject({ grain: false, grainAt: 2000 });
      // Changed in Carnet meanwhile: seen as Pages comes back.
      native.siblings = [{ packageName: 'com.stephenprn.carnet', server: '', token: '', appearance: '', grain: grain(true, false, 3000), locale: '', look: '' }];
      listeners.forEach(listener => listener('background'));
      await flush();
      expect(useSettingsStore.getState().grainAt).toBe(2000);
      listeners.forEach(listener => listener('active'));
      await flush();
      expect(useSettingsStore.getState()).toMatchObject({ grain: true, grainAt: 3000, appearance: { grain: false } });
      // What it took, it hands on with Carnet's time.
      expect(parseGrainChoice(native.shared!.grain)).toEqual({ paper: true, ground: false, at: 3000 });
    } finally {
      spy.mockRestore();
    }
  });
});

describe('the look, each app’s', () => {
  const offer = (theme: string, colors: object, at: number, to: unknown, grain = true): string => JSON.stringify({ theme, appearance: { ...DEFAULT_APPEARANCE, ...colors, grain }, at, ...(to === undefined ? {} : { to }) });
  const sibling = (look: string) => ({ packageName: 'com.stephenprn.carnet', server: '', token: '', appearance: '', grain: '', locale: '', look });

  it('stays this app’s when chosen: nothing goes to the siblings but its time', () => {
    startSuiteLink();
    setTheme('dark');
    setAppearance({ ...useSettingsStore.getState().appearance, ...PALETTE_COLORS.sarcelle });
    expect(native.shared!.look).toBe('');
    expect(useSettingsStore.getState().lookAt).toBeGreaterThan(0);
  });

  it('goes to the apps it is sent to, whole and with its time, and a later choice leaves what was sent', () => {
    startSuiteLink();
    setTheme('dark');
    setAppearance({ ...useSettingsStore.getState().appearance, ...PALETTE_COLORS.sarcelle });
    applyLookTo(['notes', 'calendar', 'notes']);
    const sent = parseLookOffer(native.shared!.look);
    expect(sent).toMatchObject({ theme: 'dark', to: ['notes', 'calendar'], appearance: expect.objectContaining(PALETTE_COLORS.sarcelle) });
    expect(readPreferences()).toMatchObject({ lookOffer: { theme: 'dark', to: ['notes', 'calendar'] } });
    setTheme('light');
    expect(parseLookOffer(native.shared!.look)).toEqual(sent);
    // Sent to nobody: nothing is sent.
    applyLookTo([]);
    expect(parseLookOffer(native.shared!.look)).toEqual(sent);
  });

  it('is taken when a sibling sent it to this app after it chose its own, its grain left to the grains', async () => {
    startSuiteLink();
    useSettingsStore.setState({ lookAt: 1000, theme: 'light' });
    native.siblings = [
      sibling(offer('dark', PALETTE_COLORS.sarcelle, 2000, ['pages', 'calendar'], false)),
      { ...sibling('{broken'), packageName: 'com.stephenprn.contacts' },
    ];
    await followSiblings('pages');
    expect(useSettingsStore.getState()).toMatchObject({ theme: 'dark', lookAt: 2000, appearance: { ...PALETTE_COLORS.sarcelle, grain: true } });
    expect(readPreferences()).toMatchObject({ theme: 'dark', lookAt: 2000 });
    // What it took it does not send on: nothing echoes.
    expect(native.shared!.look).toBe('');
  });

  it('is left when sent to other apps, sent before this app chose, or naming no app', async () => {
    startSuiteLink();
    setTheme('light');
    const own = useSettingsStore.getState().lookAt;
    native.siblings = [sibling(offer('dark', {}, own + 5, ['calendar']))];
    await followSiblings('pages');
    expect(useSettingsStore.getState()).toMatchObject({ theme: 'light', lookAt: own });
    native.siblings = [sibling(offer('dark', {}, own - 1, ['pages']))];
    await followSiblings('pages');
    expect(useSettingsStore.getState()).toMatchObject({ theme: 'light', lookAt: own });
    native.siblings = [sibling(offer('dark', {}, own + 5, undefined)), { ...sibling(offer('dark', {}, own + 6, ['elsewhere'])), packageName: 'com.stephenprn.contacts' }];
    await followSiblings('pages');
    expect(useSettingsStore.getState()).toMatchObject({ theme: 'light', lookAt: own });
    expect(parseLookOffer(offer('dark', {}, 5, undefined))).toBeNull();
  });

  it('is the one sent last of two, and once taken a resent older one changes nothing', async () => {
    native.siblings = [sibling(offer('dark', {}, 3000, ['pages'])), { ...sibling(offer('light', PALETTE_COLORS.sarcelle, 4000, ['pages'])), packageName: 'com.stephenprn.agenda' }];
    await followSiblings('pages');
    expect(useSettingsStore.getState()).toMatchObject({ theme: 'light', lookAt: 4000 });
    native.siblings = [sibling(offer('dark', {}, 3000, ['pages']))];
    await followSiblings('pages');
    expect(useSettingsStore.getState()).toMatchObject({ theme: 'light', lookAt: 4000 });
  });
});
