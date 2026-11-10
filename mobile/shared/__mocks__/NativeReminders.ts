/** The Reminders TurboModule under Jest: what Android answers, and what the app asked, in `state`. */
import type { RemindersHealth } from '../specs/NativeReminders';

export const state = {
  health: { notifications: true, exactAlarms: true, backgroundRestricted: false, unrestricted: false } as RemindersHealth,
  stopped: false,
  opened: [] as string[],
  fresh: null as number | null,
};

export function __reset(): void {
  state.health = { notifications: true, exactAlarms: true, backgroundRestricted: false, unrestricted: false };
  state.stopped = false;
  state.opened = [];
  state.fresh = null;
}

const NativeReminders = {
  health: async (): Promise<RemindersHealth> => state.health,
  stoppedBefore: async (): Promise<boolean> => state.stopped,
  open: async (what: string): Promise<boolean> => {
    state.opened.push(what);
    return true;
  },
  keepFresh: (minutes: number): void => {
    state.fresh = minutes;
  },
};

export default NativeReminders;
