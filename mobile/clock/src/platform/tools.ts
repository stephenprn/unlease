/**
 * The timers and the stopwatch as the engine runs them (`NativeAlarmEngine`'s tools, Kotlin in
 * `android/.../tools`): JavaScript asks, the engine keeps, arms, rings and notifies, and says every
 * change (`onTools`), wherever it was made (the app, a notification, a widget). Without the native
 * module (a test, another platform) nothing runs.
 */
import type { EventSubscription } from 'react-native';

import NativeAlarmEngine, { type ToolsState } from '../../../shared/specs/NativeAlarmEngine';

export type { ToolsState };

export type TimerAction = 'pause' | 'resume' | 'add' | 'reset' | 'delete' | 'stop';
export type StopwatchAction = 'start' | 'pause' | 'lap' | 'reset';

export const NO_TOOLS: ToolsState = { timers: '[]', stopwatch: '', now: 0 };

export async function readTools(): Promise<ToolsState> {
  if (!NativeAlarmEngine) return NO_TOOLS;
  try {
    return await NativeAlarmEngine.tools();
  } catch {
    return NO_TOOLS;
  }
}

export const startTimerRun = (run: string): void => NativeAlarmEngine?.startTimer(run);
export const timerAction = (id: string, action: TimerAction): void => NativeAlarmEngine?.timerAction(id, action);
export const stopRingingTimers = (): void => NativeAlarmEngine?.stopRingingTimers();
export const stopwatchAction = (action: StopwatchAction): void => NativeAlarmEngine?.stopwatchAction(action);

export function onTools(listener: (tools: ToolsState) => void): EventSubscription | null {
  return NativeAlarmEngine?.onTools(listener) ?? null;
}
