/** Clock's alarm engine under Jest: what Android answers, and what the app asked, in `state`. */
import type { AlarmHealth, ArmResult, PhoneSound, RingState, ToolsState, Whereabouts } from '../specs/NativeAlarmEngine';

const NONE: RingState = { state: 'none', id: '', at: 0, since: 0, until: 0, snoozes: 0, title: '', label: '' };

export const state = {
  plans: [] as string[],
  ring: NONE as RingState,
  calls: [] as string[],
  health: { notifications: true, exactAlarms: true, fullScreen: true, volume: 5, maxVolume: 7, backgroundRestricted: false, ringingChannel: true, alarmsMuted: false } as AlarmHealth,
  picked: { uri: '', name: '' } as PhoneSound,
  whereabouts: { found: false, lat: 0, lon: 0, at: 0 } as Whereabouts,
  listeners: new Set<(ring: RingState) => void>(),
  tools: { timers: '[]', stopwatch: '{"startedAt":null,"banked":0,"laps":[]}', now: 0 } as ToolsState,
  toolListeners: new Set<(tools: ToolsState) => void>(),
};

export function __reset(): void {
  state.plans = [];
  state.ring = NONE;
  state.calls = [];
  state.health = { notifications: true, exactAlarms: true, fullScreen: true, volume: 5, maxVolume: 7, backgroundRestricted: false, ringingChannel: true, alarmsMuted: false };
  state.picked = { uri: '', name: '' };
  state.whereabouts = { found: false, lat: 0, lon: 0, at: 0 };
  state.listeners.clear();
  state.tools = { timers: '[]', stopwatch: '{"startedAt":null,"banked":0,"laps":[]}', now: 0 };
  state.toolListeners.clear();
}

/** As the engine would: the timers or the stopwatch changed. */
export function __tools(next: Partial<ToolsState>): void {
  state.tools = { ...state.tools, ...next };
  for (const listener of state.toolListeners) listener(state.tools);
}

/** As the engine would: what rings changed. */
export function __ring(next: Partial<RingState>): void {
  state.ring = { ...NONE, ...next };
  for (const listener of state.listeners) listener(state.ring);
}

const NativeAlarmEngine = {
  setPlan: async (plan: string): Promise<ArmResult> => {
    state.plans.push(plan);
    const parsed = JSON.parse(plan) as { alarms: unknown[] };
    return { armed: parsed.alarms.length, next: 0, inexact: false };
  },
  ringing: async (): Promise<RingState> => state.ring,
  snooze: (): void => {
    state.calls.push('snooze');
  },
  stop: (): void => {
    state.calls.push('stop');
  },
  ringIn: (seconds: number, title: string, sound: string): void => {
    state.calls.push(`ringIn:${seconds}:${title}:${sound}`);
  },
  health: async (): Promise<AlarmHealth> => state.health,
  open: async (what: string): Promise<boolean> => {
    state.calls.push(`open:${what}`);
    return true;
  },
  preview: (sound: string): void => {
    state.calls.push(`preview:${sound}`);
  },
  stopPreview: (): void => {
    state.calls.push('stopPreview');
  },
  pickSound: async (): Promise<PhoneSound> => state.picked,
  whereabouts: async (): Promise<Whereabouts> => state.whereabouts,
  unlock: async (): Promise<boolean> => true,
  onRing: (listener: (ring: RingState) => void) => {
    state.listeners.add(listener);
    return { remove: () => state.listeners.delete(listener) };
  },
  tools: async (): Promise<ToolsState> => state.tools,
  startTimer: (run: string): void => {
    state.calls.push(`startTimer:${run}`);
  },
  timerAction: (id: string, action: string): void => {
    state.calls.push(`timer:${id}:${action}`);
  },
  stopRingingTimers: (): void => {
    state.calls.push('stopRingingTimers');
  },
  stopwatchAction: (action: string): void => {
    state.calls.push(`stopwatch:${action}`);
  },
  onTools: (listener: (tools: ToolsState) => void) => {
    state.toolListeners.add(listener);
    return { remove: () => state.toolListeners.delete(listener) };
  },
};

export default NativeAlarmEngine;
