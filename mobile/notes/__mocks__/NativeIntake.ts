/** The Intake TurboModule under Jest: a recorder driven through `state` and the `__` helpers. */
import type { SharedPayload } from '../specs/NativeIntake';

type Listener = (payload: SharedPayload) => void;

export const state = {
  pending: null as SharedPayload | null,
  clipboard: '',
  screenOn: false,
  listeners: [] as Listener[],
};

export function __reset(): void {
  state.pending = null;
  state.clipboard = '';
  state.screenOn = false;
  state.listeners = [];
}

export function __queueShare(payload: Partial<SharedPayload>): void {
  state.pending = { id: 'share-1', text: '', subject: '', files: [], mimeType: 'text/plain', ...payload };
}

export function __emitShare(payload: Partial<SharedPayload>): void {
  const full = { id: `share-${Date.now()}`, text: '', subject: '', files: [], mimeType: 'text/plain', ...payload };
  for (const listener of state.listeners) listener(full);
}

const NativeIntake = {
  takePendingShare: async (): Promise<SharedPayload> => {
    const share = state.pending ?? { id: '', text: '', subject: '', files: [], mimeType: '' };
    state.pending = null;
    return share;
  },
  readClipboardText: async (): Promise<string> => state.clipboard,
  writeClipboardText: async (text: string): Promise<boolean> => {
    state.clipboard = text;
    return true;
  },
  setKeepScreenOn: (on: boolean): void => {
    state.screenOn = on;
  },
  onShare: (listener: Listener) => {
    state.listeners.push(listener);
    return {
      remove: () => {
        state.listeners = state.listeners.filter(l => l !== listener);
      },
    };
  },
};

export default NativeIntake;
