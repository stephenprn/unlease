/**
 * What this browser keeps of Carnet's own, in localStorage beside the shell's settings and never
 * synced: how the board lays out, and Seerr's address as the server last gave it. Whether Claude
 * reads links is the suite's (`useServerFeature('claude')`, the device's settings), so a link saved
 * offline is marked right away (the phone's `reading`). Every access is guarded: blocked storage
 * only means nothing is remembered.
 */
import { create } from 'zustand';

import { getStorageName } from '@shared/app/env';
import { useServerSettingsStore } from '@shared/app/store/serverSettings';
import { setServerFeatures, useSettingsStore } from '@shared/app/store/settings';

export type BoardLayout = 'wall' | 'list';

export interface NotesPrefs {
  readonly layout: BoardLayout;
  /** Seerr's address as the server last gave it ('' when not linked): its module shows on films and series. */
  readonly seerr: string;
}

const DEFAULTS: NotesPrefs = { layout: 'wall', seerr: '' };

export const usePrefsStore = create<NotesPrefs>(() => DEFAULTS);

const storageKey = (): string => `${getStorageName()}.notes`;

export function loadPrefs(): void {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey()) ?? '{}');
    if (typeof parsed === 'object' && parsed !== null) stored = parsed as Record<string, unknown>;
  } catch {
    // Unreadable or blocked: the defaults.
  }
  usePrefsStore.setState(
    {
      layout: stored.layout === 'list' ? 'list' : 'wall',
      seerr: typeof stored.seerr === 'string' ? stored.seerr : '',
    },
    true,
  );
}

function save(patch: Partial<NotesPrefs>): void {
  usePrefsStore.setState(patch);
  try {
    localStorage.setItem(storageKey(), JSON.stringify(usePrefsStore.getState()));
  } catch {
    // Blocked storage: the choice holds for this visit only.
  }
}

export const setLayout = (layout: BoardLayout): void => save({ layout });
/** Whether the server reads links, as heard (null: not known); the suite's, every app's (`setServerFeatures`). */
export const setReading = (reading: boolean | null): void => setServerFeatures({ claude: reading });
export const setSeerrUrl = (seerr: string): void => save({ seerr });

export const useLayout = (): BoardLayout => usePrefsStore(s => s.layout);

/**
 * Links get read: a server is connected and has not said it lacks a key (unknown counts as yes, so a
 * link saved before it answers waits for it). What a link is marked as, never whether an entry to
 * Claude shows: that is `useServerFeature('claude')`, which waits for the server's word.
 */
export function canRead(): boolean {
  const { server, serverFeatures } = useSettingsStore.getState();
  return server !== null && serverFeatures.claude !== false;
}

export function useCanRead(): boolean {
  return useSettingsStore(s => s.server !== null && s.serverFeatures.claude !== false);
}

/** Seerr's address while a server is connected, '' otherwise. */
export function useSeerrUrl(): string {
  const connected = useSettingsStore(s => s.server !== null);
  const seerr = usePrefsStore(s => s.seerr);
  return connected ? seerr : '';
}

export const useSeerr = (): boolean => useSeerrUrl() !== '';

let following: (() => void) | null = null;

/**
 * What the server says, kept: Seerr's address when its settings come; another server forgets what
 * this one said. (Whether Claude reads links is kept by the shell, `setServerSettings`.)
 */
export function followServer(): void {
  following?.();
  const unsubscribe = useServerSettingsStore.subscribe((state, before) => {
    if (state.settings && state.settings !== before.settings && usePrefsStore.getState().seerr !== state.settings.seerr.url) setSeerrUrl(state.settings.seerr.url);
  });
  const forget = useSettingsStore.subscribe((state, before) => {
    if (state.server?.url !== before.server?.url) save({ seerr: '' });
  });
  following = () => {
    unsubscribe();
    forget();
  };
}

/** Test seam. */
export function resetPrefs(): void {
  usePrefsStore.setState(DEFAULTS, true);
}
