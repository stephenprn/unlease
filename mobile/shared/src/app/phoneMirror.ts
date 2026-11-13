/**
 * An app's records copied into the phone's own, one way (Contacts' into the address book, Agenda's
 * into the calendar), so the phone's other apps see them: the dialer names who calls, the Clock and
 * Maps see the next event. Off until the person turns it on in Réglages; on, Android is asked for the
 * permissions, the app's account is added (`PhoneMirror` TurboModule) and every change of the records
 * is copied a moment later, from here, from the sync with the app closed (`syncTask`) and from the
 * reminders' run (`remindersTask`). Off, the account goes and every row it held with it; the account
 * removed from Android's settings turns it off here too.
 *
 * The app says what its rows are and how a run diffs them (`run`: the planner of its package and
 * `mirrorChanges`); here are the switch, the permissions, the order of runs (one at a time, one more
 * after if asked meanwhile) and the state Réglages shows.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { readPreferences, writePreference } from '@shared/data/repositories/stateRepository';
import { askMirrorPermissions, hasMirrorPermissions, phoneMirrorNative, type MirrorPermissions, type PhoneMirrorNative } from '@shared/platform/phoneMirror';

/** `unavailable`: no module (an older build); `denied`: on, but Android refuses the permissions. */
export type MirrorStatus = 'off' | 'on' | 'denied' | 'unavailable';

interface MirrorState {
  readonly wanted: boolean;
  readonly permitted: boolean;
  /** A run under way. */
  readonly working: boolean;
  /** The last run failed (Android refused a write): the next change tries again. */
  readonly failed: boolean;
}

export interface PhoneMirrorConfig {
  /** Its preference (`contacts.phoneMirror`): wanted or not, on this phone. */
  readonly key: string;
  readonly permissions: MirrorPermissions;
  /** The account's name, shown in the phone's contacts or calendar app. */
  readonly accountName: string;
  /** One run: what the account holds read, the changes written. */
  readonly run: (native: PhoneMirrorNative) => Promise<void>;
  /** Calls `listener` whenever the app's records change; returns how to stop. */
  readonly subscribe: (listener: () => void) => () => void;
}

export interface PhoneMirror {
  /** The state Réglages shows. */
  readonly useStatus: () => { readonly status: MirrorStatus; readonly working: boolean; readonly failed: boolean };
  /** Turns it on (asking Android) or off (the account and its rows removed); the status after. */
  turn(on: boolean): Promise<MirrorStatus>;
  /** Copies now, when on; one run at a time, and one more after if asked during it. */
  sync(): Promise<void>;
  /** Follows the records and the app's return to the front (a permission given in Android's settings), once. */
  start(): void;
}

/** A change of the records waits this long, so a burst (a sync's pull, an import) is copied once. */
const SETTLE_MS = 1500;

export function statusOf(available: boolean, state: Pick<MirrorState, 'wanted' | 'permitted'>): MirrorStatus {
  if (!available) return 'unavailable';
  if (!state.wanted) return 'off';
  return state.permitted ? 'on' : 'denied';
}

export function createPhoneMirror(config: PhoneMirrorConfig, native: PhoneMirrorNative | null = phoneMirrorNative): PhoneMirror {
  const wantedNow = (): boolean => readPreferences()[config.key] === true;
  // Set once the account is made: an account gone since was removed from Android's settings.
  const heldKey = `${config.key}.held`;
  const store = create<MirrorState>(() => ({ wanted: false, permitted: false, working: false, failed: false }));
  let read = false;
  const readWanted = (): void => {
    if (read) return;
    read = true;
    store.setState({ wanted: wantedNow() });
  };

  let running: Promise<void> | null = null;
  let again = false;

  const once = async (): Promise<void> => {
    if (!native) return;
    readWanted();
    const present = await native.isOn().catch(() => false);
    if (!store.getState().wanted) {
      // Off: nothing of the app's stays in the phone's (a preference lost with the app's data, too).
      if (present) await native.turnOff().catch(() => false);
      return;
    }
    if (!present && readPreferences()[heldKey] === true) {
      // The account was removed from Android's settings: the copy is off here too, never made again behind the person's back.
      writePreference(config.key, false);
      writePreference(heldKey, false);
      store.setState({ wanted: false, failed: false });
      return;
    }
    const permitted = await hasMirrorPermissions(config.permissions);
    store.setState({ permitted });
    if (!permitted) return;
    store.setState({ working: true });
    try {
      if (!(await native.turnOn(config.accountName))) throw new Error('account');
      if (readPreferences()[heldKey] !== true) writePreference(heldKey, true);
      await config.run(native);
      store.setState({ failed: false });
    } catch (error) {
      console.warn('phone mirror', error);
      store.setState({ failed: true });
    } finally {
      store.setState({ working: false });
    }
  };

  const sync = (): Promise<void> => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await once();
      } while (again);
    })().finally(() => {
      running = null;
    });
    return running;
  };

  const turn = async (on: boolean): Promise<MirrorStatus> => {
    readWanted();
    if (!native) return 'unavailable';
    if (on) {
      const answer = await askMirrorPermissions(config.permissions);
      writePreference(config.key, true);
      writePreference(heldKey, false);
      store.setState({ wanted: true, permitted: answer === 'granted' });
    } else {
      writePreference(config.key, false);
      writePreference(heldKey, false);
      store.setState({ wanted: false, failed: false });
    }
    await sync();
    return statusOf(true, store.getState());
  };

  let started = false;
  const start = (): void => {
    if (started || !native) return;
    started = true;
    readWanted();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const soon = (): void => {
      if (!store.getState().wanted) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void sync();
      }, SETTLE_MS);
    };
    config.subscribe(soon);
    AppState.addEventListener('change', next => {
      if (next === 'active') void sync();
    });
    void sync();
  };

  const useStatus = () => {
    const state = store();
    useEffect(readWanted, []);
    return { status: statusOf(native !== null, state), working: state.working, failed: state.failed };
  };

  return { useStatus, turn, sync, start };
}
