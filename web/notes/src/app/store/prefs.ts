/**
 * What this browser keeps of Carnet's own, in localStorage beside the shell's settings and never
 * synced: how the board lays out, and what it last heard from the server about links (whether
 * Claude reads them, Seerr's address), so a link saved offline is marked right away (the phone's
 * `reading`). Every access is guarded: blocked storage only means nothing is remembered.
 */
import { create } from 'zustand';

import { getStorageName } from '@shared/app/env';
import { useServerSettingsStore } from '@shared/app/store/serverSettings';
import { useSettingsStore } from '@shared/app/store/settings';

export type BoardLayout = 'wall' | 'list';

export interface NotesPrefs {
  readonly layout: BoardLayout;
  /** Whether the server reads links (a Claude key is set there), as last heard; null until known. */
  readonly reading: boolean | null;
  /** Seerr's address as the server last gave it ('' when not linked): its module shows on films and series. */
  readonly seerr: string;
}

const DEFAULTS: NotesPrefs = { layout: 'wall', reading: null, seerr: '' };

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
      reading: typeof stored.reading === 'boolean' ? stored.reading : null,
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
export const setReading = (reading: boolean | null): void => save({ reading });
export const setSeerrUrl = (seerr: string): void => save({ seerr });

export const useLayout = (): BoardLayout => usePrefsStore(s => s.layout);

/** Links get read: a server is connected and has not said it lacks a key (unknown counts as yes). */
export function canRead(): boolean {
  return useSettingsStore.getState().server !== null && usePrefsStore.getState().reading !== false;
}

export function useCanRead(): boolean {
  const connected = useSettingsStore(s => s.server !== null);
  const reading = usePrefsStore(s => s.reading);
  return connected && reading !== false;
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
 * What the server says, kept: its settings when they come (reading on or off, Seerr linked), its
 * health at a connection; another server forgets what this one said.
 */
export function followServer(): void {
  following?.();
  const unsubscribe = useServerSettingsStore.subscribe((state, before) => {
    if (state.settings && state.settings !== before.settings) {
      if (usePrefsStore.getState().reading !== state.settings.analysis.enabled) setReading(state.settings.analysis.enabled);
      if (usePrefsStore.getState().seerr !== state.settings.seerr.url) setSeerrUrl(state.settings.seerr.url);
    }
    if (state.health && state.health !== before.health && state.settings === null) setReading(state.health.analysis);
  });
  const forget = useSettingsStore.subscribe((state, before) => {
    if (state.server?.url !== before.server?.url) save({ reading: null, seerr: '' });
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
