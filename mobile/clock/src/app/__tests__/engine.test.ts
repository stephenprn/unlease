/**
 * The alarm engine is handed every alarm switched on, and how this phone rings them, at start and
 * whenever an alarm, a ringing setting or the language changes; never an alarm switched off or
 * deleted; never twice the same plan.
 */
import { setLocale } from '@unlease/core/i18n';
import { closeDatabase, openDatabase } from '@shared/data/db/database';
import { bootstrap, resetBootstrap } from '@app/bootstrap';
import { resetEngine, startEngine } from '@app/engine';
import { createAlarm, deleteAlarm, switchAlarm } from '@app/store/actions';
import { setPrefs } from '@app/store/clockUi';
import { resetLibrary } from '@app/store/libraryStore';
import { useSettingsStore } from '@shared/app/store/settingsStore';

import { __reset, state as engine } from '../../../../shared/__mocks__/NativeAlarmEngine';

jest.useFakeTimers();

interface Handed {
  readonly alarms: readonly { readonly id: string; readonly time: string; readonly days: readonly number[]; readonly date: string | null; readonly title: string; readonly sound: string }[];
  readonly settings: { readonly ringsHere: boolean; readonly snoozeMinutes: number; readonly words: { readonly snooze: string; readonly snoozedUntil: string } };
}
const last = (): Handed => JSON.parse(engine.plans[engine.plans.length - 1]!) as Handed;
const flush = async (): Promise<void> => {
  jest.advanceTimersByTime(200);
  for (let tick = 0; tick < 12; tick += 1) await Promise.resolve();
};

const DRAFT = { time: '07:30', days: [1, 2, 3, 4, 5], label: 'Travail', sound: 'bell', vibrate: true, weather: true, agenda: true, offDays: false, link: null };

describe('the engine’s plan', () => {
  let stop: () => void = () => {};

  beforeEach(() => {
    __reset();
    resetEngine();
    closeDatabase();
    resetLibrary();
    resetBootstrap();
    openDatabase({ name: 'engine.sqlite' });
    jest.setSystemTime(new Date(2026, 10, 16, 21, 0, 0));
    setLocale('fr');
    bootstrap();
  });

  afterEach(() => stop());

  it('hands every alarm switched on, again on each change, never twice the same', async () => {
    stop = startEngine();
    await flush();
    expect(last().alarms).toEqual([]);
    const id = createAlarm(DRAFT);
    await flush();
    expect(last().alarms).toEqual([expect.objectContaining({ id, time: '07:30', days: [1, 2, 3, 4, 5], date: null, title: 'Travail', sound: 'bell' })]);
    const handed = engine.plans.length;
    // Nothing changed: not handed again.
    setPrefs({});
    await flush();
    expect(engine.plans.length).toBe(handed);
    switchAlarm(id, false);
    await flush();
    expect(last().alarms).toEqual([]);
    switchAlarm(id, true);
    await flush();
    expect(last().alarms).toHaveLength(1);
    deleteAlarm(id);
    await flush();
    expect(last().alarms).toEqual([]);
  });

  it('holds no alarm while the server has Clock off, and all of them again once on', async () => {
    const before = useSettingsStore.getState();
    stop = startEngine();
    createAlarm(DRAFT);
    await flush();
    expect(last().alarms).toHaveLength(1);
    useSettingsStore.setState({ onboarded: true, server: { url: 'https://example.org', token: 'token' } as never, apps: ['calendar'] });
    await flush();
    expect(last().alarms).toEqual([]);
    useSettingsStore.setState({ apps: ['calendar', 'clock'] });
    await flush();
    expect(last().alarms).toHaveLength(1);
    useSettingsStore.setState(before, true);
  });

  it('says how this phone rings, in the app’s language', async () => {
    stop = startEngine();
    setPrefs({ snoozeMinutes: 5, ringsHere: false });
    await flush();
    expect(last().settings).toMatchObject({ ringsHere: false, snoozeMinutes: 5, words: { snooze: 'Répéter', snoozedUntil: 'Répétée jusqu’à {time}' } });
    setLocale('en');
    await flush();
    expect(last().settings.words.snooze).toBe('Snooze');
  });
});
