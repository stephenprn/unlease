/**
 * The mirror's switch: on asks Android and makes the account, each run writes through the app's
 * `run`, off takes the account away, and an account removed from Android's settings turns it off.
 */
import { closeDatabase, openDatabase } from '../../data/db/database';
import { readPreferences } from '../../data/repositories/stateRepository';
import { askMirrorPermissions, hasMirrorPermissions, type PhoneMirrorNative } from '../../platform/phoneMirror';
import { createPhoneMirror } from '../phoneMirror';

jest.mock('../../platform/phoneMirror', () => ({ phoneMirrorNative: null, askMirrorPermissions: jest.fn(), hasMirrorPermissions: jest.fn(), openMirrorSettings: jest.fn() }));

const permit = (granted: boolean) => {
  jest.mocked(askMirrorPermissions).mockResolvedValue(granted ? 'granted' : 'denied');
  jest.mocked(hasMirrorPermissions).mockResolvedValue(granted);
};

function fakeNative() {
  const state = { on: false, turnedOff: 0 };
  const native = {
    isOn: jest.fn(async () => state.on),
    turnOn: jest.fn(async () => {
      state.on = true;
      return true;
    }),
    turnOff: jest.fn(async () => {
      state.on = false;
      state.turnedOff += 1;
      return true;
    }),
    written: jest.fn(async () => '{}'),
    apply: jest.fn(async () => 0),
  } as unknown as PhoneMirrorNative & { [key: string]: jest.Mock };
  return { native, state };
}

const config = (run: jest.Mock) => ({ key: 'test.phoneMirror', permissions: 'contacts' as const, accountName: 'Unlease', run, subscribe: () => () => undefined });

describe('createPhoneMirror', () => {
  beforeEach(() => {
    closeDatabase();
    openDatabase({ name: 'phoneMirror.sqlite' });
    permit(true);
  });

  it('turned on, asks Android, makes the account and runs; turned off, takes it away', async () => {
    const { native, state } = fakeNative();
    const run = jest.fn(async () => undefined);
    const mirror = createPhoneMirror(config(run), native);
    expect(await mirror.turn(true)).toBe('on');
    expect(native.turnOn).toHaveBeenCalledWith('Unlease');
    expect(run).toHaveBeenCalledTimes(1);
    expect(readPreferences()['test.phoneMirror']).toBe(true);
    expect(await mirror.turn(false)).toBe('off');
    expect(state.on).toBe(false);
    expect(state.turnedOff).toBe(1);
  });

  it('stays wanted but refused while Android refuses, and writes nothing', async () => {
    permit(false);
    const { native } = fakeNative();
    const run = jest.fn(async () => undefined);
    const mirror = createPhoneMirror(config(run), native);
    expect(await mirror.turn(true)).toBe('denied');
    expect(native.turnOn).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('turns itself off when the account was removed from Android’s settings', async () => {
    const { native, state } = fakeNative();
    const run = jest.fn(async () => undefined);
    const mirror = createPhoneMirror(config(run), native);
    await mirror.turn(true);
    state.on = false;
    await mirror.sync();
    expect(readPreferences()['test.phoneMirror']).toBe(false);
    expect(native.turnOn).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('removes an account left behind while off', async () => {
    const { native, state } = fakeNative();
    state.on = true;
    const mirror = createPhoneMirror(config(jest.fn()), native);
    await mirror.sync();
    expect(state.on).toBe(false);
  });

  it('runs once more after a run asked for during one, never two at once', async () => {
    const { native } = fakeNative();
    let release: () => void = () => undefined;
    let running = 0;
    let most = 0;
    const run = jest.fn(async () => {
      running += 1;
      most = Math.max(most, running);
      await new Promise<void>(resolve => {
        release = resolve;
      });
      running -= 1;
    });
    const mirror = createPhoneMirror(config(run), native);
    const first = mirror.turn(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    const second = mirror.sync();
    const third = mirror.sync();
    release();
    await new Promise(resolve => setTimeout(resolve, 0));
    release();
    await Promise.all([first, second, third]);
    expect(run).toHaveBeenCalledTimes(2);
    expect(most).toBe(1);
  });
});
